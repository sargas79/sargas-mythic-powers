/**
 * Pure helpers for the Mythic Console and the points service: pip states, trial progress bars, signed deltas,
 * hero point math and which ledger entry can be undone. No Foundry globals.
 */
import { MAX_MYTHIC_POINTS } from "./awards.js";
import { MAX_TIER, TIER_THRESHOLDS } from "./progression.js";

export const MAX_HERO_POINTS = 3;

export interface Pip {
  /** Value the actor gets when this pip is clicked. */
  value: number;
  on: boolean;
}

/** One pip per point up to `max`. */
export function pipStates(value: number, max = MAX_MYTHIC_POINTS): Pip[] {
  const out: Pip[] = [];
  for (let i = 1; i <= Math.max(0, max); i++) out.push({ value: i, on: i <= value });
  return out;
}

/** Clicking the highest lit pip turns it off; any other pip sets the value to that pip. */
export function pipTarget(current: number, clicked: number): number {
  return clicked === current ? clicked - 1 : clicked;
}

/** "+1", "-3" or "±0". */
export function signedDelta(before: number, after: number): string {
  const d = after - before;
  if (d === 0) return "±0";
  return d > 0 ? `+${d}` : `${d}`;
}

export interface TrialProgress {
  tier: number;
  /** Trials done toward the next tier. */
  done: number;
  /** Trials the next tier needs in total from the current one. */
  span: number;
  /** 0-100. */
  percent: number;
  nextTier: number | null;
}

/** Progress bar from the stored tier toward the next one. */
export function trialProgress(trials: number, tier: number): TrialProgress {
  const t = Math.max(0, Math.min(MAX_TIER, Math.trunc(tier)));
  if (t >= MAX_TIER) return { tier: t, done: 0, span: 0, percent: 100, nextTier: null };
  const from = TIER_THRESHOLDS[t]!;
  const to = TIER_THRESHOLDS[t + 1]!;
  const span = to - from;
  const done = Math.max(0, Math.min(span, trials - from));
  return { tier: t, done, span, percent: Math.round((done / span) * 100), nextTier: t + 1 };
}

/** New Hero Point value, or null when the character is already at the cap (or can't hold any). */
export function heroPointsAfter(current: number, max = MAX_HERO_POINTS): number | null {
  const cap = Math.min(MAX_HERO_POINTS, Number.isFinite(max) ? max : MAX_HERO_POINTS);
  if (cap <= 0) return null;
  const now = Math.max(0, Math.trunc(Number.isFinite(current) ? current : 0));
  return now >= cap ? null : now + 1;
}

export interface UndoCandidate {
  id: string;
  kind: string;
  undone?: boolean;
  pointsBefore?: number;
  actorUuid?: string | null;
  undo?: Record<string, unknown> | null;
}

/**
 * Id of the ledger entry Undo applies to: the newest "points" entry that isn't undone, provided it records
 * the value before the change. Entries are newest first.
 */
export function undoableEntryId(entries: readonly UndoCandidate[]): string | null {
  const newest = entries.find((e) => e.kind === "points" && !e.undone);
  if (!newest || typeof newest.pointsBefore !== "number") return null;
  return newest.id;
}

/**
 * Ids of every ledger entry the console offers Undo on: the points entry from `undoableEntryId`, plus each
 * character's newest mythic death entry when it isn't undone and carries its undo record. Newest first.
 */
export function undoableEntryIds(entries: readonly UndoCandidate[]): Set<string> {
  const ids = new Set<string>();
  const points = undoableEntryId(entries);
  if (points) ids.add(points);
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.kind !== "death" || !e.actorUuid || seen.has(e.actorUuid)) continue;
    seen.add(e.actorUuid);
    if (!e.undone && e.undo?.type === "mythicDeath") ids.add(e.id);
  }
  return ids;
}

/** Initials for an avatar fallback. */
export function initials(name: string): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** Distinct, sorted, non-empty source titles. */
export function distinctSources(sources: readonly string[]): string[] {
  return [...new Set(sources.map((s) => String(s ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}
