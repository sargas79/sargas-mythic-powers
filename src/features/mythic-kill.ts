/**
 * OWNER: agent E. Feature "mythic-kill" (#18). When an NPC with the `mythic` trait drops from above 0 HP to
 * 0 HP during combat, the active GM gets a whispered card suggesting the kill award (2 for the last blow,
 * 1 for every other active mythic character). Nothing is applied until the GM clicks Award.
 */
import { MODULE_ID } from "../constants.js";
import { esc, notify, t } from "../foundry/i18n.js";
import { getSetting } from "../foundry/settings.js";
import { isActiveGM } from "../foundry/socket.js";
import { ASSIST_AWARD, KILLER_AWARD } from "../rules/awards.js";
import { activeMythicCharacters, awardKill } from "../services/points.js";
import { isMythicActive } from "../state/flags.js";
import {
  CARD_FLAG,
  bindButtons,
  cardFlag,
  gmIds,
  removeButtons,
  renderCard,
  rootElement,
  updateCard,
  type CardFlag,
  type Doc,
} from "./automation-cards.js";
import type { Feature } from "./types.js";

const TEMPLATE = "kill-card";
/** How far back (ms) chat messages are searched for the last blow. */
const LAST_BLOW_WINDOW = 30_000;
/** Delay so PF2e's "damage taken" message (posted after the HP update) exists before we look. */
const LAST_BLOW_DELAY = 750;

/** Actor uuids of mythic NPCs already prompted for this defeat (cleared when HP rises above 0). */
const defeated = new Set<string>();

interface KillFlag extends CardFlag {
  kind: "kill";
  status: "pending" | "awarded" | "ignored";
  defeatedName: string;
  defeatedUuid: string;
  killerUuid: string | null;
}

function hp(actor: ActorPF2e): number {
  return Number(actor?.system?.attributes?.hp?.value ?? 0);
}

function isMythicNpc(actor: ActorPF2e): boolean {
  if (actor?.type !== "npc") return false;
  const traits: string[] = actor.system?.traits?.value ?? [];
  return traits.includes("mythic");
}

function inCombat(actor: ActorPF2e): boolean {
  const combatants = game.combat?.combatants;
  if (!combatants) return false;
  return combatants.some(
    (c: Doc) => c.actor?.uuid === actor.uuid || (!!actor.token && c.tokenId === actor.token.id),
  );
}

/** Character credited for damage dealt by `actor` (a familiar or eidolon credits its master). */
function creditedCharacter(actor: ActorPF2e | null): ActorPF2e | null {
  if (!actor) return null;
  const candidate = actor.type === "character" ? actor : (actor.master ?? null);
  return candidate && isMythicActive(candidate) ? candidate : null;
}

function resolveActor(uuid: unknown): ActorPF2e | null {
  if (typeof uuid !== "string" || !uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    return doc?.documentName === "Actor" ? doc : (doc?.actor ?? null);
  } catch {
    return null;
  }
}

function isSameActor(a: ActorPF2e | null, b: ActorPF2e): boolean {
  return !!a && (a === b || a.uuid === b.uuid);
}

/**
 * Last blow from recent PF2e messages, newest first: a "damage-taken" message on the defeated actor (its
 * origin is the attacker's item) or a "damage-roll" message targeting it (its speaker is the attacker).
 */
export function findLastBlow(target: ActorPF2e): ActorPF2e | null {
  const messages: Doc[] = game.messages?.contents ?? [];
  const now = Date.now();
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (now - Number(message.timestamp ?? 0) > LAST_BLOW_WINDOW) break;
    const pf2e = message.flags?.pf2e ?? {};
    const type = pf2e.context?.type;
    if (type === "damage-taken") {
      if (!isSameActor(message.actor, target)) continue;
      const origin = resolveActor(pf2e.origin?.actor ?? pf2e.context?.origin?.actor);
      if (origin) return creditedCharacter(origin);
    } else if (type === "damage-roll") {
      const targeted =
        message.target?.actor ?? resolveActor(pf2e.context?.target?.actor ?? pf2e.context?.target?.token);
      if (!isSameActor(targeted, target)) continue;
      return creditedCharacter(message.actor ?? resolveActor(pf2e.origin?.actor));
    }
  }
  return null;
}

async function cardData(flag: KillFlag): Promise<Record<string, unknown>> {
  const killer = resolveActor(flag.killerUuid);
  const others = activeMythicCharacters().filter((a) => !killer || a.uuid !== killer.uuid);
  const name = `<b>${esc(flag.defeatedName)}</b> <span class="smp-trait">${esc(t("mythic"))}</span>`;
  const otherNames = others.map((a) => esc(a.name)).join(", ") || esc(t("automation.kill.nobody"));
  return {
    whisper: t("automation.whisperGM"),
    title: t("automation.kill.title"),
    body: t("automation.kill.body", { name }),
    killerLine: killer
      ? t("automation.kill.killer", { name: `<b>${esc(killer.name)}</b>`, points: KILLER_AWARD })
      : t("automation.kill.noKiller"),
    othersLine: t("automation.kill.others", { names: otherNames, points: ASSIST_AWARD }),
    pending: flag.status === "pending",
    status: flag.status,
    statusText: flag.status === "awarded" ? t("automation.kill.awarded") : t("automation.kill.ignored"),
    labels: {
      award: t("automation.kill.award"),
      change: t("automation.kill.change"),
      ignore: t("automation.kill.ignore"),
    },
  };
}

async function promptKill(actor: ActorPF2e): Promise<void> {
  const killer = findLastBlow(actor);
  const flag: KillFlag = {
    kind: "kill",
    status: "pending",
    defeatedName: actor.name,
    defeatedUuid: actor.uuid,
    killerUuid: killer?.uuid ?? null,
  };
  await ChatMessage.create({
    content: await renderCard(TEMPLATE, await cardData(flag)),
    speaker: ChatMessage.getSpeaker({ alias: t("automation.kill.speaker") }),
    whisper: gmIds(),
    flags: { [MODULE_ID]: { [CARD_FLAG]: flag } },
  });
}

function onUpdateActor(actor: ActorPF2e, changes: Record<string, unknown>): void {
  if (!isActiveGM() || !getSetting("killPrompt")) return;
  if (actor?.type !== "npc") return;
  if (foundry.utils.getProperty(changes ?? {}, "system.attributes.hp.value") === undefined) return;
  const key = actor.uuid;
  if (hp(actor) > 0) {
    defeated.delete(key);
    return;
  }
  if (defeated.has(key) || !isMythicNpc(actor) || !inCombat(actor)) return;
  defeated.add(key);
  setTimeout(() => {
    promptKill(actor).catch((error) => notify.error("automation.kill.failed", {}, error));
  }, LAST_BLOW_DELAY);
}

async function award(message: Doc, flag: KillFlag, killerUuid: string | null): Promise<void> {
  const killer = resolveActor(killerUuid);
  await awardKill(killer && isMythicActive(killer) ? killer : null, flag.defeatedName);
  const next: KillFlag = { ...flag, killerUuid: killer?.uuid ?? null, status: "awarded" };
  await updateCard(message, TEMPLATE, await cardData(next), next);
}

async function chooseKiller(flag: KillFlag): Promise<string | null | undefined> {
  const options = activeMythicCharacters()
    .map((a) => {
      const selected = a.uuid === flag.killerUuid ? " selected" : "";
      return `<option value="${esc(a.uuid)}"${selected}>${esc(a.name)}</option>`;
    })
    .join("");
  const content = `<div class="form-group"><label>${esc(t("automation.kill.killerLabel"))}</label>
    <div class="form-fields"><select name="killer"><option value="">${esc(t("automation.kill.none"))}</option>${options}</select></div></div>`;
  const result = await foundry.applications.api.DialogV2.input({
    window: { title: t("automation.kill.change") },
    content,
    ok: { label: t("automation.kill.award") },
  });
  if (!result) return undefined;
  return result.killer ? String(result.killer) : null;
}

async function onButton(message: Doc, action: string): Promise<void> {
  const flag = cardFlag(message) as KillFlag | null;
  if (!flag || flag.kind !== "kill" || flag.status !== "pending" || !game.user.isGM) return;
  try {
    if (action === "award") await award(message, flag, flag.killerUuid);
    else if (action === "change") {
      const choice = await chooseKiller(flag);
      if (choice !== undefined) await award(message, flag, choice);
    } else if (action === "ignore") {
      const next: KillFlag = { ...flag, status: "ignored" };
      await updateCard(message, TEMPLATE, await cardData(next), next);
    }
  } catch (error) {
    notify.error("automation.kill.failed", {}, error);
  }
}

function onRender(message: Doc, html: unknown): void {
  const flag = cardFlag(message);
  if (flag?.kind !== "kill") return;
  const root = rootElement(html);
  if (!root) return;
  if (!game.user.isGM) {
    removeButtons(root);
    return;
  }
  bindButtons(root, (action) => onButton(message, action));
}

export const feature: Feature = {
  id: "mythic-kill",
  register() {
    Hooks.on("updateActor", onUpdateActor);
    Hooks.on("renderChatMessageHTML", onRender);
  },
  ready() {
    // Creatures already down when the world loads don't prompt again until healed above 0 HP.
    for (const combat of game.combats?.contents ?? []) {
      for (const c of combat.combatants?.contents ?? []) {
        if (c.actor && hp(c.actor) <= 0) defeated.add(c.actor.uuid);
      }
    }
  },
};
