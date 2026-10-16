/**
 * OWNER: agent F (M5). Trials, tiers and late-start release. GM only.
 * Decisions come from src/rules/progression-text.ts; this file applies them to the actor, the ledger and chat.
 */
import { TEMPLATE_PATH } from "../constants.js";
import { notify, t } from "../foundry/i18n.js";
import { appendLedger, type LedgerKind } from "../foundry/ledger.js";
import { currentSession } from "../foundry/session.js";
import { getPf2eMythicMode, getSetting } from "../foundry/settings.js";
import { lateStartOwed, maxFeatLevelForTier, tierAboveHalfLevel } from "../rules/progression.js";
import { applyTrial, releaseLateStartSlots } from "../rules/progression-text.js";
import { mythicTier, setMythicTier } from "../state/actor-mythic.js";
import { getState, isMythicActive, setState } from "../state/flags.js";

function requireGM(): boolean {
  if (game.user?.isGM) return true;
  notify.warn("errors.gmOnly");
  return false;
}

async function ledger(actor: ActorPF2e, kind: LedgerKind, message: string): Promise<void> {
  await appendLedger({ kind, actorUuid: actor.uuid ?? null, actorName: actor.name ?? null, message });
}

/** User ids that receive the card: the actor's owners and every GM. */
function ownerAndGMIds(actor: ActorPF2e): string[] {
  return (game.users?.contents ?? [])
    .filter((u: UserDoc) => u.isGM || actor.testUserPermission(u, "OWNER"))
    .map((u: UserDoc) => u.id);
}

/** Whispers a progression card (templates/progression-card.hbs) to the actor's owners and GMs. */
async function whisperCard(actor: ActorPF2e, title: string, body: string): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(
    `${TEMPLATE_PATH}/progression-card.hbs`,
    {
      title,
      body,
      whisperLabel: t("progression.card.whisper", { name: actor.name }),
    },
  );
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: ownerAndGMIds(actor),
  });
}

/** Sets the tier, records it, whispers the card and warns when the tier is above half the level. */
export async function raiseTier(actor: ActorPF2e, tier: number, session: number): Promise<void> {
  await setMythicTier(actor, tier);
  const state = getState(actor);
  await setState(actor, { trials: { ...state.trials, lastTierUpSession: session } });
  await ledger(actor, "tier", t("progression.ledger.tier", { name: actor.name, tier }));
  await whisperCard(
    actor,
    t("progression.card.tierTitle", { tier }),
    t("progression.card.tierBody", { name: actor.name, tier, level: maxFeatLevelForTier(tier) }),
  );
  notify.info("progression.notify.tierUp", { name: actor.name, tier });
  if (tierAboveHalfLevel(tier, Number(actor.level ?? 1))) {
    notify.warn("progression.notify.aboveHalfLevel", { name: actor.name, tier, level: actor.level });
  }
}

/** GM only. Logs a mythic trial for a character using the trials progression and raises the tier if earned. */
export async function logTrial(actor: ActorPF2e, note: string): Promise<void> {
  if (!requireGM()) return;
  if (!isMythicActive(actor)) {
    notify.warn("progression.notify.notActive", { name: actor?.name ?? "" });
    return;
  }
  const state = getState(actor);
  if (state.progression !== "trials") {
    notify.warn("progression.notify.notTrials", { name: actor.name });
    return;
  }
  if (getPf2eMythicMode() !== "variant-tiers") notify.warn("progression.notify.variantOff");

  const session = currentSession();
  const outcome = applyTrial({
    count: state.trials.count,
    log: state.trials.log,
    currentTier: mythicTier(actor),
    session,
    lastTierUpSession: state.trials.lastTierUpSession,
    entry: { at: Date.now(), note: String(note ?? "") },
  });
  await setState(actor, {
    trials: { count: outcome.count, log: outcome.log, lastTierUpSession: state.trials.lastTierUpSession },
  });
  const trimmed = String(note ?? "").trim();
  await ledger(
    actor,
    "trial",
    trimmed
      ? t("progression.ledger.trialNote", { name: actor.name, count: outcome.count, note: trimmed })
      : t("progression.ledger.trial", { name: actor.name, count: outcome.count }),
  );
  if (outcome.raised) await raiseTier(actor, outcome.tier, session);
  if (outcome.heldBack) notify.info("progression.notify.heldBack", { name: actor.name });
}

/** Releases up to `count` late-start catch-up slots (default: the per-session setting). */
export async function releaseLateStart(actor: ActorPF2e, count?: number): Promise<void> {
  if (!requireGM()) return;
  if (!isMythicActive(actor)) {
    notify.warn("progression.notify.notActive", { name: actor?.name ?? "" });
    return;
  }
  const state = getState(actor);
  if (state.progression !== "lateStart") {
    notify.warn("progression.notify.notLateStart", { name: actor.name });
    return;
  }
  const step = count ?? Number(getSetting("lateStartPerSession") ?? 1);
  const result = releaseLateStartSlots({
    grantedLevel: state.grantedLevel,
    released: state.lateStart.released,
    count: step,
  });
  if (result.alreadyCaughtUp) {
    notify.info("progression.notify.caughtUp", { name: actor.name });
    return;
  }
  if (result.opened === 0) return;
  await setState(actor, {
    lateStart: { released: result.released, lastReleaseSession: currentSession() },
  });
  const data = {
    name: actor.name,
    released: result.released,
    owed: lateStartOwed(state.grantedLevel).length,
  };
  await ledger(actor, "lateStart", t("progression.ledger.lateStart", data));
  await whisperCard(actor, t("progression.card.lateStartTitle"), t("progression.card.lateStartBody", data));
  if (result.caughtUp) notify.info("progression.notify.nowCaughtUp", { name: actor.name });
}
