/**
 * OWNER: agent D (M3). Mythic Point changes with ledger entries. GM only (players reach these via runAsGM).
 */
import type { AwardKind } from "../rules/awards.js";

export async function changePoints(
  _actor: ActorPF2e,
  _kind: AwardKind,
  _options: { custom?: number; reason?: string } = {},
): Promise<void> {
  throw new Error("not implemented");
}
/** Every enabled mythic character to 3, advances the session counter. */
export async function startSession(): Promise<void> {
  throw new Error("not implemented");
}
/** +3 to every enabled mythic character. */
export async function awardDeed(_reason?: string): Promise<void> {
  throw new Error("not implemented");
}
/** 2 to the killer (if mythic), 1 to every other enabled mythic character. */
export async function awardKill(_killer: ActorPF2e | null, _defeatedName: string): Promise<void> {
  throw new Error("not implemented");
}
/** Actors that count as mythic party members: characters with active mythic power. */
export function activeMythicCharacters(): ActorPF2e[] {
  throw new Error("not implemented");
}
