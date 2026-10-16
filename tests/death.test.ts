import { describe, expect, it } from "vitest";
import { MYTHIC_DEATH_DOOMED, mythicDeathDecision } from "../src/rules/death.js";

describe("mythic death", () => {
  it("does nothing below the dying maximum", () => {
    expect(mythicDeathDecision({ dyingNew: 3, dyingMax: 4, doomed: 0 })).toEqual({
      intercept: false,
      newDoomed: 0,
    });
  });

  it("dying 4 becomes doomed 1", () => {
    expect(mythicDeathDecision({ dyingNew: 4, dyingMax: 4, doomed: 0 })).toEqual({
      intercept: true,
      newDoomed: 1,
    });
  });

  it("uses the doomed-reduced maximum", () => {
    expect(mythicDeathDecision({ dyingNew: 3, dyingMax: 3, doomed: 1 })).toEqual({
      intercept: true,
      newDoomed: 2,
    });
    expect(mythicDeathDecision({ dyingNew: 2, dyingMax: 2, doomed: 2 })).toEqual({
      intercept: true,
      newDoomed: 3,
    });
  });

  it("overshooting the maximum is still intercepted", () => {
    expect(mythicDeathDecision({ dyingNew: 5, dyingMax: 4, doomed: 0 }).intercept).toBe(true);
  });

  it("doomed reaching 4 dies normally", () => {
    expect(MYTHIC_DEATH_DOOMED).toBe(4);
    expect(mythicDeathDecision({ dyingNew: 1, dyingMax: 1, doomed: 3 })).toEqual({
      intercept: false,
      newDoomed: 3,
    });
  });
});
