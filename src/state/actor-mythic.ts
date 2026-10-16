/**
 * Reads PF2e-owned mythic data from an actor and combines it with module state.
 */
import { PF2E } from "../constants.js";
import {
  lockedSlotLevels,
  openSlotLevels,
  slotId,
  slotLevel,
  standardSlotLevels,
  type ProgressionInput,
} from "../rules/progression.js";
import { getState, isMythicActive } from "./flags.js";

export function mythicPoints(actor: ActorPF2e): { value: number; max: number } {
  const r = actor?.system?.resources?.mythicPoints;
  return { value: Number(r?.value ?? 0), max: Number(r?.max ?? 0) };
}

export async function setMythicPoints(actor: ActorPF2e, value: number): Promise<void> {
  await actor.update({ "system.resources.mythicPoints.value": value });
}

/** PF2e tier for Alternate Mythic Progression (flags.pf2e.featLimits.mythic). */
export function mythicTier(actor: ActorPF2e): number {
  return Number(actor?.flags?.pf2e?.featLimits?.[PF2E.featGroup] ?? 0);
}

export async function setMythicTier(actor: ActorPF2e, tier: number): Promise<void> {
  await actor.update({ [`flags.pf2e.featLimits.${PF2E.featGroup}`]: tier });
}

export function hasTrait(item: ItemPF2e, trait: string): boolean {
  const traits: string[] = item?.system?.traits?.value ?? [];
  return traits.includes(trait);
}

/** Feat-like items that make up mythic power: the Calling, mythic and destiny feats (not their grants). */
export function isMythicItem(item: ItemPF2e): boolean {
  if (item?.type !== "feat") return false;
  if (item.system?.category === PF2E.callingCategory) return true;
  return PF2E.mythicTraits.some((t) => hasTrait(item, t));
}

export function callingItem(actor: ActorPF2e): ItemPF2e | null {
  return actor?.itemTypes?.feat?.find((f: ItemPF2e) => f.system?.category === PF2E.callingCategory) ?? null;
}

export function mythicItems(actor: ActorPF2e): ItemPF2e[] {
  return (actor?.itemTypes?.feat ?? []).filter(isMythicItem);
}

export function progressionInput(actor: ActorPF2e): ProgressionInput {
  const s = getState(actor);
  return {
    progression: s.progression,
    level: Number(actor?.level ?? 1),
    tier: mythicTier(actor),
    lateStart: { grantedLevel: s.grantedLevel, released: s.lateStart.released },
  };
}

/** Slot ids PF2e shows that the module locks for this actor (late start). */
export function lockedSlotIds(actor: ActorPF2e): string[] {
  if (!isMythicActive(actor)) return [];
  return lockedSlotLevels(progressionInput(actor)).map(slotId);
}

export function openSlotIds(actor: ActorPF2e): string[] {
  if (!isMythicActive(actor)) return [];
  return openSlotLevels(progressionInput(actor)).map(slotId);
}

/** Item currently in a mythic slot, by PF2e `system.location`. */
export function featInSlot(actor: ActorPF2e, id: string): ItemPF2e | null {
  return actor?.itemTypes?.feat?.find((f: ItemPF2e) => f.system?.location === id) ?? null;
}

/** Open (unlocked) slots with no feat, plus the Calling slot if empty. */
export function emptyOpenSlotIds(actor: ActorPF2e): string[] {
  if (!isMythicActive(actor)) return [];
  const ids = openSlotIds(actor).filter((id) => !featInSlot(actor, id));
  if (!callingItem(actor)) ids.unshift(PF2E.callingSlot);
  return ids;
}

export { slotId, slotLevel, standardSlotLevels };
