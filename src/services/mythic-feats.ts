/**
 * OWNER: agent C. Foundry side of mythic feat eligibility: loads the mythic feats from the PF2e feats pack
 * (cached index), builds a CharacterSnapshot from an actor and evaluates a feat for a slot.
 * The rules themselves live in src/rules/eligibility.ts.
 */
import { PF2E } from "../constants.js";
import {
  checkEligibility,
  type CharacterSnapshot,
  type Eligibility,
  type FeatRecord,
  type Note,
} from "../rules/eligibility.js";
import { lockedSlotLevels, openSlotLevels, slotLevel } from "../rules/progression.js";
import { callingItem, progressionInput } from "../state/actor-mythic.js";
import { t } from "../foundry/i18n.js";

export interface MythicFeatEntry extends FeatRecord {
  id: string;
  uuid: string;
  img: string;
  publication: string;
}

interface FeatIndex {
  feats: MythicFeatEntry[];
  knownFeatNames: Set<string>;
}

const INDEX_FIELDS = [
  "system.level.value",
  "system.traits.value",
  "system.prerequisites.value",
  "system.publication.title",
  "system.category",
];

let cache: Promise<FeatIndex> | null = null;

/** Mythic and destiny feats from `pf2e.feats-srd`, plus every feat name in the pack. Cached. */
export function loadMythicFeats(): Promise<FeatIndex> {
  cache ??= (async () => {
    const pack = game.packs.get(PF2E.featsPack);
    if (!pack) return { feats: [], knownFeatNames: new Set<string>() };
    const index = await pack.getIndex({ fields: INDEX_FIELDS });
    const feats: MythicFeatEntry[] = [];
    const knownFeatNames = new Set<string>();
    for (const e of index.contents ?? Array.from(index.values?.() ?? [])) {
      knownFeatNames.add(String(e.name).toLowerCase().replace(/’/g, "'"));
      const traits: string[] = e.system?.traits?.value ?? [];
      if (!traits.includes("mythic") && !traits.includes("destiny")) continue;
      feats.push({
        id: e._id,
        uuid: e.uuid ?? `Compendium.${PF2E.featsPack}.Item.${e._id}`,
        img: e.img,
        name: e.name,
        level: Number(e.system?.level?.value ?? 0),
        traits,
        prerequisites: (e.system?.prerequisites?.value ?? []).map((p: { value: string }) =>
          String(p?.value ?? ""),
        ),
        publication: e.system?.publication?.title ?? "",
      });
    }
    feats.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
    return { feats, knownFeatNames };
  })().catch((error) => {
    cache = null;
    throw error;
  });
  return cache;
}

/** Compact record of a feat item (compendium or embedded). */
export function featRecord(item: ItemPF2e): FeatRecord {
  return {
    name: item.name,
    level: Number(item.system?.level?.value ?? 0),
    traits: item.system?.traits?.value ?? [],
    prerequisites: (item.system?.prerequisites?.value ?? []).map((p: { value: string }) =>
      String(p?.value ?? ""),
    ),
  };
}

const MATURE_ANIMAL =
  /^(mature|incredible|specialized|paragon|masterful|apex|gigantic)-.*companion|^(battle-hardened|splendid)-companion$/;
const ADVANCED_CONSTRUCT = /^(advanced|incredible|paragon)-construct-companion$/;
const ANY_COMPANION = /^(animal-companion|construct-innovation|prototype-companion|undead-companion)/;

function slugOf(item: ItemPF2e): string {
  const slug = item.system?.slug ?? item.slug;
  if (slug) return String(slug);
  return String(item.name ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Character snapshot for the eligibility rules. PF2e 8.5.1 has no companion actor link for characters, so
 * companions are a best effort from feat / class feature slugs (Mature Animal Companion, Advanced Construct
 * Companion, ...).
 */
export function snapshotFromActor(actor: ActorPF2e): CharacterSnapshot {
  const feats: ItemPF2e[] = actor?.itemTypes?.feat ?? [];
  const slugs = feats.map(slugOf);
  const input = progressionInput(actor);
  const destiny = feats.find((f) => (f.system?.traits?.value ?? []).includes("destiny"));
  const entries: ItemPF2e[] = actor?.itemTypes?.spellcastingEntry ?? [];
  const hasAnimalCompanion = slugs.some((s) => MATURE_ANIMAL.test(s) && !s.includes("construct"));
  const hasConstructCompanion = slugs.some((s) => ADVANCED_CONSTRUCT.test(s));
  const focusMax = Number(actor?.system?.resources?.focus?.max ?? 0);
  return {
    level: input.level,
    progression: input.progression,
    tier: input.tier,
    callingName: callingItem(actor)?.name ?? null,
    ownedFeatNames: feats.map((f) => String(f.name).toLowerCase()),
    ownedDestiny: destiny?.name ?? null,
    hasAnimalCompanion,
    hasConstructCompanion,
    hasAnyCompanion: hasAnimalCompanion || hasConstructCompanion || slugs.some((s) => ANY_COMPANION.test(s)),
    canCastFromSlots: entries.some((e) => {
      const type = e.system?.prepared?.value;
      return type === "prepared" || type === "spontaneous";
    }),
    hasFocusPool: focusMax > 0,
    openSlotLevels: openSlotLevels(input),
    lockedSlotLevels: lockedSlotLevels(input),
  };
}

/** Evaluates one feat for one slot of the actor. */
export function evaluateFeat(
  actor: ActorPF2e,
  feat: FeatRecord,
  slotId: string,
  context: { snapshot?: CharacterSnapshot; knownFeatNames?: ReadonlySet<string> } = {},
): Eligibility {
  const snapshot = context.snapshot ?? snapshotFromActor(actor);
  const level = slotLevel(slotId) ?? NaN;
  const opts = context.knownFeatNames ? { knownFeatNames: context.knownFeatNames } : {};
  return checkEligibility(feat, { id: slotId, level }, snapshot, opts);
}

/** Localizes a reason or warning note. */
export function noteText(note: Note): string {
  return t(note.key, note.data);
}
