/** Make Mythic NPC template: level steps, choice resolution and item builders (glossary items from PF2e 8.5.1). */
import { describe, expect, it } from "vitest";
import data from "./fixtures/npc-abilities.json";
import {
  ABILITY_IDS,
  buildAbilityItem,
  defaultChoices,
  formatAbilityName,
  mythicOriginOptions,
  resistanceDefinition,
  resolveChoices,
  resistanceValue,
  savesByModifier,
  spellImmunityDefinition,
  strikeImmunityDefinition,
  templateSteps,
  type GlossaryItemSource,
  type NpcSnapshot,
  type RuleSource,
  type TemplateChoices,
} from "../src/rules/npc-template.js";

const glossary = data as unknown as Record<string, GlossaryItemSource>;
const src = (id: string): GlossaryItemSource => glossary[id]!;

const snap = (extra: Partial<NpcSnapshot> = {}): NpcSnapshot => ({
  saves: { fortitude: 10, reflex: 14, will: 12 },
  skills: { athletics: 12, stealth: 15, intimidation: 9 },
  hasSpellcasting: false,
  ...extra,
});

const ids = (level: number) => templateSteps(level).map((s) => s.id);
const keys = (level: number, choices: TemplateChoices = {}, s = snap()) =>
  resolveChoices(level, choices, s).abilities.map((a) => a.key);

describe("fixture", () => {
  it("has all 11 glossary abilities", () => {
    for (const id of Object.values(ABILITY_IDS)) expect(glossary[id], id).toBeDefined();
    expect(Object.keys(glossary)).toHaveLength(11);
  });
});

describe("templateSteps", () => {
  it("level 0 and below qualify for nothing", () => {
    expect(templateSteps(0)).toEqual([]);
    expect(templateSteps(-1)).toEqual([]);
  });
  it("lists steps by level", () => {
    expect(ids(1)).toEqual(["l1"]);
    expect(ids(4)).toEqual(["l1", "l4"]);
    expect(ids(7)).toEqual(["l1", "l4", "l7"]);
    expect(ids(12)).toEqual(["l1", "l4", "l7", "l10"]);
    expect(ids(13)).toEqual(["l1", "l4", "l7", "l10", "l13"]);
    expect(ids(20)).toEqual(["l1", "l4", "l7", "l10", "l13", "l17", "l20"]);
    expect(ids(23)).toEqual(["l1", "l4", "l7", "l10", "l13", "l17", "l20", "l23"]);
    expect(ids(25)).toEqual(ids(23));
  });
  it("has options and defaults", () => {
    const steps = templateSteps(25);
    const by = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(by.l1?.options).toEqual(["resilience", "resistance"]);
    expect(by.l1?.default).toBe("resilience");
    expect(by.l4?.options).toEqual(["skill", "removeCondition"]);
    expect(by.l4?.default).toBe("skill");
    expect(by.l10?.options).toEqual(["recharge"]);
    expect(by.l17?.options).toEqual(["undyingMyth"]);
    expect(by.l20?.default).toBe("reroll");
    expect(by.l23?.default).toBe("both");
    expect(templateSteps(23).at(-1)?.default).toBe("strikes");
  });
});

describe("resolveChoices", () => {
  it("level 1 default: Mythic Power + resilience on the highest save", () => {
    const r = resolveChoices(1, {}, snap());
    expect(r.abilities.map((a) => a.key)).toEqual(["power", "resilience"]);
    expect(r.saves).toEqual(["reflex"]);
    expect(r.resistance).toBeNull();
  });
  it("level 1 resistance: half level, at least 1", () => {
    const r = resolveChoices(1, { l1: { option: "resistance" } }, snap());
    expect(r.resistance).toBe(1);
    expect(r.saves).toEqual([]);
    expect(r.abilities.find((a) => a.key === "resistance")?.value).toBe(1);
  });
  it("level 4 default: Mythic Skill on the highest skill", () => {
    const r = resolveChoices(4, {}, snap());
    expect(r.abilities.map((a) => a.key)).toEqual(["power", "resilience", "skill"]);
    expect(r.skills).toEqual(["stealth"]);
  });
  it("level 4 Remove a Condition", () => {
    expect(keys(4, { l4: { option: "removeCondition" } })).toEqual([
      "power",
      "resilience",
      "removeCondition",
    ]);
    expect(resolveChoices(4, { l4: { option: "removeCondition" } }, snap()).skills).toEqual([]);
  });
  it("level 7 default: two saves, highest first", () => {
    expect(resolveChoices(7, {}, snap()).saves).toEqual(["reflex", "will"]);
  });
  it("never picks the same save twice", () => {
    const r = resolveChoices(
      13,
      {
        l1: { option: "resilience", save: "will" },
        l7: { option: "resilience", save: "will" },
        l13: { option: "resilience", save: "will" },
      },
      snap(),
    );
    expect(r.saves).toEqual(["will", "reflex", "fortitude"]);
  });
  it("chosen save is honoured", () => {
    expect(resolveChoices(1, { l1: { option: "resilience", save: "fortitude" } }, snap()).saves).toEqual([
      "fortitude",
    ]);
  });
  it("double resistance: full level", () => {
    const r = resolveChoices(7, { l1: { option: "resistance" }, l7: { option: "resistance" } }, snap());
    expect(r.resistance).toBe(7);
    expect(r.abilities.filter((a) => a.key === "resistance")).toHaveLength(1);
    expect(r.saves).toEqual([]);
  });
  it("mixed resistance and resilience at 13", () => {
    const r = resolveChoices(13, { l7: { option: "resistance" } }, snap());
    expect(r.resistance).toBe(6);
    expect(r.saves).toEqual(["reflex", "will"]);
  });
  it("triple resistance stays at full level", () => {
    const r = resolveChoices(
      13,
      { l1: { option: "resistance" }, l7: { option: "resistance" }, l13: { option: "resistance" } },
      snap(),
    );
    expect(r.resistance).toBe(13);
  });
  it("level 12: Recharge, two skills", () => {
    const r = resolveChoices(12, {}, snap());
    expect(r.abilities.map((a) => a.key)).toEqual(["power", "resilience", "skill", "recharge"]);
    expect(r.skills).toEqual(["stealth", "athletics"]);
  });
  it("Recharge Spell for spellcasters", () => {
    expect(keys(10, {}, snap({ hasSpellcasting: true }))).toContain("rechargeSpell");
    expect(keys(10, {}, snap({ hasSpellcasting: true }))).not.toContain("recharge");
  });
  it("chosen skills are honoured, deduplicated and filled", () => {
    const r = resolveChoices(
      12,
      { l4: { option: "skill", skills: ["intimidation", "intimidation"] } },
      snap(),
    );
    expect(r.skills).toEqual(["intimidation", "stealth"]);
    const bad = resolveChoices(4, { l4: { option: "skill", skills: ["arcana"] } }, snap());
    expect(bad.skills).toEqual(["stealth"]);
  });
  it("NPC without skills gets Mythic Skill on no specific skill", () => {
    const r = resolveChoices(4, {}, snap({ skills: {} }));
    expect(r.skills).toEqual([]);
    expect(r.abilities.find((a) => a.key === "skill")?.skills).toEqual([]);
  });
  it("level 20 default and Mythic Defenses", () => {
    expect(keys(20)).toEqual(["power", "resilience", "skill", "recharge", "undyingMyth", "reroll"]);
    expect(keys(20, { l20: { option: "defenses" } })).toContain("defenses");
    expect(keys(20, { l20: { option: "defenses" } })).not.toContain("reroll");
  });
  it("level 23 immunity: strikes by default, or spells", () => {
    expect(resolveChoices(23, {}, snap()).immunity).toEqual(["strikes"]);
    expect(resolveChoices(23, { l23: { option: "spells" } }, snap()).immunity).toEqual(["spells"]);
    expect(resolveChoices(23, {}, snap()).saves).toHaveLength(3);
  });
  it("level 25 immunity: both by default", () => {
    const r = resolveChoices(25, {}, snap());
    expect(r.immunity).toEqual(["strikes", "spells"]);
    expect(r.abilities.at(-1)).toEqual({
      key: "immunity",
      id: ABILITY_IDS.immunity,
      immunity: ["strikes", "spells"],
    });
  });
  it("invalid options fall back to the default", () => {
    expect(keys(4, { l4: { option: "resistance" } })).toEqual(["power", "resilience", "skill"]);
  });
  it("ignores choices for steps above the level", () => {
    expect(keys(1, { l4: { option: "removeCondition" }, l23: { option: "both" } })).toEqual([
      "power",
      "resilience",
    ]);
  });
  it("ability ids match the table", () => {
    for (const a of resolveChoices(25, {}, snap({ hasSpellcasting: true })).abilities) {
      expect(a.id).toBe(ABILITY_IDS[a.key]);
    }
  });
});

describe("defaultChoices", () => {
  it("fills saves in order and skills", () => {
    const c = defaultChoices(13, snap());
    expect(c.l1).toEqual({ option: "resilience", save: "reflex" });
    expect(c.l7).toEqual({ option: "resilience", save: "will" });
    expect(c.l13).toEqual({ option: "resilience", save: "fortitude" });
    expect(c.l4).toEqual({ option: "skill", skills: ["stealth", "athletics"] });
    expect(resolveChoices(13, c, snap())).toEqual(resolveChoices(13, {}, snap()));
  });
  it("save ties keep fortitude, reflex, will order", () => {
    expect(savesByModifier({ fortitude: 5, reflex: 5, will: 5 })).toEqual(["fortitude", "reflex", "will"]);
  });
});

describe("resistanceValue", () => {
  it("half or full level", () => {
    expect(resistanceValue(9, 1)).toBe(4);
    expect(resistanceValue(9, 2)).toBe(9);
    expect(resistanceValue(9, 0)).toBe(0);
  });
});

describe("predicates", () => {
  const origin = mythicOriginOptions();
  it("mythic origin covers the trait and every Calling", () => {
    expect(origin[0]).toBe("origin:trait:mythic");
    expect(origin).toContain("feature:hunters-calling");
    expect(origin).toHaveLength(19);
    expect(mythicOriginOptions(["new-calling"])).toContain("feature:new-calling");
  });
  it("resistance: strike, non-mythic attacker and weapon", () => {
    expect(resistanceDefinition(["origin:trait:mythic"])).toEqual([
      { or: ["item:type:weapon", "item:type:melee"] },
      { nor: ["origin:trait:mythic", "item:trait:mythic"] },
    ]);
  });
  it("strike immunity and spell immunity", () => {
    const s = strikeImmunityDefinition(["origin:trait:mythic"]);
    expect(s).toContainEqual({ not: "item:trait:mythic" });
    expect(spellImmunityDefinition(["origin:trait:mythic"])).toEqual([
      "damage",
      { or: ["item:type:spell", "item:from-spell"] },
      { nor: ["origin:trait:mythic"] },
    ]);
  });
});

describe("buildAbilityItem", () => {
  const rules = (item: GlossaryItemSource): RuleSource[] => item.system.rules ?? [];
  const flag = (item: GlossaryItemSource) => item.flags?.["sargas-mythic-powers"]?.npcTemplate;

  it("formats names", () => {
    expect(formatAbilityName("Mythic Resilience", ["Fortitude", "Will"])).toBe(
      "Mythic Resilience (Fortitude, Will)",
    );
    expect(formatAbilityName("Mythic Power")).toBe("Mythic Power");
  });

  it("Mythic Resilience keeps only the chosen saves", () => {
    const item = buildAbilityItem(
      src(ABILITY_IDS.resilience),
      { key: "resilience", id: ABILITY_IDS.resilience, saves: ["fortitude", "will"] },
      { name: "Mythic Resilience (Fortitude, Will)", sourceUuid: "Compendium.x.Item.y" },
    );
    expect(item.name).toBe("Mythic Resilience (Fortitude, Will)");
    expect(item._id).toBeUndefined();
    expect(item._stats).toEqual({ compendiumSource: "Compendium.x.Item.y" });
    expect(rules(item).map((r) => r.key)).toEqual(["AdjustDegreeOfSuccess", "AdjustDegreeOfSuccess"]);
    expect(rules(item).map((r) => r.selector)).toEqual(["fortitude", "will"]);
    expect(flag(item)).toBe(true);
    expect(item.type).toBe("action");
  });

  it("does not mutate the source", () => {
    const before = JSON.stringify(src(ABILITY_IDS.resilience));
    buildAbilityItem(src(ABILITY_IDS.resilience), { key: "resilience", id: "", saves: [] }, { name: "x" });
    expect(JSON.stringify(src(ABILITY_IDS.resilience))).toBe(before);
  });

  it("Mythic Skill narrows the selector and keeps the toggle", () => {
    const item = buildAbilityItem(
      src(ABILITY_IDS.skill),
      { key: "skill", id: ABILITY_IDS.skill, skills: ["athletics"] },
      { name: "Mythic Skill (Athletics)" },
    );
    const r = rules(item);
    expect(r.find((x) => x.key === "ItemAlteration")).toBeUndefined();
    expect(r.find((x) => x.key === "RollOption")).toMatchObject({ option: "mythic-skill", toggleable: true });
    expect(r.find((x) => x.key === "FlatModifier")).toMatchObject({
      selector: ["athletics"],
      predicate: ["mythic-skill"],
      value: 4,
    });
  });

  it("Mythic Skill without skills keeps skill-check", () => {
    const item = buildAbilityItem(
      src(ABILITY_IDS.skill),
      { key: "skill", id: "", skills: [] },
      { name: "x" },
    );
    expect(rules(item).find((x) => x.key === "FlatModifier")?.selector).toEqual(["skill-check"]);
  });

  it("Mythic Resistance adds a custom Resistance rule", () => {
    const item = buildAbilityItem(
      src(ABILITY_IDS.resistance),
      { key: "resistance", id: ABILITY_IDS.resistance, value: 6 },
      {
        name: "Mythic Resistance 6",
        labels: { resistance: "Mythic Resistance" },
        origin: ["origin:trait:mythic"],
      },
    );
    expect(rules(item)).toEqual([
      {
        key: "Resistance",
        type: ["custom"],
        definition: resistanceDefinition(["origin:trait:mythic"]),
        value: 6,
        label: "Mythic Resistance",
      },
    ]);
  });

  it("Mythic Immunity adds one custom Immunity per kind", () => {
    const item = buildAbilityItem(
      src(ABILITY_IDS.immunity),
      { key: "immunity", id: ABILITY_IDS.immunity, immunity: ["strikes", "spells"] },
      {
        name: "Mythic Immunity",
        labels: { strikes: "Mythic Immunity (Strikes)", spells: "Mythic Immunity (Spells)" },
      },
    );
    const r = rules(item);
    expect(r.map((x) => [x.key, x.label])).toEqual([
      ["Immunity", "Mythic Immunity (Strikes)"],
      ["Immunity", "Mythic Immunity (Spells)"],
    ]);
    expect(r[0]?.definition).toEqual(strikeImmunityDefinition());
    expect(r[1]?.definition).toEqual(spellImmunityDefinition());
    expect(r.every((x) => JSON.stringify(x.type) === '["custom"]')).toBe(true);
  });

  it("description-only abilities just lose the name alteration", () => {
    for (const key of [
      "power",
      "recharge",
      "rechargeSpell",
      "removeCondition",
      "reroll",
      "undyingMyth",
      "defenses",
    ] as const) {
      const item = buildAbilityItem(src(ABILITY_IDS[key]), { key, id: ABILITY_IDS[key] }, { name: key });
      expect(rules(item), key).toEqual([]);
      expect(item.name).toBe(key);
      expect(flag(item)).toBe(true);
    }
  });

  it("keeps action type and traits", () => {
    const item = buildAbilityItem(
      src(ABILITY_IDS.recharge),
      { key: "recharge", id: "" },
      { name: "Recharge" },
    );
    expect(item.system.actionType).toEqual({ value: "action" });
    expect(item.system.traits).toEqual({ value: ["concentrate"] });
  });
});
