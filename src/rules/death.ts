/**
 * Mythic death (optional rule): an active mythic character whose dying value would reach its maximum instead
 * gains doomed (+1) and stabilizes at 0 HP. Once doomed would reach 4 the character dies normally. Pure.
 */

/** Doomed value at which a mythic character dies. */
export const MYTHIC_DEATH_DOOMED = 4;

export interface DeathInput {
  /** The dying value the change would set (after PF2e's own adjustments). */
  dyingNew: number;
  /** PF2e's current maximum dying value (`actor.attributes.dying.max`, already reduced by doomed). */
  dyingMax: number;
  /** Current doomed value. */
  doomed: number;
}

export interface DeathDecision {
  intercept: boolean;
  /** Doomed value after the interception (unchanged when not intercepted). */
  newDoomed: number;
}

export function mythicDeathDecision({ dyingNew, dyingMax, doomed }: DeathInput): DeathDecision {
  const current = Math.max(0, Math.trunc(Number(doomed) || 0));
  const reachesMax = Number(dyingNew) >= Number(dyingMax);
  if (!reachesMax) return { intercept: false, newDoomed: current };
  const next = current + 1;
  if (next >= MYTHIC_DEATH_DOOMED) return { intercept: false, newDoomed: current };
  return { intercept: true, newDoomed: next };
}
