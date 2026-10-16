/**
 * Pure decisions for mythic trials and late-start pacing (agent F). No Foundry globals, so it is unit tested.
 * The services in src/services/progression-service.ts apply these decisions to actors.
 */
import { lateStartOwed, MAX_TIER, nextTier, tierForTrials, type Progression } from "./progression.js";

export interface TrialEntry {
  at: number;
  note: string;
}

export interface TrialOutcome {
  /** Trial count after this trial. */
  count: number;
  log: TrialEntry[];
  /** Tier to store (unchanged when not raised). */
  tier: number;
  raised: boolean;
  /** The trial count allows a higher tier than `tier`, but only one tier rises per session. */
  heldBack: boolean;
  /** lastTierUpSession to store. */
  lastTierUpSession: number | null;
}

/** Adds one trial and decides the tier, applying the one-tier-per-session limit. */
export function applyTrial(args: {
  count: number;
  log: TrialEntry[];
  currentTier: number;
  session: number;
  lastTierUpSession: number | null;
  entry: TrialEntry;
}): TrialOutcome {
  const count = Math.max(0, Math.trunc(args.count)) + 1;
  const log = [...args.log, { at: args.entry.at, note: args.entry.note.trim() }];
  const next = nextTier({
    currentTier: args.currentTier,
    trials: count,
    session: args.session,
    lastTierUpSession: args.lastTierUpSession,
  });
  return {
    count,
    log,
    tier: next.tier,
    raised: next.raised,
    heldBack: next.heldBack,
    lastTierUpSession: next.raised ? args.session : args.lastTierUpSession,
  };
}

/** True when the trial count already earns a tier above the current one (held back by the session limit). */
export function hasHeldBackTier(trials: number, currentTier: number): boolean {
  return currentTier < MAX_TIER && tierForTrials(trials) > currentTier;
}

export interface LateStartRelease {
  /** Catch-up slots owed at grant time. */
  owed: number;
  /** Released count after this release. */
  released: number;
  /** Slots opened by this release. */
  opened: number;
  /** Nothing was left to release before this call. */
  alreadyCaughtUp: boolean;
  caughtUp: boolean;
}

/** Releases up to `count` catch-up slots: released = min(owed, released + count). */
export function releaseLateStartSlots(args: {
  grantedLevel: number;
  released: number;
  count: number;
}): LateStartRelease {
  const owed = lateStartOwed(args.grantedLevel).length;
  const before = Math.min(owed, Math.max(0, Math.trunc(args.released)));
  const step = Math.max(0, Math.trunc(args.count));
  const released = Math.min(owed, before + step);
  return {
    owed,
    released,
    opened: released - before,
    alreadyCaughtUp: before >= owed,
    caughtUp: released >= owed,
  };
}

export interface SessionStartInput {
  progression: Progression;
  session: number;
  grantedLevel: number;
  lateStart: { released: number; lastReleaseSession: number | null };
  trials: { count: number; lastTierUpSession: number | null };
  tier: number;
}

export interface SessionStartPlan {
  /** Release late-start catch-up slots this session. */
  releaseLateStart: boolean;
  /** Tier to raise to (one step), or null. */
  raiseTierTo: number | null;
}

/** What Start Session does for one active mythic character. */
export function sessionStartPlan(input: SessionStartInput): SessionStartPlan {
  const plan: SessionStartPlan = { releaseLateStart: false, raiseTierTo: null };
  if (input.progression === "lateStart") {
    const owed = lateStartOwed(input.grantedLevel).length;
    plan.releaseLateStart =
      input.lateStart.lastReleaseSession !== input.session && input.lateStart.released < owed;
  } else if (input.progression === "trials" && hasHeldBackTier(input.trials.count, input.tier)) {
    const next = nextTier({
      currentTier: input.tier,
      trials: input.trials.count,
      session: input.session,
      lastTierUpSession: input.trials.lastTierUpSession,
    });
    if (next.raised) plan.raiseTierTo = next.tier;
  }
  return plan;
}
