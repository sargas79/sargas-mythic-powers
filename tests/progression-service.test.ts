/** Tests for the trial, tier and late-start decisions in src/rules/progression-text.ts. */
import { describe, expect, it } from "vitest";
import {
  applyTrial,
  hasHeldBackTier,
  releaseLateStartSlots,
  sessionStartPlan,
  type SessionStartInput,
} from "../src/rules/progression-text.js";
import { TIER_THRESHOLDS } from "../src/rules/progression.js";

const entry = { at: 1, note: "  Defeated the herald  " };

describe("applyTrial", () => {
  it("appends the note and counts the trial", () => {
    const out = applyTrial({ count: 1, log: [], currentTier: 0, session: 3, lastTierUpSession: null, entry });
    expect(out.count).toBe(2);
    expect(out.log).toEqual([{ at: 1, note: "Defeated the herald" }]);
  });
  it("raises one tier when the threshold is met", () => {
    const out = applyTrial({ count: 2, log: [], currentTier: 0, session: 3, lastTierUpSession: null, entry });
    expect(out.count).toBe(TIER_THRESHOLDS[1]);
    expect(out).toMatchObject({ tier: 1, raised: true, heldBack: false, lastTierUpSession: 3 });
  });
  it("holds the tier back when it already rose this session", () => {
    const out = applyTrial({ count: 4, log: [], currentTier: 1, session: 3, lastTierUpSession: 3, entry });
    expect(out).toMatchObject({ tier: 1, raised: false, heldBack: true, lastTierUpSession: 3 });
  });
  it("does not raise below the threshold", () => {
    const out = applyTrial({ count: 3, log: [], currentTier: 1, session: 4, lastTierUpSession: 3, entry });
    expect(out).toMatchObject({ tier: 1, raised: false, heldBack: false });
  });
  it("raises only one tier when several are earned", () => {
    const out = applyTrial({ count: 10, log: [], currentTier: 1, session: 5, lastTierUpSession: 2, entry });
    expect(out).toMatchObject({ tier: 2, raised: true, heldBack: true });
  });
});

describe("hasHeldBackTier", () => {
  it("compares the earned tier with the current tier", () => {
    expect(hasHeldBackTier(5, 1)).toBe(true);
    expect(hasHeldBackTier(5, 2)).toBe(false);
    expect(hasHeldBackTier(999, 10)).toBe(false);
  });
});

describe("releaseLateStartSlots", () => {
  it("releases up to the owed count", () => {
    expect(releaseLateStartSlots({ grantedLevel: 7, released: 0, count: 1 })).toEqual({
      owed: 3,
      released: 1,
      opened: 1,
      alreadyCaughtUp: false,
      caughtUp: false,
    });
    expect(releaseLateStartSlots({ grantedLevel: 7, released: 2, count: 5 })).toMatchObject({
      released: 3,
      opened: 1,
      caughtUp: true,
    });
  });
  it("reports already caught up", () => {
    expect(releaseLateStartSlots({ grantedLevel: 7, released: 3, count: 1 })).toMatchObject({
      released: 3,
      opened: 0,
      alreadyCaughtUp: true,
    });
    expect(releaseLateStartSlots({ grantedLevel: 1, released: 0, count: 1 })).toMatchObject({
      owed: 0,
      alreadyCaughtUp: true,
    });
  });
});

function input(patch: Partial<SessionStartInput>): SessionStartInput {
  return {
    progression: "standard",
    session: 5,
    grantedLevel: 7,
    lateStart: { released: 0, lastReleaseSession: null },
    trials: { count: 1, lastTierUpSession: null },
    tier: 0,
    ...patch,
  };
}

describe("sessionStartPlan", () => {
  it("does nothing for standard progression", () => {
    expect(sessionStartPlan(input({}))).toEqual({ releaseLateStart: false, raiseTierTo: null });
  });
  it("releases late start once per session until caught up", () => {
    expect(sessionStartPlan(input({ progression: "lateStart" })).releaseLateStart).toBe(true);
    expect(
      sessionStartPlan(input({ progression: "lateStart", lateStart: { released: 1, lastReleaseSession: 5 } }))
        .releaseLateStart,
    ).toBe(false);
    expect(
      sessionStartPlan(input({ progression: "lateStart", lateStart: { released: 3, lastReleaseSession: 4 } }))
        .releaseLateStart,
    ).toBe(false);
  });
  it("raises a held-back tier by one", () => {
    const plan = sessionStartPlan(
      input({ progression: "trials", trials: { count: 7, lastTierUpSession: 4 }, tier: 1 }),
    );
    expect(plan.raiseTierTo).toBe(2);
  });
  it("does not raise twice in one session or without trials", () => {
    expect(
      sessionStartPlan(input({ progression: "trials", trials: { count: 7, lastTierUpSession: 5 }, tier: 1 }))
        .raiseTierTo,
    ).toBeNull();
    expect(
      sessionStartPlan(input({ progression: "trials", trials: { count: 3, lastTierUpSession: 4 }, tier: 1 }))
        .raiseTierTo,
    ).toBeNull();
  });
});
