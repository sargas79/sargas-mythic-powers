/** Mythic NPC rules (src/rules/npc-mythic.ts): ability detection, spend and prompt triggers, Undying Myth HP. */
import { describe, expect, it } from "vitest";
import {
  NPC_ABILITY_IDS,
  abilityKeyOf,
  abilityKeys,
  canRerollWithPoint,
  clampNpcPoints,
  hasAbility,
  isCriticalAttack,
  isFailure,
  isMythicNpcData,
  normalizeName,
  pointsAfterSpend,
  shouldPromptUndying,
  undyingHp,
  usesMythicSkill,
} from "../src/rules/npc-mythic.js";

const source = (id: string) => `Compendium.pf2e.bestiary-family-ability-glossary.Item.${id}`;

describe("ability detection", () => {
  it("reads _stats.compendiumSource (War of Immortals bestiary)", () => {
    const item = {
      type: "action",
      name: "Recharge Ability",
      _stats: { compendiumSource: source(NPC_ABILITY_IDS.recharge) },
    };
    expect(abilityKeyOf(item)).toBe("recharge");
  });
  it("reads flags.core.sourceId", () => {
    const item = {
      type: "action",
      name: "Whatever",
      flags: { core: { sourceId: source(NPC_ABILITY_IDS.undying) } },
    };
    expect(abilityKeyOf(item)).toBe("undying");
  });
  it("reads the module's npcTemplate flag in several shapes", () => {
    const flag = (npcTemplate: unknown) => ({
      type: "action",
      name: "x",
      flags: { "sargas-mythic-powers": { npcTemplate } },
    });
    expect(abilityKeyOf(flag("reroll"))).toBe("reroll");
    expect(abilityKeyOf(flag(NPC_ABILITY_IDS.defenses))).toBe("defenses");
    expect(abilityKeyOf(flag({ ability: "skill" }))).toBe("skill");
    expect(abilityKeyOf(flag({ sourceId: source(NPC_ABILITY_IDS.removeCondition) }))).toBe("removeCondition");
  });
  it("reads glossary slugs with and without the mythic- prefix", () => {
    expect(abilityKeyOf({ system: { slug: "mythic-mythic-skill" } })).toBe("skill");
    expect(abilityKeyOf({ system: { slug: "mythic-recharge-spell" } })).toBe("rechargeSpell");
    expect(abilityKeyOf({ system: { slug: "mythic-skill" } })).toBe("skill");
    expect(abilityKeyOf({ system: { slug: "undying-myth" } })).toBe("undying");
  });
  it("falls back to the name", () => {
    expect(normalizeName("(Mythic) Mythic Resilience (Fortitude, Will)")).toBe("mythic resilience");
    expect(abilityKeyOf({ name: "(Mythic) Undying Myth" })).toBe("undying");
    expect(abilityKeyOf({ name: "Remove a Condition" })).toBe("removeCondition");
    expect(abilityKeyOf({ name: "Mythic Defenses" })).toBe("defenses");
    expect(abilityKeyOf({ name: "Recharge Spell" })).toBe("rechargeSpell");
    expect(abilityKeyOf({ name: "Reroll" })).toBe("reroll");
  });
  it("ignores other items", () => {
    expect(abilityKeyOf({ type: "action", name: "Jaws" })).toBeNull();
    expect(abilityKeyOf({ type: "spell", name: "Reroll" })).toBeNull();
    expect(
      abilityKeyOf({ name: "Deadly Striker", _stats: { compendiumSource: source("ByHEY3s7piqH1rJD") } }),
    ).toBeNull();
    expect(abilityKeyOf(null)).toBeNull();
  });
  it("lists and finds abilities", () => {
    const items = [{ name: "Reroll" }, { name: "Jaws" }, { name: "Undying Myth" }];
    expect([...abilityKeys(items)].sort()).toEqual(["reroll", "undying"]);
    expect(hasAbility(items, "undying")).toBe(true);
    expect(hasAbility(items, "defenses")).toBe(false);
  });
});

describe("triggers", () => {
  it("mythic NPC test", () => {
    expect(isMythicNpcData("npc", ["dragon", "mythic"])).toBe(true);
    expect(isMythicNpcData("npc", ["dragon"])).toBe(false);
    expect(isMythicNpcData("character", ["mythic"])).toBe(false);
  });
  it("reroll option only on failed rerollable checks with points", () => {
    const base = {
      isGM: true,
      mythicNpc: true,
      hasReroll: true,
      points: 1,
      outcome: "failure",
      rerollable: true,
    };
    expect(canRerollWithPoint(base)).toBe(true);
    expect(canRerollWithPoint({ ...base, outcome: "criticalFailure" })).toBe(true);
    expect(canRerollWithPoint({ ...base, outcome: "success" })).toBe(false);
    expect(canRerollWithPoint({ ...base, points: 0 })).toBe(false);
    expect(canRerollWithPoint({ ...base, isGM: false })).toBe(false);
    expect(canRerollWithPoint({ ...base, hasReroll: false })).toBe(false);
    expect(canRerollWithPoint({ ...base, rerollable: false })).toBe(false);
    expect(isFailure(undefined)).toBe(false);
  });
  it("mythic skill spends on first skill checks with the toggle", () => {
    expect(usesMythicSkill({ type: "skill-check", options: ["mythic-skill"] })).toBe(true);
    expect(usesMythicSkill({ type: "skill-check", options: ["mythic-skill"], isReroll: true })).toBe(false);
    expect(usesMythicSkill({ type: "skill-check", options: [] })).toBe(false);
    expect(usesMythicSkill({ type: "attack-roll", options: ["mythic-skill"] })).toBe(false);
  });
  it("mythic defenses on first critical attack rolls", () => {
    expect(isCriticalAttack({ type: "attack-roll", outcome: "criticalSuccess" })).toBe(true);
    expect(isCriticalAttack({ type: "attack-roll", outcome: "success" })).toBe(false);
    expect(isCriticalAttack({ type: "attack-roll", outcome: "criticalSuccess", isReroll: true })).toBe(false);
    expect(isCriticalAttack({ type: "skill-check", outcome: "criticalSuccess" })).toBe(false);
  });
  it("undying myth prompts once per drop with points", () => {
    const base = { enabled: true, mythicNpc: true, hasUndying: true, points: 1, hp: 0, alreadyDown: false };
    expect(shouldPromptUndying(base)).toBe(true);
    expect(shouldPromptUndying({ ...base, alreadyDown: true })).toBe(false);
    expect(shouldPromptUndying({ ...base, points: 0 })).toBe(false);
    expect(shouldPromptUndying({ ...base, hp: 5 })).toBe(false);
    expect(shouldPromptUndying({ ...base, enabled: false })).toBe(false);
    expect(shouldPromptUndying({ ...base, hasUndying: false })).toBe(false);
  });
});

describe("numbers", () => {
  it("undying HP is half max, rounded down, at least 1", () => {
    expect(undyingHp(301)).toBe(150);
    expect(undyingHp(1)).toBe(1);
    expect(undyingHp(0)).toBe(1);
    expect(undyingHp(Number.NaN)).toBe(1);
  });
  it("spending and clamping", () => {
    expect(pointsAfterSpend(3)).toBe(2);
    expect(pointsAfterSpend(0)).toBeNull();
    expect(clampNpcPoints(5, 3)).toBe(3);
    expect(clampNpcPoints(-1, 3)).toBe(0);
  });
});
