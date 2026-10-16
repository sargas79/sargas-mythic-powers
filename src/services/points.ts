/**
 * OWNER: agent D (M3). Mythic Point changes with ledger entries. GM only (players reach these via runAsGM).
 * Inactive (never granted or disabled) characters never receive points.
 */
import { appendLedger } from "../foundry/ledger.js";
import { notify, t } from "../foundry/i18n.js";
import { advanceSession } from "../foundry/session.js";
import { getSetting } from "../foundry/settings.js";
import { awardHeroPoints } from "../features/hero-points.js";
import { KILLER_AWARD, MAX_MYTHIC_POINTS, killAwards, pointsAfter, type AwardKind } from "../rules/awards.js";
import { signedDelta } from "../rules/console.js";
import { mythicPoints, setMythicPoints } from "../state/actor-mythic.js";
import { isCharacter, isMythicActive } from "../state/flags.js";

function requireGM(): boolean {
  if (game.user?.isGM) return true;
  notify.warn("errors.gmOnly");
  return false;
}

/** Localized default reason for a change kind ("edict", "mythic deed", …). */
export function reasonFor(kind: AwardKind): string {
  return t(`console.reason.${kind}`);
}

/**
 * Applies one award kind to one character and logs it. Returns the new value, or null when nothing happened
 * (not GM, or the actor has no active mythic power).
 */
export async function applyPoints(
  actor: ActorPF2e,
  kind: AwardKind,
  options: { custom?: number; reason?: string } = {},
): Promise<number | null> {
  if (!requireGM()) return null;
  if (!actor || !isMythicActive(actor)) return null;
  const before = mythicPoints(actor).value;
  const after = pointsAfter(kind, before, options.custom ?? 0);
  if (after !== before) await setMythicPoints(actor, after);
  await appendLedger({
    kind: "points",
    actorUuid: actor.uuid ?? null,
    actorName: actor.name ?? null,
    message: t("console.ledger.points", {
      name: actor.name,
      delta: signedDelta(before, after),
      reason: options.reason || reasonFor(kind),
    }),
    pointsBefore: before,
    pointsAfter: after,
  });
  return after;
}

export async function changePoints(
  actor: ActorPF2e,
  kind: AwardKind,
  options: { custom?: number; reason?: string } = {},
): Promise<void> {
  await applyPoints(actor, kind, options);
}

/** Every enabled mythic character to 3, advances the session counter. */
export async function startSession(): Promise<void> {
  if (!requireGM()) return;
  const session = await advanceSession();
  const actors = activeMythicCharacters();
  for (const actor of actors) {
    if (mythicPoints(actor).value !== MAX_MYTHIC_POINTS)
      await setMythicPoints(actor, pointsAfter("session", 0));
  }
  await appendLedger({
    kind: "session",
    actorUuid: null,
    actorName: null,
    message: t("console.ledger.session", { session, count: actors.length }),
  });
}

/** +3 to every enabled mythic character. */
export async function awardDeed(reason?: string): Promise<void> {
  if (!requireGM()) return;
  const why = reason?.trim() ? t("console.reason.deedNamed", { reason: reason.trim() }) : reasonFor("deed");
  for (const actor of activeMythicCharacters()) await applyPoints(actor, "deed", { reason: why });
  await maybeHeroPoints();
}

/** 2 to the killer (if mythic), 1 to every other enabled mythic character. */
export async function awardKill(killer: ActorPF2e | null, defeatedName: string): Promise<void> {
  if (!requireGM()) return;
  const actors = activeMythicCharacters();
  const awards = killAwards(
    killer?.id ?? null,
    actors.map((a) => a.id),
  );
  const name = defeatedName?.trim() || t("console.kill.unknownFoe");
  for (const actor of actors) {
    const isKiller = awards.get(actor.id) === KILLER_AWARD;
    await applyPoints(actor, isKiller ? "kill" : "killAssist", {
      reason: t(isKiller ? "console.reason.killNamed" : "console.reason.killAssistNamed", { name }),
    });
  }
  await maybeHeroPoints();
}

async function maybeHeroPoints(): Promise<void> {
  let mixed = false;
  try {
    mixed = !!getSetting("heroPointsMixed");
  } catch {
    mixed = false;
  }
  if (mixed) await awardHeroPoints();
}

/** Actors that count as mythic party members: characters with active mythic power. */
export function activeMythicCharacters(): ActorPF2e[] {
  return (game.actors?.contents ?? []).filter((a: ActorPF2e) => isCharacter(a) && isMythicActive(a));
}
