/** Mythic feat eligibility rules, checked against feats exported from the PF2e 8.5.1 feats pack. */
import { describe, expect, it } from "vitest";
import {
  REASON,
  WARNING,
  checkEligibility,
  classifyPrerequisite,
  type CharacterSnapshot,
  type FeatRecord,
} from "../src/rules/eligibility.js";
import { slotId } from "../src/rules/progression.js";
import feats from "./fixtures/mythic-feats.json";

const ALL = feats as FeatRecord[];

function feat(name: string): FeatRecord {
  const f = ALL.find((x) => x.name === name);
  if (!f) throw new Error(`fixture missing ${name}`);
  return f;
}

function snap(patch: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  return {
    level: 20,
    progression: "standard",
    tier: 0,
    callingName: "Sage's Calling",
    ownedFeatNames: [],
    ownedDestiny: null,
    hasAnimalCompanion: false,
    hasConstructCompanion: false,
    canCastFromSlots: false,
    openSlotLevels: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
    lockedSlotLevels: [],
    ...patch,
  };
}

const slot = (level: number) => ({ id: slotId(level), level });
const keys = (r: { reasons: { key: string }[] }) => r.reasons.map((x) => x.key);

describe("fixture", () => {
  it("has every mythic feat and the 13 destiny dedications", () => {
    expect(ALL.length).toBeGreaterThanOrEqual(234);
    expect(ALL.every((f) => f.traits.includes("mythic"))).toBe(true);
    expect(ALL.filter((f) => f.traits.includes("destiny"))).toHaveLength(13);
  });
});

describe("basic rules", () => {
  it("accepts a mythic feat with no prerequisites at its level", () => {
    const r = checkEligibility(feat("Prescience"), slot(4), snap());
    expect(r).toEqual({ eligible: true, owned: false, reasons: [], warnings: [] });
  });

  it("requires the mythic trait", () => {
    const r = checkEligibility({ ...feat("Prescience"), traits: ["general"] }, slot(4), snap());
    expect(keys(r)).toContain(REASON.notMythic);
  });

  it("rejects feats above the slot level and accepts lower ones", () => {
    const f = feat("Prescience");
    expect(keys(checkEligibility(f, slot(2), snap()))).toEqual([REASON.levelTooHigh]);
    expect(checkEligibility(f, slot(6), snap()).eligible).toBe(true);
  });

  it("uses slot level 2n for trials (tier n)", () => {
    const s = snap({ progression: "trials", tier: 2, openSlotLevels: [2, 4] });
    expect(checkEligibility(feat("Prescience"), slot(4), s).eligible).toBe(true);
    expect(keys(checkEligibility(feat("Prescience"), slot(6), s))).toContain(REASON.slotNotOpen);
  });

  it("rejects feats already owned and flags them as owned", () => {
    const r = checkEligibility(feat("Prescience"), slot(4), snap({ ownedFeatNames: ["prescience"] }));
    expect(r.eligible).toBe(false);
    expect(r.owned).toBe(true);
    expect(keys(r)).toEqual([REASON.owned]);
  });

  it("rejects locked slots (late start)", () => {
    const s = snap({ progression: "lateStart", openSlotLevels: [10], lockedSlotLevels: [2, 4, 6, 8] });
    expect(keys(checkEligibility(feat("Prescience"), slot(4), s))).toEqual([REASON.slotLocked]);
  });

  it("rejects slots that aren't open yet", () => {
    const s = snap({ level: 4, openSlotLevels: [2, 4] });
    expect(keys(checkEligibility(feat("Prescience"), slot(6), s))).toEqual([REASON.slotNotOpen]);
  });

  it("rejects malformed slots", () => {
    expect(keys(checkEligibility(feat("Prescience"), { id: "x", level: NaN }, snap()))).toContain(
      REASON.invalidSlot,
    );
  });
});

describe("destiny", () => {
  it("slot 12 only takes destiny dedications", () => {
    expect(keys(checkEligibility(feat("Prescience"), slot(12), snap()))).toEqual([REASON.destinySlotOnly]);
    expect(checkEligibility(feat("Godling Dedication"), slot(12), snap()).eligible).toBe(true);
  });

  it("every destiny dedication is level 12 and fits slot 12 with no other prerequisites", () => {
    const s = snap({ canCastFromSlots: true, hasAnimalCompanion: true });
    for (const d of ALL.filter((f) => f.traits.includes("destiny"))) {
      expect(checkEligibility(d, slot(12), s).eligible, d.name).toBe(true);
    }
  });

  it("allows only one destiny", () => {
    const s = snap({ ownedDestiny: "Godling Dedication", ownedFeatNames: ["godling dedication"] });
    const r = checkEligibility(feat("Timewracked Dedication"), slot(14), s);
    expect(keys(r)).toEqual([REASON.oneDestiny]);
    expect(r.reasons[0]!.data).toEqual({ name: "Godling Dedication" });
  });

  it("from 14th level a slot can take a destiny dedication or a lower-level mythic feat", () => {
    expect(checkEligibility(feat("Godling Dedication"), slot(14), snap()).eligible).toBe(true);
    expect(checkEligibility(feat("Prescience"), slot(14), snap()).eligible).toBe(true);
  });

  it("destiny follow-up feats need their dedication", () => {
    const f = feat("Chosen Ward");
    const r = checkEligibility(f, slot(14), snap());
    expect(keys(r)).toEqual([REASON.needsDestiny]);
    expect(r.reasons[0]!.data).toEqual({ name: "Beast Lord Dedication" });
    const owner = snap({ ownedDestiny: "Beast Lord Dedication", ownedFeatNames: ["beast lord dedication"] });
    expect(checkEligibility(f, slot(14), owner).eligible).toBe(true);
    const other = snap({ ownedDestiny: "Godling Dedication", ownedFeatNames: ["godling dedication"] });
    expect(checkEligibility(f, slot(14), other).eligible).toBe(false);
  });

  it("a follow-up feat that also needs another feat checks both", () => {
    const s = snap({
      ownedDestiny: "Ascended Celestial Dedication",
      ownedFeatNames: ["ascended celestial dedication"],
    });
    const r = checkEligibility(feat("Army of One"), slot(18), s);
    expect(keys(r)).toEqual([REASON.needsFeat]);
    expect(r.reasons[0]!.data).toEqual({ name: "Celestial Armaments" });
    const s2 = { ...s, ownedFeatNames: [...s.ownedFeatNames, "celestial armaments"] };
    expect(checkEligibility(feat("Army of One"), slot(18), s2).eligible).toBe(true);
  });
});

describe("prerequisites", () => {
  it("Read the Wind needs Hunter's Calling", () => {
    const f = feat("Read the Wind");
    const r = checkEligibility(f, slot(4), snap());
    expect(keys(r)).toEqual([REASON.needsCalling]);
    expect(r.reasons[0]!.data).toEqual({ name: "Hunter's Calling" });
    expect(checkEligibility(f, slot(4), snap({ callingName: "Hunter’s Calling" })).eligible).toBe(true);
    expect(checkEligibility(f, slot(4), snap({ callingName: null })).eligible).toBe(false);
  });

  it("Storied Companion needs Handler's Calling; a missing companion is only a GM warning", () => {
    const f = feat("Storied Companion");
    expect(keys(checkEligibility(f, slot(2), snap()))).toEqual([REASON.needsCalling]);
    const handler = snap({ callingName: "Handler's Calling" });
    const noPet = checkEligibility(f, slot(2), handler);
    expect(noPet.eligible).toBe(true);
    expect(noPet.warnings.map((w) => w.key)).toEqual([WARNING.checkPrerequisite]);
    expect(checkEligibility(f, slot(2), { ...handler, hasAnyCompanion: true }).warnings).toEqual([]);
    expect(checkEligibility(f, slot(2), { ...handler, hasAnimalCompanion: true }).eligible).toBe(true);
  });

  it("Beast Lord Dedication warns when no mature or advanced companion is detected", () => {
    const f = feat("Beast Lord Dedication");
    const none = checkEligibility(f, slot(12), snap());
    expect(none.eligible).toBe(true);
    expect(none.warnings.map((w) => w.key)).toEqual([WARNING.checkPrerequisite]);
    expect(checkEligibility(f, slot(12), snap({ hasAnimalCompanion: true })).warnings).toEqual([]);
    expect(checkEligibility(f, slot(12), snap({ hasConstructCompanion: true })).warnings).toEqual([]);
  });

  it("Wildspell Dedication needs slot casting", () => {
    const f = feat("Wildspell Dedication");
    expect(keys(checkEligibility(f, slot(12), snap()))).toEqual([REASON.needsSlotCasting]);
    expect(checkEligibility(f, slot(12), snap({ canCastFromSlots: true })).eligible).toBe(true);
  });

  it("Mythic Counterspell needs a feat, slot casting and Sage's Calling", () => {
    const f = feat("Mythic Counterspell");
    const r = checkEligibility(f, slot(6), snap({ callingName: "Hunter's Calling" }));
    expect(keys(r)).toEqual([REASON.needsFeat, REASON.needsSlotCasting, REASON.needsCalling]);
    const ok = snap({ ownedFeatNames: ["quick recognition"], canCastFromSlots: true });
    expect(checkEligibility(f, slot(6), ok).eligible).toBe(true);
  });

  it("a mythic feat chain needs the earlier feat (Steal Magic)", () => {
    expect(keys(checkEligibility(feat("Steal Magic"), slot(8), snap()))).toEqual([REASON.needsFeat]);
    const s = snap({ ownedFeatNames: ["mythic counterspell"] });
    expect(checkEligibility(feat("Steal Magic"), slot(8), s).eligible).toBe(true);
  });

  it("'X or Y' Calling prerequisites accept either Calling", () => {
    const f = feat("Cutting Rebuke");
    expect(checkEligibility(f, slot(f.level), snap({ callingName: "Thespian's Calling" })).eligible).toBe(
      true,
    );
    expect(checkEligibility(f, slot(f.level), snap({ callingName: "Demagogue's Calling" })).eligible).toBe(
      true,
    );
    expect(keys(checkEligibility(f, slot(f.level), snap()))).toEqual([REASON.needsCalling]);
  });

  it("matches Calling names case-insensitively (guardian's Calling)", () => {
    const f = feat("Windborne Shove");
    expect(checkEligibility(f, slot(f.level), snap({ callingName: "Guardian's Calling" })).eligible).toBe(
      true,
    );
  });

  it("unknown prerequisite text is eligible with a warning for the GM", () => {
    const f = feat("Terrifying Mien");
    const s = snap({
      ownedDestiny: "Eternal Legend Dedication",
      ownedFeatNames: ["eternal legend dedication"],
    });
    const r = checkEligibility(f, slot(f.level), s);
    expect(r.eligible).toBe(true);
    expect(r.warnings).toEqual([
      { key: WARNING.checkPrerequisite, data: { text: "master in Intimidation" } },
    ]);
  });

  it("focus pool: warning when unknown, checked when known", () => {
    const f = feat("Mythic Refocus");
    const s = slot(f.level);
    expect(checkEligibility(f, s, snap()).warnings).toHaveLength(1);
    expect(keys(checkEligibility(f, s, snap({ hasFocusPool: false })))).toEqual([REASON.needsFocusPool]);
    const ok = checkEligibility(f, s, snap({ hasFocusPool: true }));
    expect(ok.eligible && ok.warnings.length === 0).toBe(true);
  });

  it("uses a known feat name list when given", () => {
    const known = new Set(["quick recognition"]);
    expect(classifyPrerequisite("Quick Recognition", { knownFeatNames: known })).toBe("feat");
    expect(classifyPrerequisite("Hero-God Accomplishment", { knownFeatNames: known })).toBe("unknown");
    expect(classifyPrerequisite("Hero-God Accomplishment")).toBe("feat");
  });

  it("classifies every prerequisite in the pack", () => {
    const seen = new Map<string, string>();
    for (const f of ALL) for (const p of f.prerequisites) seen.set(p, classifyPrerequisite(p));
    expect(seen.get("Hunter's Calling")).toBe("calling");
    expect(seen.get("guardian's Calling")).toBe("calling");
    expect(seen.get("Demagogue's Calling or Thespian's Calling")).toBe("calling");
    expect(seen.get("Apocalypse Rider Dedication")).toBe("dedication");
    expect(seen.get("a mature animal companion or an advanced construct companion")).toBe(
      "advancedCompanion",
    );
    expect(seen.get("you have an animal companion or pet")).toBe("anyCompanion");
    expect(seen.get("ability to cast spells from slots")).toBe("slotCasting");
    expect(seen.get("ability to cast spells from spell slots")).toBe("slotCasting");
    expect(seen.get("You have a focus pool.")).toBe("focusPool");
    expect(seen.get("Celestial Armaments")).toBe("feat");
    expect(seen.get("master in Stealth")).toBe("unknown");
    expect(seen.get("familiar or nimble or savage animal companion")).toBe("unknown");
    expect(seen.get("hero-god accomplishment")).toBe("unknown");
  });

  it("a fully built character can take something in every open slot", () => {
    const s = snap({ callingName: "Hunter's Calling" });
    for (const level of [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]) {
      expect(
        ALL.some((f) => checkEligibility(f, slot(level), s).eligible),
        `slot ${level}`,
      ).toBe(true);
    }
  });
});
