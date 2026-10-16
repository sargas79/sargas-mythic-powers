/** Calling description parser, checked against all 18 Callings exported from pf2e.classfeatures (PF2e 8.5.1). */
import { describe, expect, it } from "vitest";
import data from "./fixtures/callings.json";
import { extractActions, htmlToText, parseCalling, stripEnrichers } from "../src/rules/callings.js";

interface Fixture {
  name: string;
  publication: string;
  description: string;
}
const callings = data as Fixture[];
const byName = (name: string): Fixture => callings.find((c) => c.name === name)!;

const EXPECTED_ACTIONS: Record<string, string[]> = {
  "Acrobat's Calling": ["Balance", "Maneuver in Flight", "Tumble Through", "Long Jump"],
  "Artisan's Calling": ["Craft", "Repair"],
  "Bookkeeper's Calling": ["Recall Knowledge", "Earn Income"],
  "Caretaker's Calling": ["Treat Disease", "Treat Poison", "Treat Wounds", "Battle Medicine"],
  "Demagogue's Calling": ["Coerce", "Make an Impression"],
  "Doomsayer's Calling": ["Repair", "Administer First Aid", "Treat Wounds"],
  "Dreamer's Calling": ["Recall Knowledge", "Craft"],
  "Echoes of the Scrolls": ["Decipher Writing", "Gather Information", "Recall Knowledge"],
  "Echoes of the Spells": ["Identify Magic", "Recall Knowledge", "Trick Magic Item"],
  "Echoes of the Swords": ["Climb", "Force Open", "High Jump", "Long Jump", "Swim"],
  "Guardian's Calling": ["Disarm", "Reposition", "Shove"],
  "Handler's Calling": ["Command an Animal"],
  "Hunter's Calling": ["Seek", "Track"],
  "Runelord's Calling": ["Identify Magic", "Learn a Spell", "Cast a ritual"],
  "Saga's Calling": ["Performance", "Gather Information"],
  "Sage's Calling": ["Recall Knowledge"],
  "Thespian's Calling": ["Perform", "Earn Income"],
  "Thief's Calling": ["Pick a Lock", "Steal"],
};

describe("fixture", () => {
  it("has the 18 compendium Callings", () => {
    expect(callings).toHaveLength(18);
    expect(new Set(callings.map((c) => c.name))).toEqual(new Set(Object.keys(EXPECTED_ACTIONS)));
  });
});

describe("parseCalling on every compendium Calling", () => {
  for (const calling of callings) {
    describe(calling.name, () => {
      const parsed = parseCalling(calling.description);
      const echoes = calling.name.startsWith("Echoes of");

      it("extracts the mythic proficiency actions", () => {
        expect(parsed.actionsText).toMatch(/^When you .*mythic proficiency\.$/);
        expect(parsed.actions).toEqual(EXPECTED_ACTIONS[calling.name]);
      });

      it("extracts the daily regain sentence", () => {
        expect(parsed.regain).toMatch(/^The first time each day .*you regain a Mythic Point\.$/);
      });

      it(echoes ? "has no edicts or anathema" : "extracts edicts and anathema", () => {
        if (echoes) {
          expect(parsed.edicts).toBe("");
          expect(parsed.anathema).toBe("");
        } else {
          expect(parsed.edicts.length).toBeGreaterThan(10);
          expect(parsed.anathema.length).toBeGreaterThan(10);
          expect(parsed.edicts).not.toMatch(/Anathema|<|@UUID/);
          expect(parsed.anathema).not.toMatch(/Edicts|<|@UUID/);
        }
      });

      it("has a flavour summary without enrichers or tags", () => {
        expect(parsed.summary.length).toBeGreaterThan(10);
        for (const text of [parsed.summary, parsed.actionsText, parsed.regain]) {
          expect(text).not.toMatch(/@UUID|\[\[|<\/?\w/);
        }
      });
    });
  }
});

describe("details", () => {
  it("reads Sage's Calling", () => {
    const p = parseCalling(byName("Sage's Calling").description);
    expect(p.edicts).toBe(
      "Preserve your knowledge for future generations, seek out lost knowledge in dangerous or forgotten places",
    );
    expect(p.anathema).toBe(
      "Destroy books or other repositories of knowledge, lie to hide knowledge from the world",
    );
    expect(p.regain).toContain("Recall Knowledge check against an enemy creature");
  });

  it("strips @UUID enrichers to their label", () => {
    expect(stripEnrichers("When you @UUID[Compendium.pf2e.actionspf2e.Item.x]{Seek} or Track")).toBe(
      "When you Seek or Track",
    );
    expect(stripEnrichers("a check to [[/act gather-information]]")).toBe("a check to Gather Information");
    expect(stripEnrichers("see @UUID[Compendium.pf2e.x.Item.y].")).toBe("see .");
  });

  it("converts HTML to text", () => {
    expect(htmlToText("<p>A&nbsp;b &amp; c</p><p>d</p>")).toBe("A b & c d");
  });

  it("handles a sentence without the actions phrase", () => {
    expect(extractActions("You regain a Mythic Point.")).toEqual([]);
  });

  it("returns empty parts for empty input", () => {
    expect(parseCalling("")).toEqual({
      summary: "",
      actionsText: "",
      actions: [],
      regain: "",
      edicts: "",
      anathema: "",
    });
  });
});
