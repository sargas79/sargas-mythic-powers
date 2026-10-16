/**
 * OWNER: agent Y. Mythic Points of mythic NPCs (docs/mythic-npcs.md, feature 2): read, spend, set and reset
 * `system.resources.mythicPoints`, find mythic NPCs in the active combat, the Undying Myth hand-off with the
 * mythic kill prompt, and the Mythic Console's Encounter section. GM only: callers run on a GM client.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { t } from "../foundry/i18n.js";
import { appendLedger } from "../foundry/ledger.js";
import { getSetting } from "../foundry/settings.js";
import { pipStates, pipTarget } from "../rules/console.js";
import {
  abilityKeyOf,
  clampNpcPoints,
  hasAbility,
  isMythicNpcData,
  pointsAfterSpend,
  type NpcAbilityKey,
} from "../rules/npc-mythic.js";

/** Default max when PF2e has not prepared the resource. */
const DEFAULT_MAX = 3;

/** An NPC with the `mythic` trait (same test as agent X's npc-template service). */
export function isMythicNpc(actor: ActorPF2e | null | undefined): boolean {
  return !!actor && isMythicNpcData(actor.type, actor.system?.traits?.value);
}

function items(actor: ActorPF2e): any[] {
  return actor?.items?.contents ?? Array.from(actor?.items ?? []);
}

/** Mythic ability items of the actor, in sheet order. */
export function npcAbilityItems(actor: ActorPF2e): any[] {
  return items(actor).filter((i) => abilityKeyOf(i) !== null);
}

export function hasNpcAbility(actor: ActorPF2e, key: NpcAbilityKey): boolean {
  return isMythicNpc(actor) && hasAbility(items(actor), key);
}

export function npcPoints(actor: ActorPF2e): { value: number; max: number } {
  const res = actor?.system?.resources?.mythicPoints ?? {};
  const max = Number(res.max ?? DEFAULT_MAX) || DEFAULT_MAX;
  return { value: clampNpcPoints(Number(res.value ?? 0), max), max };
}

async function writePoints(actor: ActorPF2e, value: number): Promise<void> {
  await actor.update({ "system.resources.mythicPoints.value": value });
}

/** Spends one point and logs it. False (nothing changed) when the NPC has none left. */
export async function spendNpcPoint(actor: ActorPF2e, reason: string): Promise<boolean> {
  const before = npcPoints(actor).value;
  const after = pointsAfterSpend(before);
  if (after === null) return false;
  await writePoints(actor, after);
  await appendLedger({
    kind: "points",
    actorUuid: actor.uuid,
    actorName: actor.name,
    message: t("npcMythic.ledger.spent", { name: actor.name, reason, before, after }),
    pointsBefore: before,
    pointsAfter: after,
  });
  return true;
}

/** Sets the points (clamped to [0, max]) and logs the change. */
export async function setNpcPoints(actor: ActorPF2e, n: number, reason?: string): Promise<void> {
  const { value: before, max } = npcPoints(actor);
  const after = clampNpcPoints(n, max);
  if (after === before) return;
  await writePoints(actor, after);
  await appendLedger({
    kind: "points",
    actorUuid: actor.uuid,
    actorName: actor.name,
    message: t("npcMythic.ledger.set", {
      name: actor.name,
      before,
      after,
      reason: reason ?? t("npcMythic.reason.set"),
    }),
    pointsBefore: before,
    pointsAfter: after,
  });
}

/** Back to max. */
export async function resetNpcPoints(actor: ActorPF2e, reason?: string): Promise<void> {
  await setNpcPoints(actor, npcPoints(actor).max, reason ?? t("npcMythic.reason.reset"));
}

/** Mythic NPC actors in a combat (default: the active one), one entry per actor. */
export function mythicNpcCombatants(combat: any = game.combat): ActorPF2e[] {
  const seen = new Set<string>();
  const out: ActorPF2e[] = [];
  for (const c of combat?.combatants?.contents ?? []) {
    const actor = c.actor;
    if (!isMythicNpc(actor) || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    out.push(actor);
  }
  return out;
}

/* ---------------- Undying Myth and the mythic kill prompt ---------------- */

/** Actor uuids whose mythic kill prompt waits for the GM's Undying Myth answer. */
const deferredKills = new Set<string>();

/** Undying Myth could save this creature right now (setting on, ability owned, ≥ 1 point). */
export function undyingAvailable(actor: ActorPF2e): boolean {
  return !!getSetting("undyingPrompt") && hasNpcAbility(actor, "undying") && npcPoints(actor).value >= 1;
}

/**
 * Called by the mythic kill feature when a mythic NPC drops: true means "don't prompt now", the npc-mythic
 * feature asks about Undying Myth first and calls the kill prompt when the GM lets the creature fall.
 */
export function deferKillForUndying(actor: ActorPF2e): boolean {
  if (!undyingAvailable(actor)) return false;
  deferredKills.add(actor.uuid);
  return true;
}

/** True (once) when a kill prompt was waiting for this actor. */
export function takeDeferredKill(uuid: string): boolean {
  return deferredKills.delete(uuid);
}

/* ---------------- Mythic Console: Encounter section ---------------- */

/** Context for the console's Encounter section, or null when there is nothing to show. */
export function encounterSection(): Record<string, unknown> | null {
  const combat = game.combat;
  if (!combat) return null;
  const actors = mythicNpcCombatants(combat);
  if (actors.length === 0) return null;
  return {
    title: t("npcMythic.console.title"),
    cols: {
      creature: t("npcMythic.console.creature"),
      points: t("npcMythic.console.points"),
      abilities: t("npcMythic.console.abilities"),
    },
    rows: actors.map((actor) => {
      const { value, max } = npcPoints(actor);
      const label = t("npcMythic.console.pointsLabel", { value, max });
      return {
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img,
        levelLabel: t("npcMythic.console.level", { level: Number(actor.level ?? 0) }),
        pips: pipStates(value, max),
        pointsLabel: label,
        abilities: npcAbilityItems(actor).map((i) => String(i.name ?? "")),
        noAbilities: t("npcMythic.console.noAbilities"),
      };
    }),
  };
}

/** Console pip click on an Encounter row (`data-npc-uuid`, `data-value`). */
export async function onEncounterPip(target: HTMLElement): Promise<void> {
  const uuid = target.closest<HTMLElement>("[data-npc-uuid]")?.dataset.npcUuid;
  const actor = uuid ? fromUuidSync(uuid) : null;
  if (!isMythicNpc(actor)) return;
  const current = npcPoints(actor).value;
  const next = pipTarget(current, Number(target.dataset.value ?? 0));
  if (next !== current) await setNpcPoints(actor, next);
}
