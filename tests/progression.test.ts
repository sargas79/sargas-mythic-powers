import { describe, expect, it } from "vitest";
import {
  TIER_THRESHOLDS,
  lateStartCaughtUp,
  lateStartPending,
  lateStartSlotLevels,
  lockedSlotLevels,
  nextTier,
  openSlotLevels,
  slotLevel,
  standardSlotLevels,
  tierAboveHalfLevel,
  tierForTrials,
  tierSlotLevels,
  trialsToNextTier,
} from "../src/rules/progression.js";
import { applyDelta, clampPoints, killAwards, pointsAfter } from "../src/rules/awards.js";

describe("standard progression", () => {
  it("opens a slot at each even level", () => {
    expect(standardSlotLevels(1)).toEqual([]);
    expect(standardSlotLevels(7)).toEqual([2, 4, 6]);
    expect(standardSlotLevels(20)).toHaveLength(10);
  });
  it("parses slot ids", () => {
    expect(slotLevel("mythic-12")).toBe(12);
    expect(slotLevel("mythic-calling")).toBeNull();
  });
});

describe("trials and tiers", () => {
  it("uses the variant thresholds", () => {
    expect(TIER_THRESHOLDS).toEqual([1, 3, 5, 7, 9, 11, 14, 17, 20, 23, 27]);
  });
  it("maps trials to tiers", () => {
    expect(tierForTrials(0)).toBe(0);
    expect(tierForTrials(2)).toBe(0);
    expect(tierForTrials(3)).toBe(1);
    expect(tierForTrials(13)).toBe(5);
    expect(tierForTrials(14)).toBe(6);
    expect(tierForTrials(27)).toBe(10);
    expect(tierForTrials(99)).toBe(10);
  });
  it("counts trials to the next tier", () => {
    expect(trialsToNextTier(3, 1)).toBe(2);
    expect(trialsToNextTier(30, 10)).toBeNull();
  });
  it("raises at most one tier per session", () => {
    expect(nextTier({ currentTier: 1, trials: 9, session: 4, lastTierUpSession: 3 })).toEqual({
      tier: 2,
      raised: true,
      heldBack: true,
    });
    expect(nextTier({ currentTier: 2, trials: 9, session: 4, lastTierUpSession: 4 })).toEqual({
      tier: 2,
      raised: false,
      heldBack: true,
    });
    expect(nextTier({ currentTier: 2, trials: 5, session: 5, lastTierUpSession: 4 }).raised).toBe(false);
  });
  it("maps tiers to slots", () => {
    expect(tierSlotLevels(0)).toEqual([]);
    expect(tierSlotLevels(3)).toEqual([2, 4, 6]);
    expect(tierAboveHalfLevel(4, 7)).toBe(true);
    expect(tierAboveHalfLevel(3, 7)).toBe(false);
  });
});

describe("late start", () => {
  const state = { grantedLevel: 7, released: 1 };
  it("releases catch-up slots in order and keeps new ones open", () => {
    expect(lateStartSlotLevels(7, state)).toEqual([2]);
    expect(lateStartSlotLevels(8, state)).toEqual([2, 8]);
    expect(lateStartPending(state)).toBe(2);
    expect(lateStartCaughtUp({ grantedLevel: 7, released: 3 })).toBe(true);
  });
  it("locks the unreleased slots PF2e shows", () => {
    const input = { progression: "lateStart" as const, level: 8, tier: 0, lateStart: state };
    expect(openSlotLevels(input)).toEqual([2, 8]);
    expect(lockedSlotLevels(input)).toEqual([4, 6]);
    expect(lockedSlotLevels({ ...input, progression: "standard" })).toEqual([]);
  });
});

describe("mythic points", () => {
  it("clamps to 0..3", () => {
    expect(clampPoints(5)).toBe(3);
    expect(clampPoints(-2)).toBe(0);
    expect(applyDelta(2, 3)).toBe(3);
  });
  it("splits kill awards", () => {
    const m = killAwards("a", ["a", "b", "c"]);
    expect([...m.entries()]).toEqual([
      ["a", 2],
      ["b", 1],
      ["c", 1],
    ]);
    expect([...killAwards(null, ["b"]).values()]).toEqual([1]);
  });
  it("applies award kinds", () => {
    expect(pointsAfter("anathema", 3)).toBe(0);
    expect(pointsAfter("deed", 0)).toBe(3);
    expect(pointsAfter("edict", 1)).toBe(2);
    expect(pointsAfter("session", 0)).toBe(3);
    expect(pointsAfter("custom", 2, -1)).toBe(1);
  });
});
