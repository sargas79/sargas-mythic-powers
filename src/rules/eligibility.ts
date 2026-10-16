/**
 * Mythic feat eligibility (War of Immortals pg. 76-77). Pure functions: no Foundry globals.
 *
 * Decides whether a candidate feat can go into one PF2e mythic slot ("mythic-N") for a character snapshot,
 * and why not. Reasons and warnings are localization keys plus data, never English text; the UI localizes
 * them under `sargas-mythic-powers.feats.reason.*` / `feats.warning.*`.
 */
import type { Progression } from "./progression.js";
import { DESTINY_LEVEL } from "./progression.js";

/** Compact feat record (from the compendium index or the test fixture). */
export interface FeatRecord {
  id?: string;
  uuid?: string;
  name: string;
  level: number;
  traits: string[];
  prerequisites: string[];
  publication?: string;
}

export interface SlotRef {
  id: string;
  level: number;
}

/** What the rules need to know about the character. Built by the app from the actor. */
export interface CharacterSnapshot {
  level: number;
  progression: Progression;
  tier: number;
  callingName: string | null;
  /** Lowercased names of every feat-like item the character owns. */
  ownedFeatNames: string[];
  /** Name of the owned destiny dedication, or null. */
  ownedDestiny: string | null;
  /** Mature animal companion or better. */
  hasAnimalCompanion: boolean;
  /** Advanced construct companion or better. */
  hasConstructCompanion: boolean;
  canCastFromSlots: boolean;
  openSlotLevels: number[];
  lockedSlotLevels: number[];
  /** Any companion at all (young animal companion, construct). Undefined = unknown. */
  hasAnyCompanion?: boolean;
  /** Undefined = unknown (the prerequisite becomes a warning). */
  hasFocusPool?: boolean;
}

/** A localization key (relative to the module namespace) plus format data. */
export interface Note {
  key: string;
  data?: Record<string, string | number>;
}

export interface Eligibility {
  eligible: boolean;
  /** True when the character already owns this feat. */
  owned: boolean;
  reasons: Note[];
  warnings: Note[];
}

export interface EligibilityContext {
  /**
   * Lowercased names of every feat known to exist (e.g. the whole feats pack index). A prerequisite that
   * matches one of these is a feat prerequisite. Without it, Title Case text is treated as a feat name.
   */
  knownFeatNames?: ReadonlySet<string>;
}

export const REASON = {
  notMythic: "feats.reason.notMythic",
  owned: "feats.reason.owned",
  invalidSlot: "feats.reason.invalidSlot",
  slotLocked: "feats.reason.slotLocked",
  slotNotOpen: "feats.reason.slotNotOpen",
  levelTooHigh: "feats.reason.levelTooHigh",
  destinySlotOnly: "feats.reason.destinySlotOnly",
  oneDestiny: "feats.reason.oneDestiny",
  needsDestiny: "feats.reason.needsDestiny",
  needsCalling: "feats.reason.needsCalling",
  needsFeat: "feats.reason.needsFeat",
  needsAdvancedCompanion: "feats.reason.needsAdvancedCompanion",
  needsCompanion: "feats.reason.needsCompanion",
  needsSlotCasting: "feats.reason.needsSlotCasting",
  needsFocusPool: "feats.reason.needsFocusPool",
} as const;

export const WARNING = {
  checkPrerequisite: "feats.warning.checkPrerequisite",
} as const;

export type PrerequisiteKind =
  | "calling"
  | "dedication"
  | "feat"
  | "advancedCompanion"
  | "anyCompanion"
  | "slotCasting"
  | "focusPool"
  | "unknown";

/** Lowercase, straight apostrophes, collapsed spaces, no trailing period. */
export function normalizeName(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").replace(/\.$/, "").trim();
}

const SMALL_WORDS = new Set("a an and as at be by for from in is my of on or the to with".split(" "));

/** Heuristic for feat names when no name list is available: Title Case, no sentence punctuation. */
function looksLikeFeatName(text: string): boolean {
  const s = text.trim();
  if (!s || /[.;:]$/.test(s) || s.length > 60) return false;
  const words = s.split(/\s+/);
  if (!/^[A-Z0-9]/.test(words[0]!)) return false;
  return words.every((w) => /^[A-Z0-9("']/.test(w) || SMALL_WORDS.has(w.toLowerCase()));
}

/** Classifies one prerequisite string from `system.prerequisites.value[].value`. */
export function classifyPrerequisite(text: string, context: EligibilityContext = {}): PrerequisiteKind {
  const n = normalizeName(text);
  if (/\bcalling\b/.test(n) && n.split(/\s+or\s+/).every((p) => /^[a-z' -]+'s calling$/.test(p.trim()))) {
    return "calling";
  }
  if (/^[a-z' -]+ dedication$/.test(n)) return "dedication";
  if (/mature animal companion|advanced construct companion/.test(n)) return "advancedCompanion";
  if (/^(you have )?an? animal companion( or pet)?$/.test(n)) return "anyCompanion";
  if (/cast spells from (spell )?slots/.test(n)) return "slotCasting";
  if (/focus pool/.test(n)) return "focusPool";
  if (context.knownFeatNames) return context.knownFeatNames.has(n) ? "feat" : "unknown";
  return looksLikeFeatName(text) ? "feat" : "unknown";
}

function checkPrerequisite(
  text: string,
  snap: CharacterSnapshot,
  owned: ReadonlySet<string>,
  context: EligibilityContext,
): { reason?: Note; warning?: Note } {
  const n = normalizeName(text);
  const kind = classifyPrerequisite(text, context);
  switch (kind) {
    case "calling": {
      const calling = snap.callingName ? normalizeName(snap.callingName) : null;
      const options = n.split(/\s+or\s+/).map((p) => p.trim());
      return calling && options.includes(calling)
        ? {}
        : { reason: { key: REASON.needsCalling, data: { name: text } } };
    }
    case "dedication": {
      const destiny = snap.ownedDestiny ? normalizeName(snap.ownedDestiny) : null;
      return destiny === n || owned.has(n)
        ? {}
        : { reason: { key: REASON.needsDestiny, data: { name: text } } };
    }
    // Companions and pets can't be detected reliably from the character alone, so a missing one is a GM
    // warning, never a block.
    case "advancedCompanion":
      return snap.hasAnimalCompanion || snap.hasConstructCompanion
        ? {}
        : { warning: { key: WARNING.checkPrerequisite, data: { text } } };
    case "anyCompanion":
      return snap.hasAnyCompanion || snap.hasAnimalCompanion || snap.hasConstructCompanion
        ? {}
        : { warning: { key: WARNING.checkPrerequisite, data: { text } } };
    case "slotCasting":
      return snap.canCastFromSlots ? {} : { reason: { key: REASON.needsSlotCasting } };
    case "focusPool":
      if (snap.hasFocusPool === undefined)
        return { warning: { key: WARNING.checkPrerequisite, data: { text } } };
      return snap.hasFocusPool ? {} : { reason: { key: REASON.needsFocusPool } };
    case "feat":
      return owned.has(n) ? {} : { reason: { key: REASON.needsFeat, data: { name: text } } };
    default:
      return owned.has(n) ? {} : { warning: { key: WARNING.checkPrerequisite, data: { text } } };
  }
}

/** Can `feat` go into `slot` for this character? Every failing rule adds a reason. */
export function checkEligibility(
  feat: FeatRecord,
  slot: SlotRef,
  snap: CharacterSnapshot,
  context: EligibilityContext = {},
): Eligibility {
  const reasons: Note[] = [];
  const warnings: Note[] = [];
  const owned = new Set(snap.ownedFeatNames.map(normalizeName));
  const name = normalizeName(feat.name);
  const traits = feat.traits ?? [];
  const isDestiny = traits.includes("destiny");
  const isOwned = owned.has(name);

  if (!traits.includes("mythic")) reasons.push({ key: REASON.notMythic });
  if (isOwned) reasons.push({ key: REASON.owned });

  if (!Number.isFinite(slot.level) || slot.level <= 0) {
    reasons.push({ key: REASON.invalidSlot, data: { slot: slot.id } });
  } else if (snap.lockedSlotLevels.includes(slot.level)) {
    reasons.push({ key: REASON.slotLocked });
  } else if (!snap.openSlotLevels.includes(slot.level)) {
    reasons.push({ key: REASON.slotNotOpen });
  }

  if (feat.level > slot.level) {
    reasons.push({ key: REASON.levelTooHigh, data: { level: feat.level, slot: slot.level } });
  }
  if (slot.level === DESTINY_LEVEL && !isDestiny) reasons.push({ key: REASON.destinySlotOnly });
  if (isDestiny && !isOwned && snap.ownedDestiny && normalizeName(snap.ownedDestiny) !== name) {
    reasons.push({ key: REASON.oneDestiny, data: { name: snap.ownedDestiny } });
  }

  for (const text of feat.prerequisites ?? []) {
    if (!text?.trim()) continue;
    const r = checkPrerequisite(text, snap, owned, context);
    if (r.reason) reasons.push(r.reason);
    if (r.warning) warnings.push(r.warning);
  }

  return { eligible: reasons.length === 0, owned: isOwned, reasons, warnings };
}

/** True when the feat is a destiny dedication (trait destiny). */
export function isDestinyFeat(feat: Pick<FeatRecord, "traits">): boolean {
  return (feat.traits ?? []).includes("destiny");
}
