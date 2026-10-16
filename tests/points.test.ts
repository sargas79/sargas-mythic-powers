/** Award math (issue #16) and the pure Mythic Console helpers in src/rules/console.ts. */
import { describe, expect, it } from "vitest";
import { killAwards, pointsAfter } from "../src/rules/awards.js";
import {
  distinctSources,
  heroPointsAfter,
  initials,
  pipStates,
  pipTarget,
  signedDelta,
  trialProgress,
  undoableEntryId,
} from "../src/rules/console.js";

describe("award math", () => {
  it("session start sets everyone to 3", () => {
    expect(pointsAfter("session", 0)).toBe(3);
    expect(pointsAfter("session", 3)).toBe(3);
  });
  it("edict +1 and deed +3 never pass 3", () => {
    expect(pointsAfter("edict", 1)).toBe(2);
    expect(pointsAfter("edict", 3)).toBe(3);
    expect(pointsAfter("deed", 1)).toBe(3);
  });
  it("anathema loses all", () => {
    expect(pointsAfter("anathema", 3)).toBe(0);
  });
  it("custom changes clamp to 0..3", () => {
    expect(pointsAfter("custom", 2, -5)).toBe(0);
    expect(pointsAfter("custom", 0, 2)).toBe(2);
    expect(pointsAfter("custom", 2, 4)).toBe(3);
  });
  it("kill gives 2 to the killer and 1 to the others", () => {
    const awards = killAwards("a", ["a", "b", "c"]);
    expect(awards.get("a")).toBe(2);
    expect(awards.get("b")).toBe(1);
    expect(pointsAfter("kill", 2)).toBe(3);
    expect(pointsAfter("killAssist", 0)).toBe(1);
  });
  it("kill with no (or a non-mythic) killer gives 1 to everyone", () => {
    expect([...killAwards(null, ["a", "b"]).values()]).toEqual([1, 1]);
    expect([...killAwards("x", ["a", "b"]).values()]).toEqual([1, 1]);
  });
});

describe("console helpers", () => {
  it("builds pips and toggles the top pip off", () => {
    expect(pipStates(2).map((p) => p.on)).toEqual([true, true, false]);
    expect(pipTarget(2, 2)).toBe(1);
    expect(pipTarget(2, 3)).toBe(3);
    expect(pipTarget(0, 1)).toBe(1);
  });
  it("formats signed deltas", () => {
    expect(signedDelta(1, 2)).toBe("+1");
    expect(signedDelta(3, 0)).toBe("-3");
    expect(signedDelta(3, 3)).toBe("±0");
  });
  it("measures progress toward the next tier", () => {
    // Tier 3 starts at 7 trials, tier 4 at 9.
    expect(trialProgress(8, 3)).toEqual({ tier: 3, done: 1, span: 2, percent: 50, nextTier: 4 });
    expect(trialProgress(0, 0).done).toBe(0);
    expect(trialProgress(40, 10).nextTier).toBeNull();
  });
  it("adds Hero Points up to 3", () => {
    expect(heroPointsAfter(1)).toBe(2);
    expect(heroPointsAfter(3)).toBeNull();
    expect(heroPointsAfter(0, 0)).toBeNull();
  });
  it("only the newest live points entry with a before value is undoable", () => {
    expect(
      undoableEntryId([
        { id: "s", kind: "session" },
        { id: "p2", kind: "points", pointsBefore: 1 },
        { id: "p1", kind: "points", pointsBefore: 0 },
      ]),
    ).toBe("p2");
    expect(
      undoableEntryId([
        { id: "p2", kind: "points", pointsBefore: 1, undone: true },
        { id: "p1", kind: "points", pointsBefore: 0 },
      ]),
    ).toBe("p1");
    expect(
      undoableEntryId([
        { id: "r", kind: "points" },
        { id: "p1", kind: "points", pointsBefore: 0 },
      ]),
    ).toBeNull();
    expect(undoableEntryId([])).toBeNull();
  });
  it("makes initials and distinct sources", () => {
    expect(initials("Amiri")).toBe("AM");
    expect(initials("Seoni of Varisia")).toBe("SO");
    expect(distinctSources(["b", "a", "", "b"])).toEqual(["a", "b"]);
  });
});
