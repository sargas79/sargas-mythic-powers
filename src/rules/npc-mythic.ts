/**
 * Pure rules for mythic NPCs (docs/mythic-npcs.md, features 2 and 3): mythic ability detection from item data,
 * the triggers for Mythic Point spending, Undying Myth and Mythic Defenses, and the HP Undying Myth restores.
 * No Foundry globals.
 */

/** Module id, repeated here so this file stays free of imports with side effects. */
const MODULE_FLAG_SCOPE = "sargas-mythic-powers";

/** Glossary item ids in `pf2e.bestiary-family-ability-glossary`, by ability key. */
export const NPC_ABILITY_IDS = {
  resilience: "0zvUNv8hRTdwXmhF",
  resistance: "anjtXUW6krim20UM",
  power: "jNW79frpM2miwJvD",
  skill: "gNxphcYARRn2bZ1i",
  recharge: "Amur69xCgfyCsY34",
  rechargeSpell: "HhD6EWTdYOyH6Rbr",
  removeCondition: "ta5reS33mtwBHWzX",
  reroll: "MFADnbvNMY9AQNzG",
  undying: "fnwTADEGOKtTxDPu",
  defenses: "exNN1xhUYQXMRN7x",
  immunity: "CvKc38D8oaZEq0Xu",
} as const;

export type NpcAbilityKey = keyof typeof NPC_ABILITY_IDS;

export const NPC_ABILITY_KEYS = Object.keys(NPC_ABILITY_IDS) as NpcAbilityKey[];

/** Abilities whose item card gets a "Spend Mythic Point" button. */
export const SPEND_CARD_ABILITIES: readonly NpcAbilityKey[] = [
  "recharge",
  "rechargeSpell",
  "removeCondition",
];

/** Keep option for every reroll this module triggers (Reroll ability, Mythic Defenses). */
export const REROLL_KEEP = "new" as const;

/** Roll option set by the Mythic Skill toggle. */
export const MYTHIC_SKILL_OPTION = "mythic-skill";

/** Conditions removed when Undying Myth stands the creature back up. */
export const UNDYING_CLEARED_CONDITIONS = ["dying", "unconscious"] as const;

const PACK_PREFIX = "Compendium.pf2e.bestiary-family-ability-glossary.Item.";

/** Normalized names (see normalizeName) and slugs (with or without the "mythic-" prefix) per ability. */
const NAMES: Record<string, NpcAbilityKey> = {
  "mythic resilience": "resilience",
  "mythic resistance": "resistance",
  "mythic power": "power",
  "mythic skill": "skill",
  recharge: "recharge",
  "recharge ability": "recharge",
  "recharge spell": "rechargeSpell",
  "remove a condition": "removeCondition",
  reroll: "reroll",
  "undying myth": "undying",
  "mythic defenses": "defenses",
  "mythic defense": "defenses",
  "mythic immunity": "immunity",
};

const SLUGS: Record<string, NpcAbilityKey> = {
  "mythic-resilience": "resilience",
  "mythic-resistance": "resistance",
  "mythic-power": "power",
  "mythic-skill": "skill",
  recharge: "recharge",
  "recharge-ability": "recharge",
  "recharge-spell": "rechargeSpell",
  "remove-a-condition": "removeCondition",
  reroll: "reroll",
  "undying-myth": "undying",
  "mythic-defenses": "defenses",
  "mythic-immunity": "immunity",
};

const BY_ID: Record<string, NpcAbilityKey> = Object.fromEntries(
  NPC_ABILITY_KEYS.map((key) => [NPC_ABILITY_IDS[key], key]),
) as Record<string, NpcAbilityKey>;

/** The item fields ability detection reads (an ItemPF2e or its source data). */
export interface AbilityItemLike {
  name?: string | null;
  type?: string | null;
  system?: { slug?: string | null } | null;
  _stats?: { compendiumSource?: string | null } | null;
  flags?: Record<string, unknown> | null;
}

/** "(Mythic) Mythic Resilience (Fortitude, Will)" → "mythic resilience". */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\s*\(mythic\)\s*/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function keyFromSource(source: unknown): NpcAbilityKey | null {
  if (typeof source !== "string" || !source) return null;
  if (source.startsWith(PACK_PREFIX)) return BY_ID[source.slice(PACK_PREFIX.length)] ?? null;
  return BY_ID[source] ?? null;
}

function keyFromSlug(slug: unknown): NpcAbilityKey | null {
  if (typeof slug !== "string" || !slug) return null;
  if (SLUGS[slug]) return SLUGS[slug];
  return slug.startsWith("mythic-") ? (SLUGS[slug.slice("mythic-".length)] ?? null) : null;
}

/** Agent X's `flags.sargas-mythic-powers.npcTemplate`: an ability key, a glossary id/uuid, or an object with one. */
function keyFromTemplateFlag(flag: unknown): NpcAbilityKey | null {
  if (!flag) return null;
  if (typeof flag === "string") {
    return (NPC_ABILITY_KEYS as string[]).includes(flag) ? (flag as NpcAbilityKey) : keyFromSource(flag);
  }
  if (typeof flag === "object") {
    const f = flag as Record<string, unknown>;
    for (const field of ["ability", "key", "abilityKey"]) {
      const v = f[field];
      if (typeof v === "string" && (NPC_ABILITY_KEYS as string[]).includes(v)) return v as NpcAbilityKey;
    }
    for (const field of ["sourceId", "source", "id", "glossaryId", "uuid"]) {
      const k = keyFromSource(f[field]);
      if (k) return k;
    }
  }
  return null;
}

/** Which basic mythic ability an item is, or null. Order: compendium source, module flag, slug, name. */
export function abilityKeyOf(item: AbilityItemLike | null | undefined): NpcAbilityKey | null {
  if (!item) return null;
  if (item.type && item.type !== "action") return null;
  const flags = (item.flags ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const fromSource =
    keyFromSource(item._stats?.compendiumSource) ?? keyFromSource(flags.core?.["sourceId"] as unknown);
  if (fromSource) return fromSource;
  const fromFlag = keyFromTemplateFlag(flags[MODULE_FLAG_SCOPE]?.["npcTemplate"]);
  if (fromFlag) return fromFlag;
  const fromSlug = keyFromSlug(item.system?.slug);
  if (fromSlug) return fromSlug;
  return typeof item.name === "string" ? (NAMES[normalizeName(item.name)] ?? null) : null;
}

/** Every ability key present among the items. */
export function abilityKeys(items: Iterable<AbilityItemLike>): Set<NpcAbilityKey> {
  const out = new Set<NpcAbilityKey>();
  for (const item of items) {
    const key = abilityKeyOf(item);
    if (key) out.add(key);
  }
  return out;
}

export function hasAbility(items: Iterable<AbilityItemLike>, key: NpcAbilityKey): boolean {
  for (const item of items) if (abilityKeyOf(item) === key) return true;
  return false;
}

/** An NPC with the `mythic` trait. */
export function isMythicNpcData(type: unknown, traits: unknown): boolean {
  return type === "npc" && Array.isArray(traits) && traits.includes("mythic");
}

export function isFailure(outcome: unknown): boolean {
  return outcome === "failure" || outcome === "criticalFailure";
}

export interface RerollInput {
  isGM: boolean;
  mythicNpc: boolean;
  hasReroll: boolean;
  points: number;
  outcome: unknown;
  /** PF2e's message.isRerollable (a check roll that was not rerolled already). */
  rerollable: boolean;
}

/** The "Reroll (Mythic Point)" context option shows. */
export function canRerollWithPoint(i: RerollInput): boolean {
  return i.isGM && i.mythicNpc && i.hasReroll && i.points >= 1 && i.rerollable && isFailure(i.outcome);
}

export interface CheckContextLike {
  type?: unknown;
  options?: unknown;
  isReroll?: unknown;
  outcome?: unknown;
}

/** A first (not rerolled) skill check made with the Mythic Skill toggle on. */
export function usesMythicSkill(context: CheckContextLike | null | undefined): boolean {
  if (!context || context.isReroll) return false;
  if (context.type !== "skill-check") return false;
  return Array.isArray(context.options) && context.options.includes(MYTHIC_SKILL_OPTION);
}

/** A first (not rerolled) attack roll that critically succeeded. */
export function isCriticalAttack(context: CheckContextLike | null | undefined): boolean {
  if (!context || context.isReroll) return false;
  return context.type === "attack-roll" && context.outcome === "criticalSuccess";
}

export interface UndyingInput {
  enabled: boolean;
  mythicNpc: boolean;
  hasUndying: boolean;
  points: number;
  hp: number;
  /** Already prompted (or deliberately skipped) since the creature last had HP above 0. */
  alreadyDown: boolean;
}

/** The Undying Myth card fires: the creature just dropped to 0 HP and can still use the ability. */
export function shouldPromptUndying(i: UndyingInput): boolean {
  return i.enabled && i.mythicNpc && i.hasUndying && i.points >= 1 && i.hp <= 0 && !i.alreadyDown;
}

/** HP after Undying Myth: half of max, rounded down, at least 1. */
export function undyingHp(maxHp: number): number {
  const max = Number.isFinite(maxHp) ? Math.trunc(maxHp) : 0;
  return Math.max(1, Math.floor(max / 2));
}

/** Points after a spend, or null when there is none to spend. */
export function pointsAfterSpend(current: number): number | null {
  const value = Number.isFinite(current) ? Math.trunc(current) : 0;
  return value >= 1 ? value - 1 : null;
}

/** Points clamped to [0, max]. */
export function clampNpcPoints(value: number, max: number): number {
  const cap = Number.isFinite(max) && max > 0 ? Math.trunc(max) : 0;
  const v = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(0, Math.min(cap, v));
}
