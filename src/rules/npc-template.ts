/**
 * Pure rules for the Make Mythic NPC template (docs/mythic-npcs.md, War of Immortals pg. 168): the level steps
 * with their options and defaults, resolving the GM's choices into the abilities to add, and building the
 * trimmed item data from the PF2e glossary items (pf2e.bestiary-family-ability-glossary). No Foundry globals.
 */
import { MODULE_ID } from "../constants.js";

/** Glossary item ids in pf2e.bestiary-family-ability-glossary (PF2e 8.5.1). */
export const ABILITY_IDS = {
  resilience: "0zvUNv8hRTdwXmhF",
  resistance: "anjtXUW6krim20UM",
  power: "jNW79frpM2miwJvD",
  skill: "gNxphcYARRn2bZ1i",
  recharge: "Amur69xCgfyCsY34",
  rechargeSpell: "HhD6EWTdYOyH6Rbr",
  removeCondition: "ta5reS33mtwBHWzX",
  reroll: "MFADnbvNMY9AQNzG",
  undyingMyth: "fnwTADEGOKtTxDPu",
  defenses: "exNN1xhUYQXMRN7x",
  immunity: "CvKc38D8oaZEq0Xu",
} as const;

export type AbilityKey = keyof typeof ABILITY_IDS;

export const SAVES = ["fortitude", "reflex", "will"] as const;
export type SaveSlug = (typeof SAVES)[number];

export type ImmunityKind = "strikes" | "spells";

/** Option values a step can offer. */
export type StepOption =
  | "resilience"
  | "resistance"
  | "skill"
  | "removeCondition"
  | "recharge"
  | "undyingMyth"
  | "reroll"
  | "defenses"
  | "strikes"
  | "spells"
  | "both";

export type StepId = "l1" | "l4" | "l7" | "l10" | "l13" | "l17" | "l20" | "l23";

export interface TemplateStep {
  id: StepId;
  level: number;
  options: StepOption[];
  default: StepOption;
  /** "defense" steps pick a save, "skill" steps pick skills. */
  kind: "defense" | "power" | "immunity";
}

/** The GM's pick for one step. `save` applies to resilience, `skills` to Mythic Skill. */
export interface StepChoice {
  option: StepOption;
  save?: SaveSlug | null;
  skills?: string[];
}

export type TemplateChoices = Partial<Record<StepId, StepChoice>>;

/** What the template needs to know about the NPC. */
export interface NpcSnapshot {
  saves: Record<SaveSlug, number>;
  /** Skill slug -> modifier, only the skills the NPC has. */
  skills: Record<string, number>;
  hasSpellcasting: boolean;
}

export interface ResolvedAbility {
  key: AbilityKey;
  id: string;
  /** Mythic Resilience: chosen saves, in pick order. */
  saves?: SaveSlug[];
  /** Mythic Skill: chosen skill slugs. */
  skills?: string[];
  /** Mythic Resistance: resistance value. */
  value?: number;
  /** Mythic Immunity: kinds. */
  immunity?: ImmunityKind[];
}

export interface ResolvedTemplate {
  abilities: ResolvedAbility[];
  saves: SaveSlug[];
  skills: string[];
  resistance: number | null;
  immunity: ImmunityKind[];
}

const DEFENSE_OPTIONS: StepOption[] = ["resilience", "resistance"];

const STEP_TABLE: Omit<TemplateStep, "default">[] = [
  { id: "l1", level: 1, options: DEFENSE_OPTIONS, kind: "defense" },
  { id: "l4", level: 4, options: ["skill", "removeCondition"], kind: "power" },
  { id: "l7", level: 7, options: DEFENSE_OPTIONS, kind: "defense" },
  { id: "l10", level: 10, options: ["recharge"], kind: "power" },
  { id: "l13", level: 13, options: DEFENSE_OPTIONS, kind: "defense" },
  { id: "l17", level: 17, options: ["undyingMyth"], kind: "power" },
  { id: "l20", level: 20, options: ["reroll", "defenses"], kind: "power" },
  { id: "l23", level: 23, options: ["strikes", "spells", "both"], kind: "immunity" },
];

/** Level at which Mythic Skill applies to a second skill. */
export const SECOND_SKILL_LEVEL = 12;
/** Level at which both immunities are the default. */
export const BOTH_IMMUNITIES_LEVEL = 25;

/** The steps a creature of this level qualifies for, each with its options and default. */
export function templateSteps(level: number): TemplateStep[] {
  return STEP_TABLE.filter((s) => level >= s.level).map((s) => ({
    ...s,
    options: [...s.options],
    default: s.id === "l23" && level >= BOTH_IMMUNITIES_LEVEL ? "both" : (s.options[0] as StepOption),
  }));
}

/** Saves sorted by modifier, highest first (ties: fortitude, reflex, will). */
export function savesByModifier(saves: Record<SaveSlug, number>): SaveSlug[] {
  return [...SAVES].sort((a, b) => (saves[b] ?? 0) - (saves[a] ?? 0) || SAVES.indexOf(a) - SAVES.indexOf(b));
}

/** Skill slugs sorted by modifier, highest first (ties alphabetical). */
/** Regular skills before Lore skills, each group highest modifier first. */
export function skillsByModifier(skills: Record<string, number>): string[] {
  const isLore = (s: string) => (s.endsWith("-lore") ? 1 : 0);
  return Object.keys(skills).sort(
    (a, b) => isLore(a) - isLore(b) || (skills[b] ?? 0) - (skills[a] ?? 0) || a.localeCompare(b),
  );
}

export function skillCount(level: number): number {
  return level >= SECOND_SKILL_LEVEL ? 2 : 1;
}

/** Half level (at least 1) for one pick, full level (at least 1) for two or more. */
export function resistanceValue(level: number, picks: number): number {
  if (picks <= 0) return 0;
  return Math.max(1, picks >= 2 ? level : Math.floor(level / 2));
}

function pickSkills(level: number, chosen: string[] | undefined, snapshot: NpcSnapshot): string[] {
  const available = skillsByModifier(snapshot.skills);
  const count = Math.min(skillCount(level), available.length);
  const result: string[] = [];
  for (const slug of chosen ?? []) {
    if (result.length >= count) break;
    if (available.includes(slug) && !result.includes(slug)) result.push(slug);
  }
  for (const slug of available) {
    if (result.length >= count) break;
    if (!result.includes(slug)) result.push(slug);
  }
  return result;
}

/** Choices with every default filled in: defaults per step, highest saves, highest skills. */
export function defaultChoices(level: number, snapshot: NpcSnapshot): TemplateChoices {
  const choices: TemplateChoices = {};
  const order = savesByModifier(snapshot.saves);
  let nextSave = 0;
  for (const step of templateSteps(level)) {
    const choice: StepChoice = { option: step.default };
    if (step.kind === "defense") choice.save = order[nextSave++] ?? null;
    if (step.id === "l4") choice.skills = pickSkills(level, [], snapshot);
    choices[step.id] = choice;
  }
  return choices;
}

/**
 * The abilities to add for these choices. Unknown or missing choices fall back to the step default.
 * Resilience: one save per pick, the chosen one unless already taken, else the highest remaining save.
 */
export function resolveChoices(
  level: number,
  choices: TemplateChoices,
  snapshot: NpcSnapshot,
): ResolvedTemplate {
  const steps = templateSteps(level);
  const order = savesByModifier(snapshot.saves);
  const saves: SaveSlug[] = [];
  let resistancePicks = 0;
  let skills: string[] = [];
  let skillPicked = false;
  const powers: AbilityKey[] = [];
  let immunity: ImmunityKind[] = [];

  for (const step of steps) {
    const raw = choices[step.id];
    const option: StepOption = raw && step.options.includes(raw.option) ? raw.option : step.default;
    switch (option) {
      case "resilience": {
        const wanted = raw?.save && SAVES.includes(raw.save) && !saves.includes(raw.save) ? raw.save : null;
        const save = wanted ?? order.find((s) => !saves.includes(s));
        if (save) saves.push(save);
        break;
      }
      case "resistance":
        resistancePicks += 1;
        break;
      case "skill":
        skillPicked = true;
        skills = pickSkills(level, raw?.skills, snapshot);
        break;
      case "recharge":
        powers.push(snapshot.hasSpellcasting ? "rechargeSpell" : "recharge");
        break;
      case "removeCondition":
      case "undyingMyth":
      case "reroll":
      case "defenses":
        powers.push(option);
        break;
      case "strikes":
      case "spells":
        immunity = [option];
        break;
      case "both":
        immunity = ["strikes", "spells"];
        break;
    }
  }

  const resistance = resistancePicks > 0 ? resistanceValue(level, resistancePicks) : null;
  const abilities: ResolvedAbility[] = [{ key: "power", id: ABILITY_IDS.power }];
  if (saves.length) abilities.push({ key: "resilience", id: ABILITY_IDS.resilience, saves: [...saves] });
  if (resistance !== null)
    abilities.push({ key: "resistance", id: ABILITY_IDS.resistance, value: resistance });
  if (skillPicked) abilities.push({ key: "skill", id: ABILITY_IDS.skill, skills: [...skills] });
  for (const key of powers) abilities.push({ key, id: ABILITY_IDS[key] });
  if (immunity.length) abilities.push({ key: "immunity", id: ABILITY_IDS.immunity, immunity: [...immunity] });

  return { abilities, saves, skills: skillPicked ? skills : [], resistance, immunity };
}

// ---------------------------------------------------------------------------------------------------------
// Predicates (PF2e 8.5.1 damage roll options, as seen by applyIWR after applyDamageFromMessage)
// ---------------------------------------------------------------------------------------------------------

/** Calling slugs in pf2e.classfeatures (8.5.1). A PC with a Calling has roll option `feature:<slug>`. */
export const CALLING_SLUGS = [
  "acrobats-calling",
  "artisans-calling",
  "bookkeepers-calling",
  "caretakers-calling",
  "demagogues-calling",
  "doomsayers-calling",
  "dreamers-calling",
  "echoes-of-the-scrolls",
  "echoes-of-the-spells",
  "echoes-of-the-swords",
  "guardians-calling",
  "handlers-calling",
  "hunters-calling",
  "runelords-calling",
  "sagas-calling",
  "sages-calling",
  "thespians-calling",
  "thiefs-calling",
] as const;

/** Roll options that mean "the attacker is mythic": a mythic-trait creature or a PC with a Calling. */
export function mythicOriginOptions(callingSlugs: readonly string[] = CALLING_SLUGS): string[] {
  const slugs = [...new Set([...CALLING_SLUGS, ...callingSlugs])].sort();
  return ["origin:trait:mythic", ...slugs.map((s) => `feature:${s}`)];
}

export type PredicateStatement = string | { [op: string]: PredicateStatement | PredicateStatement[] };

/** A Strike: damage from a weapon item or an NPC attack (melee or ranged) item. */
export const STRIKE_PREDICATE: PredicateStatement = { or: ["item:type:weapon", "item:type:melee"] };

/** Mythic Resistance: Strikes from non-mythic creatures, unless the weapon is mythic. */
export function resistanceDefinition(origin: string[] = mythicOriginOptions()): PredicateStatement[] {
  return [STRIKE_PREDICATE, { nor: [...origin, "item:trait:mythic"] }];
}

/**
 * Mythic Immunity (Strikes): Strikes with non-mythic weapons, and unarmed Strikes (or NPC attacks) from
 * non-mythic creatures.
 */
export function strikeImmunityDefinition(origin: string[] = mythicOriginOptions()): PredicateStatement[] {
  return [
    STRIKE_PREDICATE,
    { not: "item:trait:mythic" },
    { nand: [{ or: origin }, { or: ["item:category:unarmed", "item:type:melee"] }] },
  ];
}

/** Mythic Immunity (spells): damage from spells cast by non-mythic creatures (best effort). */
export function spellImmunityDefinition(origin: string[] = mythicOriginOptions()): PredicateStatement[] {
  return ["damage", { or: ["item:type:spell", "item:from-spell"] }, { nor: origin }];
}

// ---------------------------------------------------------------------------------------------------------
// Item builders
// ---------------------------------------------------------------------------------------------------------

export interface RuleSource {
  key: string;
  [field: string]: unknown;
}

/** The fields of a glossary item source the builders use (others are copied through). */
export interface GlossaryItemSource {
  _id?: string;
  name: string;
  type: string;
  system: { rules?: RuleSource[]; [field: string]: unknown };
  flags?: Record<string, Record<string, unknown>>;
  [field: string]: unknown;
}

export interface BuildOptions {
  /** Final, localized item name. */
  name: string;
  /** Localized IWR labels ("Mythic Resistance", "Mythic Immunity (Strikes)", …). */
  labels?: { resistance?: string; strikes?: string; spells?: string };
  /** Mythic attacker roll options (see mythicOriginOptions). */
  origin?: string[];
  /** Compendium UUID of the glossary item, kept as `_stats.compendiumSource`. */
  sourceUuid?: string;
}

/** "Mythic Resilience" + ["Fortitude", "Will"] -> "Mythic Resilience (Fortitude, Will)". */
export function formatAbilityName(base: string, parts: string[] = []): string {
  return parts.length ? `${base} (${parts.join(", ")})` : base;
}

function isNameAlteration(rule: RuleSource): boolean {
  return rule.key === "ItemAlteration" && rule.property === "name";
}

/** Item data to create on the NPC for one resolved ability, trimmed to the choices. */
export function buildAbilityItem(
  source: GlossaryItemSource,
  ability: ResolvedAbility,
  options: BuildOptions,
): GlossaryItemSource {
  const copy = JSON.parse(JSON.stringify(source)) as GlossaryItemSource;
  delete copy._id;
  delete copy.folder;
  delete copy.sort;
  delete copy.ownership;
  delete copy._stats;
  if (options.sourceUuid) copy._stats = { compendiumSource: options.sourceUuid };
  copy.name = options.name;
  copy.flags = {
    ...(copy.flags ?? {}),
    [MODULE_ID]: { ...(copy.flags?.[MODULE_ID] ?? {}), npcTemplate: true },
  };

  const origin = options.origin ?? mythicOriginOptions();
  let rules = (copy.system.rules ?? []).filter((r) => !isNameAlteration(r));

  switch (ability.key) {
    case "resilience": {
      const saves = ability.saves ?? [];
      rules = rules.filter(
        (r) => r.key !== "AdjustDegreeOfSuccess" || saves.includes(String(r.selector) as SaveSlug),
      );
      break;
    }
    case "skill": {
      const skills = ability.skills ?? [];
      if (skills.length) {
        rules = rules.map((r) => (r.key === "FlatModifier" ? { ...r, selector: [...skills] } : r));
      }
      break;
    }
    case "resistance":
      rules.push({
        key: "Resistance",
        type: ["custom"],
        definition: resistanceDefinition(origin),
        value: ability.value ?? 0,
        label: options.labels?.resistance ?? options.name,
      });
      break;
    case "immunity":
      for (const kind of ability.immunity ?? []) {
        rules.push({
          key: "Immunity",
          type: ["custom"],
          definition: kind === "strikes" ? strikeImmunityDefinition(origin) : spellImmunityDefinition(origin),
          label: options.labels?.[kind] ?? options.name,
        });
      }
      break;
    default:
      break;
  }
  copy.system = { ...copy.system, rules };
  return copy;
}
