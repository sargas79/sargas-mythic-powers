/**
 * OWNER: agent X. Make Mythic NPC template (docs/mythic-npcs.md, feature 1). GM only, `npc` actors only.
 * Copies the basic mythic abilities from pf2e.bestiary-family-ability-glossary trimmed to the GM's choices,
 * adds the `mythic` trait, sets Mythic Points to 3 and remembers exactly what it added in
 * flags["sargas-mythic-powers"].npc so removal undoes only that.
 */
import { MODULE_ID, PF2E } from "../constants.js";
import { notify, t } from "../foundry/i18n.js";
import { appendLedger } from "../foundry/ledger.js";
import {
  ABILITY_IDS,
  buildAbilityItem,
  classifyBulk,
  formatAbilityName,
  mythicOriginOptions,
  resolveChoices,
  SAVES,
  type BulkCandidate,
  type BulkGroups,
  type GlossaryItemSource,
  type NpcSnapshot,
  type ResolvedAbility,
  type SaveSlug,
  type TemplateChoices,
} from "../rules/npc-template.js";

export const NPC_FLAG_KEY = "npc";
const MYTHIC_TRAIT = "mythic";

export interface NpcTemplateFlag {
  applied: boolean;
  level: number;
  choices: TemplateChoices;
  itemIds: string[];
  addedTrait: boolean;
}

export function isNpc(actor: ActorPF2e): boolean {
  return actor?.type === "npc";
}

export function getTemplateFlag(actor: ActorPF2e): NpcTemplateFlag | null {
  const raw = actor?.flags?.[MODULE_ID]?.[NPC_FLAG_KEY];
  return raw && typeof raw === "object" ? (raw as NpcTemplateFlag) : null;
}

/** The module's template is applied to this NPC. */
export function isTemplateApplied(actor: ActorPF2e): boolean {
  return isNpc(actor) && !!getTemplateFlag(actor)?.applied;
}

function sourceTraits(actor: ActorPF2e): string[] {
  const traits = actor?._source?.system?.traits?.value ?? actor?.system?.traits?.value ?? [];
  return Array.isArray(traits) ? [...traits] : [];
}

/** An NPC with the `mythic` trait (from the bestiary or from the template). */
export function isMythicNpc(actor: ActorPF2e): boolean {
  if (!isNpc(actor)) return false;
  const traits: string[] = actor?.system?.traits?.value ?? [];
  return traits.includes(MYTHIC_TRAIT) || sourceTraits(actor).includes(MYTHIC_TRAIT);
}

/** Mythic from the bestiary: has the trait but no module template. */
export function isBestiaryMythic(actor: ActorPF2e): boolean {
  return isMythicNpc(actor) && !isTemplateApplied(actor);
}

export function npcLevel(actor: ActorPF2e): number {
  return Number(actor?.level ?? actor?.system?.details?.level?.value ?? 0);
}

/** Save and skill modifiers and spellcasting, as the template rules need them. */
export function npcSnapshot(actor: ActorPF2e): NpcSnapshot {
  const saves = {} as Record<SaveSlug, number>;
  for (const slug of SAVES)
    saves[slug] = Number(actor?.saves?.[slug]?.mod ?? actor?.system?.saves?.[slug]?.value ?? 0);
  const skills: Record<string, number> = {};
  const stats = (actor?.skills ?? {}) as Record<string, { proficient?: boolean; mod?: number } | undefined>;
  for (const [slug, stat] of Object.entries(stats)) {
    if (stat?.proficient) skills[slug] = Number(stat.mod ?? 0);
  }
  return {
    saves,
    skills,
    hasSpellcasting: (actor?.itemTypes?.spellcastingEntry?.length ?? 0) > 0,
  };
}

export function saveLabel(slug: SaveSlug): string {
  const key = CONFIG?.PF2E?.saves?.[slug];
  return key ? game.i18n.localize(key) : slug;
}

export function skillLabel(actor: ActorPF2e, slug: string): string {
  const label = actor?.skills?.[slug]?.label ?? CONFIG?.PF2E?.skills?.[slug]?.label;
  return label ? game.i18n.localize(label) : slug;
}

let callingSlugs: Promise<string[]> | null = null;

/** Calling slugs from pf2e.classfeatures, for the "mythic attacker" roll options (cached). */
function loadCallingSlugs(): Promise<string[]> {
  callingSlugs ??= (async () => {
    try {
      const pack = game.packs?.get(PF2E.callingsPack);
      if (!pack) return [];
      const index = await pack.getIndex({ fields: ["system.category", "system.slug"] });
      const slugs: string[] = [];
      for (const entry of index) {
        if (entry.system?.category === PF2E.callingCategory && entry.system?.slug)
          slugs.push(entry.system.slug);
      }
      return slugs;
    } catch (error) {
      console.error(`${MODULE_ID} |`, error);
      return [];
    }
  })();
  return callingSlugs;
}

/** The PF2e localization key from the glossary item's ItemAlteration name rule, localized. */
function baseName(source: GlossaryItemSource): string {
  const rule = (source.system.rules ?? []).find((r) => r.key === "ItemAlteration" && r.property === "name");
  const key = typeof rule?.value === "string" ? rule.value : null;
  const localized = key ? game.i18n.localize(key) : null;
  return localized && localized !== key ? localized : source.name.replace(/^\(Mythic\)\s*/, "");
}

function abilityName(actor: ActorPF2e, source: GlossaryItemSource, ability: ResolvedAbility): string {
  const base = baseName(source);
  switch (ability.key) {
    case "resilience":
      return formatAbilityName(base, (ability.saves ?? []).map(saveLabel));
    case "skill":
      return formatAbilityName(
        base,
        (ability.skills ?? []).map((s) => skillLabel(actor, s)),
      );
    case "resistance":
      return formatAbilityName(base, [String(ability.value ?? 0)]);
    case "immunity":
      return formatAbilityName(
        base,
        (ability.immunity ?? []).map((k) => t(`npcTemplate.immunity.${k}`)),
      );
    default:
      return base;
  }
}

async function loadGlossary(ids: string[]): Promise<Map<string, GlossaryItemSource>> {
  const pack = game.packs?.get(PF2E.npcAbilityPack);
  if (!pack) throw new Error(`${MODULE_ID} | compendium ${PF2E.npcAbilityPack} not found`);
  const docs: ItemPF2e[] = await pack.getDocuments({ _id__in: ids });
  return new Map(docs.map((d: ItemPF2e) => [d.id, d.toObject() as GlossaryItemSource]));
}

/** Item data the template would add (used by apply; exposed for previews and macros). */
export async function buildTemplateItems(
  actor: ActorPF2e,
  choices: TemplateChoices,
): Promise<{ items: GlossaryItemSource[]; level: number }> {
  const level = npcLevel(actor);
  const resolved = resolveChoices(level, choices, npcSnapshot(actor));
  const sources = await loadGlossary([...new Set(resolved.abilities.map((a) => a.id))]);
  const origin = mythicOriginOptions(await loadCallingSlugs());
  const labels = {
    resistance: t("npcTemplate.labels.resistance"),
    strikes: t("npcTemplate.labels.strikes"),
    spells: t("npcTemplate.labels.spells"),
  };
  const items: GlossaryItemSource[] = [];
  for (const ability of resolved.abilities) {
    const source = sources.get(ability.id);
    if (!source) throw new Error(`${MODULE_ID} | glossary item ${ability.id} (${ability.key}) not found`);
    items.push(
      buildAbilityItem(source, ability, {
        name: abilityName(actor, source, ability),
        labels,
        origin,
        sourceUuid: `Compendium.${PF2E.npcAbilityPack}.Item.${ability.id}`,
      }),
    );
  }
  return { items, level };
}

function guard(actor: ActorPF2e): boolean {
  if (!game.user?.isGM) {
    notify.warn("errors.gmOnly");
    return false;
  }
  if (!isNpc(actor)) {
    notify.warn("npcTemplate.errors.notNpc");
    return false;
  }
  return true;
}

/** Adds the template and logs it. Throws on failure; callers have already checked the actor qualifies. */
async function addTemplate(actor: ActorPF2e, choices: TemplateChoices): Promise<void> {
  const { items, level } = await buildTemplateItems(actor, choices);
  const created: ItemPF2e[] = await actor.createEmbeddedDocuments("Item", items);
  const itemIds = created.map((i: ItemPF2e) => i.id);
  const traits = sourceTraits(actor);
  const addedTrait = !traits.includes(MYTHIC_TRAIT);
  const flag: NpcTemplateFlag = { applied: true, level, choices, itemIds, addedTrait };
  const update: Record<string, unknown> = {
    [`flags.${MODULE_ID}.${NPC_FLAG_KEY}`]: foundry.data.operators.ForcedReplacement.create(flag),
  };
  if (addedTrait) update["system.traits.value"] = [...traits, MYTHIC_TRAIT];
  update["system.resources.mythicPoints.value"] = 3;
  await actor.update(update, { diff: false });
  await appendLedger({
    kind: "grant",
    actorUuid: actor.uuid,
    actorName: actor.name,
    message: t("npcTemplate.ledger.apply", {
      name: actor.name,
      level,
      abilities: created.map((i: ItemPF2e) => i.name).join(", "),
    }),
  });
}

/** Deletes what the template added and logs it. Throws on failure. */
async function stripTemplate(actor: ActorPF2e, flag: NpcTemplateFlag): Promise<void> {
  const ids = (flag.itemIds ?? []).filter((id) => actor.items?.has(id));
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
  const update: Record<string, unknown> = {
    [`flags.${MODULE_ID}.${NPC_FLAG_KEY}`]: foundry.data.operators.ForcedDeletion.create(),
  };
  if (flag.addedTrait) {
    update["system.traits.value"] = sourceTraits(actor).filter((tr) => tr !== MYTHIC_TRAIT);
  }
  await actor.update(update);
  // An unlinked token inherits the flag from its world actor when the template was applied there. Foundry
  // drops the deletion of a key the token's own data doesn't hold, so the flag would stay and block Make
  // Mythic. Override it on the token instead.
  if (isTemplateApplied(actor)) {
    const removed = foundry.data.operators.ForcedReplacement.create({ applied: false });
    await actor.update({ [`flags.${MODULE_ID}.${NPC_FLAG_KEY}`]: removed }, { diff: false });
  }
  if (isTemplateApplied(actor)) throw new Error(`${MODULE_ID} | the template flag is still on ${actor.name}`);
  await appendLedger({
    kind: "revoke",
    actorUuid: actor.uuid,
    actorName: actor.name,
    message: t("npcTemplate.ledger.remove", { name: actor.name, count: ids.length }),
  });
}

/** GM only. Applies the template. Returns false when nothing was done. */
export async function applyMythicTemplate(actor: ActorPF2e, choices: TemplateChoices = {}): Promise<boolean> {
  if (!guard(actor)) return false;
  if (isTemplateApplied(actor)) {
    notify.warn("npcTemplate.errors.applied", { name: actor.name });
    return false;
  }
  if (isMythicNpc(actor)) {
    notify.warn("npcTemplate.errors.bestiary", { name: actor.name });
    return false;
  }
  try {
    await addTemplate(actor, choices);
    notify.info("npcTemplate.notify.applied", { name: actor.name });
    return true;
  } catch (error) {
    notify.error("npcTemplate.errors.failed", { name: actor.name }, error);
    return false;
  }
}

/** GM only. Removes exactly what the template added. Returns false when nothing was done. */
export async function removeMythicTemplate(actor: ActorPF2e): Promise<boolean> {
  if (!guard(actor)) return false;
  const flag = getTemplateFlag(actor);
  if (!flag?.applied) {
    notify.warn("npcTemplate.errors.notApplied", { name: actor.name });
    return false;
  }
  try {
    await stripTemplate(actor, flag);
    notify.info("npcTemplate.notify.removed", { name: actor.name });
    return true;
  } catch (error) {
    notify.error("npcTemplate.errors.failed", { name: actor.name }, error);
    return false;
  }
}

export interface BulkTarget extends BulkCandidate {
  actor: ActorPF2e;
}

/** Actor names, by outcome. */
export interface BulkResult {
  done: string[];
  failed: string[];
  /** Left alone because the action doesn't apply to them. */
  skipped: string[];
}

/** The actors of the tokens selected on the canvas (an unlinked token's synthetic actor for unlinked tokens). */
export function selectedTokenActors(): ActorPF2e[] {
  const tokens: { actor?: ActorPF2e | null }[] = canvas?.tokens?.controlled ?? [];
  return tokens.map((token) => token.actor).filter(Boolean);
}

/** Sorts actors by what the bulk action can do to them, one entry per actor. */
export function bulkTargets(actors: ActorPF2e[]): BulkGroups<BulkTarget> {
  return classifyBulk(
    actors.map((actor) => ({
      actor,
      uuid: actor.uuid,
      name: actor.name,
      npc: isNpc(actor),
      mythic: isMythicNpc(actor),
      applied: isTemplateApplied(actor),
    })),
  );
}

/**
 * Runs the action on each target in turn: the ledger is a read-modify-write of one setting, so concurrent
 * runs would lose entries. A failure is logged and the rest carry on.
 */
async function runBulk(
  targets: BulkTarget[],
  skipped: BulkTarget[],
  action: (actor: ActorPF2e) => Promise<void>,
): Promise<BulkResult> {
  const result: BulkResult = { done: [], failed: [], skipped: skipped.map((s) => s.name) };
  for (const target of targets) {
    try {
      await action(target.actor);
      result.done.push(target.name);
    } catch (error) {
      console.error(`${MODULE_ID} |`, error);
      result.failed.push(target.name);
    }
  }
  return result;
}

/** One summary instead of one notification per creature. */
function reportBulk(doneKey: string, result: BulkResult): void {
  if (result.done.length) notify.info(doneKey, { count: result.done.length });
  if (result.failed.length) notify.error("npcTemplate.bulk.failed", { names: result.failed.join(", ") });
  if (!result.done.length && !result.failed.length) notify.warn("npcTemplate.bulk.nothing");
}

function bulkGmOnly(): BulkResult | null {
  if (game.user?.isGM) return null;
  notify.warn("errors.gmOnly");
  return { done: [], failed: [], skipped: [] };
}

/** GM only. Applies the template with the default picks to every actor that qualifies. */
export async function applyMythicTemplateToMany(actors: ActorPF2e[]): Promise<BulkResult> {
  const denied = bulkGmOnly();
  if (denied) return denied;
  const groups = bulkTargets(actors);
  const result = await runBulk(
    groups.eligible,
    [...groups.applied, ...groups.bestiary, ...groups.notNpc],
    (a) => addTemplate(a, {}),
  );
  reportBulk("npcTemplate.bulk.applied", result);
  return result;
}

/** GM only. Removes the template from every actor that has it. */
export async function removeMythicTemplateFromMany(actors: ActorPF2e[]): Promise<BulkResult> {
  const denied = bulkGmOnly();
  if (denied) return denied;
  const groups = bulkTargets(actors);
  const result = await runBulk(
    groups.applied,
    [...groups.eligible, ...groups.bestiary, ...groups.notNpc],
    (a) => stripTemplate(a, getTemplateFlag(a) as NpcTemplateFlag),
  );
  reportBulk("npcTemplate.bulk.removed", result);
  return result;
}

export { ABILITY_IDS };
