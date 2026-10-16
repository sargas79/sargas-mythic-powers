/**
 * Mythic progression rules (War of Immortals pg. 76-77 and the Alternate Mythic Progression variant).
 * Pure functions: no Foundry globals.
 *
 * PF2e slot ids: "mythic-calling", then "mythic-2" … "mythic-20". In tier mode PF2e labels slot
 * "mythic-<2n>" as tier n and hides slots whose tier is above `flags.pf2e.featLimits.mythic`.
 */

export type Progression = "standard" | "lateStart" | "trials";

export const MYTHIC_SLOT_LEVELS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20] as const;
export const DESTINY_LEVEL = 12;
export const MAX_TIER = 10;

export function slotId(level: number): string {
  return `mythic-${level}`;
}

export function slotLevel(id: string): number | null {
  const m = /^mythic-(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** Even-level mythic slots a character of `level` has under standard progression. */
export function standardSlotLevels(level: number): number[] {
  return MYTHIC_SLOT_LEVELS.filter((l) => l <= level);
}

/**
 * Cumulative trials needed to reach each tier: tier 0 after the first trial, two trials per tier for 1-5,
 * three per tier for 6-9, four for tier 10.
 */
export const TIER_THRESHOLDS: readonly number[] = (() => {
  const out = [1];
  for (let tier = 1; tier <= MAX_TIER; tier++) {
    const step = tier <= 5 ? 2 : tier <= 9 ? 3 : 4;
    out.push(out[tier - 1]! + step);
  }
  return out;
})();

/** Highest tier reached with `trials` completed trials. Granted characters are at least tier 0. */
export function tierForTrials(trials: number): number {
  let tier = 0;
  for (let t = 0; t <= MAX_TIER; t++) if (trials >= TIER_THRESHOLDS[t]!) tier = t;
  return tier;
}

/** Trials still needed to reach the next tier, or null at tier 10. */
export function trialsToNextTier(trials: number, tier: number): number | null {
  if (tier >= MAX_TIER) return null;
  return Math.max(0, TIER_THRESHOLDS[tier + 1]! - trials);
}

/**
 * Tier after logging trials, applying the "no more than one tier per session" guidance.
 * Returns the tier to store and whether the trial count would allow more (held back).
 */
export function nextTier(args: {
  currentTier: number;
  trials: number;
  session: number;
  lastTierUpSession: number | null;
}): { tier: number; raised: boolean; heldBack: boolean } {
  const target = tierForTrials(args.trials);
  if (target <= args.currentTier) return { tier: args.currentTier, raised: false, heldBack: false };
  if (args.lastTierUpSession !== null && args.lastTierUpSession === args.session) {
    return { tier: args.currentTier, raised: false, heldBack: true };
  }
  const tier = args.currentTier + 1;
  return { tier, raised: true, heldBack: target > tier };
}

/** Tier above half the character's level makes them very strong (variant rules guidance). */
export function tierAboveHalfLevel(tier: number, level: number): boolean {
  return tier > Math.floor(level / 2);
}

/** Highest mythic feat level allowed by tier (twice the tier). */
export function maxFeatLevelForTier(tier: number): number {
  return tier * 2;
}

/** Slot levels open in tier mode: slot mythic-<2n> for tiers 1..tier. */
export function tierSlotLevels(tier: number): number[] {
  return MYTHIC_SLOT_LEVELS.filter((l) => l / 2 <= tier);
}

export interface LateStartState {
  /** Character level when mythic power was granted. */
  grantedLevel: number;
  /** Catch-up slots released so far. */
  released: number;
}

/** Catch-up slots owed at grant time: every even slot level at or below the grant level. */
export function lateStartOwed(grantedLevel: number): number[] {
  return standardSlotLevels(grantedLevel);
}

/** Open slot levels for a late-start character: released catch-up slots plus every slot gained since. */
export function lateStartSlotLevels(level: number, state: LateStartState): number[] {
  const owed = lateStartOwed(state.grantedLevel);
  const released = owed.slice(0, Math.max(0, state.released));
  const gained = MYTHIC_SLOT_LEVELS.filter((l) => l > state.grantedLevel && l <= level);
  return [...released, ...gained].sort((a, b) => a - b);
}

export function lateStartCaughtUp(state: LateStartState): boolean {
  return state.released >= lateStartOwed(state.grantedLevel).length;
}

/** Catch-up slots still locked. */
export function lateStartPending(state: LateStartState): number {
  return Math.max(0, lateStartOwed(state.grantedLevel).length - state.released);
}

export interface ProgressionInput {
  progression: Progression;
  level: number;
  tier: number;
  lateStart: LateStartState;
}

/** Slot levels the character may fill now. */
export function openSlotLevels(input: ProgressionInput): number[] {
  switch (input.progression) {
    case "trials":
      return tierSlotLevels(input.tier);
    case "lateStart":
      return lateStartSlotLevels(input.level, input.lateStart);
    default:
      return standardSlotLevels(input.level);
  }
}

/** Slot levels PF2e shows but the module locks (late start catch-up not yet released). */
export function lockedSlotLevels(input: ProgressionInput): number[] {
  if (input.progression !== "lateStart") return [];
  const open = new Set(openSlotLevels(input));
  return standardSlotLevels(input.level).filter((l) => !open.has(l));
}
