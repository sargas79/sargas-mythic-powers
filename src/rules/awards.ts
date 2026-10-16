/**
 * Mythic Point rules (War of Immortals pg. 76). Pure functions.
 * - Max 3, refreshed to 3 at the start of each session.
 * - Slaying a mythic foe: 2 to whoever defeated it, 1 to each other mythic character.
 * - Mythic deed: 3 to each mythic character.
 * - Acting on an edict: 1. Violating an anathema: lose all.
 */

export const MAX_MYTHIC_POINTS = 3;
export const KILLER_AWARD = 2;
export const ASSIST_AWARD = 1;
export const DEED_AWARD = 3;
export const EDICT_AWARD = 1;

export function clampPoints(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_MYTHIC_POINTS, Math.max(0, Math.trunc(value)));
}

export function applyDelta(current: number, delta: number): number {
  return clampPoints(current + delta);
}

/** Points each mythic character gains for a mythic kill. `killerId` may be null or non-mythic. */
export function killAwards(killerId: string | null, mythicIds: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of mythicIds) out.set(id, id === killerId ? KILLER_AWARD : ASSIST_AWARD);
  return out;
}

export type AwardKind =
  "edict" | "deed" | "kill" | "killAssist" | "anathema" | "custom" | "session" | "regain";

/** New value for a points change of the given kind. */
export function pointsAfter(kind: AwardKind, current: number, custom = 0): number {
  switch (kind) {
    case "edict":
    case "regain":
      return applyDelta(current, EDICT_AWARD);
    case "deed":
      return applyDelta(current, DEED_AWARD);
    case "kill":
      return applyDelta(current, KILLER_AWARD);
    case "killAssist":
      return applyDelta(current, ASSIST_AWARD);
    case "anathema":
      return 0;
    case "session":
      return MAX_MYTHIC_POINTS;
    case "custom":
      return applyDelta(current, custom);
  }
}
