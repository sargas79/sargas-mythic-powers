import { describe, expect, it } from "vitest";
import {
  CALLING_REGAIN,
  callingSlug,
  hasRegainEntry,
  regainMatches,
  worldDateKey,
  type RegainContext,
} from "../src/rules/calling-actions.js";

const CALLINGS = [
  "Acrobat's Calling",
  "Runelord's Calling",
  "Artisan's Calling",
  "Saga's Calling",
  "Thespian's Calling",
  "Doomsayer's Calling",
  "Dreamer's Calling",
  "Echoes of the Scrolls",
  "Guardian's Calling",
  "Sage's Calling",
  "Bookkeeper's Calling",
  "Thief's Calling",
  "Echoes of the Spells",
  "Echoes of the Swords",
  "Handler's Calling",
  "Demagogue's Calling",
  "Caretaker's Calling",
  "Hunter's Calling",
];

function ctx(options: string[], extra: Partial<RegainContext> = {}): RegainContext {
  return { outcome: "criticalSuccess", rollOptions: options, targetIsEnemy: null, inCombat: false, ...extra };
}

describe("calling regain table", () => {
  it("covers all 18 Callings by slug", () => {
    const slugs = CALLINGS.map(callingSlug);
    expect(slugs).toContain("sages-calling");
    expect(slugs).toContain("echoes-of-the-scrolls");
    for (const s of slugs) expect(hasRegainEntry(s), s).toBe(true);
    expect(Object.keys(CALLING_REGAIN)).toHaveLength(18);
  });

  it("ignores unknown or homebrew Callings", () => {
    expect(hasRegainEntry("homebrew-calling")).toBe(false);
    expect(regainMatches("homebrew-calling", ctx(["action:recall-knowledge"]))).toBeNull();
  });

  it("needs a critical success", () => {
    const c = ctx(["action:treat-wounds"], { outcome: "success" });
    expect(regainMatches("caretakers-calling", c)).toBeNull();
    expect(regainMatches("caretakers-calling", ctx(["action:treat-wounds"]))).toEqual({
      action: "treat-wounds",
      needsGM: false,
      gmNote: null,
    });
  });

  it("Sage's: Recall Knowledge against an enemy", () => {
    const o = ["action:recall-knowledge", "check:statistic:arcana"];
    expect(regainMatches("sages-calling", ctx(o, { targetIsEnemy: true }))?.needsGM).toBe(false);
    expect(regainMatches("sages-calling", ctx(o, { targetIsEnemy: false }))).toBeNull();
    expect(regainMatches("sages-calling", ctx(o))?.needsGM).toBe(true);
    expect(regainMatches("sages-calling", ctx(["action:seek"], { targetIsEnemy: true }))).toBeNull();
  });

  it("Hunter's: Seek or Track a hostile creature", () => {
    expect(regainMatches("hunters-calling", ctx(["action:track"], { targetIsEnemy: true }))?.action).toBe(
      "track",
    );
    expect(regainMatches("hunters-calling", ctx(["action:seek"], { targetIsEnemy: false }))).toBeNull();
  });

  it("Guardian's: Disarm, Reposition, Shove", () => {
    for (const a of ["disarm", "reposition", "shove"]) {
      expect(
        regainMatches("guardians-calling", ctx([`action:${a}`], { targetIsEnemy: true })),
      ).not.toBeNull();
    }
    expect(regainMatches("guardians-calling", ctx(["action:trip"], { targetIsEnemy: true }))).toBeNull();
  });

  it("Acrobat's: only in combat, Acrobatics", () => {
    const o = ["action:tumble-through", "check:statistic:acrobatics"];
    expect(regainMatches("acrobats-calling", ctx(o))).toBeNull();
    expect(regainMatches("acrobats-calling", ctx(o, { inCombat: true }))).not.toBeNull();
    expect(regainMatches("acrobats-calling", ctx([...o, "encounter"]))).not.toBeNull();
    expect(
      regainMatches(
        "acrobats-calling",
        ctx(["action:balance", "check:statistic:athletics"], { inCombat: true }),
      ),
    ).toBeNull();
  });

  it("Runelord's: Identify Magic with the four skills", () => {
    const ok = ["action:identify-magic", "check:statistic:occultism"];
    const bad = ["action:identify-magic", "check:statistic:crafting"];
    expect(regainMatches("runelords-calling", ctx(ok))).not.toBeNull();
    expect(regainMatches("runelords-calling", ctx(bad))).toBeNull();
  });

  it("matches action variants", () => {
    expect(
      regainMatches("echoes-of-the-swords", ctx(["action:climb:extreme", "check:statistic:athletics"])),
    ).not.toBeNull();
  });

  it("marks unverifiable conditions for the GM", () => {
    expect(regainMatches("bookkeepers-calling", ctx(["action:recall-knowledge"]))).toEqual({
      action: "recall-knowledge",
      needsGM: true,
      gmNote: "library",
    });
    expect(regainMatches("dreamers-calling", ctx(["action:craft"]))?.needsGM).toBe(false);
    expect(regainMatches("dreamers-calling", ctx(["action:recall-knowledge"]))?.gmNote).toBe("dreams");
    expect(regainMatches("handlers-calling", ctx(["action:command-an-animal"]))?.needsGM).toBe(true);
  });

  it("Thief's: Pick a Lock any time, Steal only from enemies", () => {
    expect(regainMatches("thiefs-calling", ctx(["action:pick-a-lock"]))?.needsGM).toBe(false);
    expect(regainMatches("thiefs-calling", ctx(["action:steal"], { targetIsEnemy: false }))).toBeNull();
  });

  it("Demagogue's: Coerce a non-ally", () => {
    expect(regainMatches("demagogues-calling", ctx(["action:coerce"], { targetIsAlly: true }))).toBeNull();
    expect(
      regainMatches("demagogues-calling", ctx(["action:coerce"], { targetIsAlly: false }))?.needsGM,
    ).toBe(false);
    expect(regainMatches("demagogues-calling", ctx(["action:coerce"]))?.needsGM).toBe(true);
  });
});

describe("worldDateKey", () => {
  it("prefers the world clock ISO date", () => {
    expect(worldDateKey("4725-03-14", 0)).toBe("4725-03-14");
  });
  it("falls back to the day number", () => {
    expect(worldDateKey(null, 86400 * 3 + 5)).toBe("day-3");
    expect(worldDateKey("bad", 10)).toBe("day-0");
  });
});
