/**
 * Pure helpers for granting, suspending and announcing mythic power. No Foundry globals: inputs are plain
 * item source objects and user summaries so the logic can be unit tested.
 */
import { lateStartOwed, standardSlotLevels, type Progression } from "./progression.js";

/** The parts of an item's source data the suspension logic reads. */
export interface ItemSourceLike {
  _id: string;
  type: string;
  system?: { category?: string | null; traits?: { value?: string[] } } | null;
  flags?: {
    pf2e?: {
      grantedBy?: { id?: string | null; onDelete?: string | null } | null;
      itemGrants?: Record<string, { id?: string | null; onDelete?: string | null } | null> | null;
    } | null;
  } | null;
}

const MYTHIC_TRAITS = ["mythic", "calling", "destiny"];

/** Same test as `isMythicItem` in state/actor-mythic.ts, on source data. */
export function isMythicSource(item: ItemSourceLike): boolean {
  if (item.type !== "feat") return false;
  if (item.system?.category === "calling") return true;
  const traits = item.system?.traits?.value ?? [];
  return MYTHIC_TRAITS.some((t) => traits.includes(t));
}

/**
 * Ids of every item to store and delete when mythic power is suspended: the mythic items, everything they
 * granted (PF2e GrantItem children, recursively, found through both `itemGrants` and `grantedBy`), and any
 * granter that PF2e would delete along with them (`onDelete: "cascade"` on the granter's record), so nothing
 * is lost without a copy. Order follows `items`.
 */
export function collectSuspendIds(items: ItemSourceLike[]): string[] {
  const byId = new Map(items.map((i) => [i._id, i]));
  const picked = new Set<string>();
  const queue: string[] = [];
  const add = (id: string | null | undefined) => {
    if (!id || picked.has(id) || !byId.has(id)) return;
    picked.add(id);
    queue.push(id);
  };
  for (const item of items) if (isMythicSource(item)) add(item._id);

  while (queue.length) {
    const id = queue.shift()!;
    const item = byId.get(id)!;
    // Children recorded on the parent.
    for (const grant of Object.values(item.flags?.pf2e?.itemGrants ?? {})) add(grant?.id);
    // Children that point back at this item.
    for (const other of items) if (other.flags?.pf2e?.grantedBy?.id === id) add(other._id);
    // A granter whose record for this item cascades would be deleted too.
    const parentId = item.flags?.pf2e?.grantedBy?.id;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) {
      const record = Object.values(parent.flags?.pf2e?.itemGrants ?? {}).find((g) => g?.id === id);
      if (record?.onDelete === "cascade") add(parent._id);
    }
  }
  return items.filter((i) => picked.has(i._id)).map((i) => i._id);
}

/** Stored items that are not on the actor any more (safe to recreate with their original ids). */
export function itemsToRestore<T extends { _id?: string }>(stored: T[], existingIds: Iterable<string>): T[] {
  const existing = new Set(existingIds);
  return stored.filter((i) => !i._id || !existing.has(i._id));
}

/** Merge a new batch of suspended items into an earlier one (interrupted disable), deduplicated by id. */
export function mergeSuspended<T extends { _id?: string }>(earlier: T[], next: T[]): T[] {
  const seen = new Set(earlier.map((i) => i._id).filter(Boolean));
  return [...earlier, ...next.filter((i) => !i._id || !seen.has(i._id))];
}

/** Mythic feats a character of `level` is owed right away under each progression (grant dialog hint). */
export function owedFeats(progression: Progression, level: number): number {
  switch (progression) {
    case "lateStart":
      return lateStartOwed(level).length;
    case "trials":
      return 0;
    default:
      return standardSlotLevels(level).length;
  }
}

export interface UserSummary {
  id: string;
  isGM: boolean;
  /** Owner of the actor the card is about. */
  isOwner: boolean;
  active?: boolean;
}

/** Whisper recipients of a grant / enable card: every GM plus the actor's non-GM owners. Never anyone else. */
export function cardRecipients(users: UserSummary[]): string[] {
  return users.filter((u) => u.isGM || u.isOwner).map((u) => u.id);
}

export interface GrantMeta {
  /** The first Calling after the grant has been handled (points filled). */
  firstCallingDone: boolean;
  startWithFullPoints: boolean;
}

/** Whether a newly created Calling should fill Mythic Points to 3. No grant bookkeeping means no fill. */
export function shouldFillPoints(args: {
  granted: boolean;
  enabled: boolean;
  meta: Partial<GrantMeta> | null | undefined;
}): boolean {
  if (!args.granted || !args.enabled || !args.meta) return false;
  if (args.meta.firstCallingDone) return false;
  return args.meta.startWithFullPoints ?? true;
}

/** Whether the Choose Calling button applies to a grant card. */
export function showChooseCalling(args: {
  callingChoice: "player" | "gm";
  hasCalling: boolean;
  active: boolean;
  canUse: boolean;
}): boolean {
  return args.callingChoice === "player" && !args.hasCalling && args.active && args.canUse;
}
