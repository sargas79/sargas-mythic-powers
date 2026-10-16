/**
 * OWNER: agent B. Feature "visibility" (issue #7). A character without active mythic power looks exactly like
 * one in a world with PF2e Mythic Rules disabled:
 * - the PF2e character sheet loses its "mythic" feat group (and a stray Mythic Points header resource);
 * - the chat "Reroll using a Mythic Point" entry is hidden for its messages;
 * - mythic feats can't be added or slotted (neutral warning), and for active characters feats can't go into
 *   slots locked by late start, and players can't add a Calling unless the Calling choice is theirs.
 * Pre-hooks run on the client making the change and stay synchronous.
 * Module code that must bypass the guard (for example restoring suspended items) passes
 * `{ "sargas-mythic-powers": { bypass: true } }` in the operation options.
 */
import { MODULE_ID, PF2E } from "../constants.js";
import { notify } from "../foundry/i18n.js";
import { getState, isCharacter, isMythicActive } from "../state/flags.js";
import { callingItem, isMythicItem, lockedSlotIds } from "../state/actor-mythic.js";
import type { Feature } from "./types.js";

/** DOM root of an AppV1 (jQuery) or AppV2 (HTMLElement) render hook argument. */
export function rootElement(html: unknown): HTMLElement | null {
  if (html instanceof HTMLElement) return html;
  const first = (html as { 0?: unknown } | null)?.[0];
  return first instanceof HTMLElement ? first : null;
}

function bypass(options: unknown): boolean {
  return !!(options as Record<string, { bypass?: boolean } | undefined>)?.[MODULE_ID]?.bypass;
}

/**
 * A GM re-creating an item kept in `state.suspended` (enable after disable, which recreates the items with
 * keepId before the state flips to enabled).
 */
function isRestoredItem(
  actor: ActorPF2e,
  item: ItemPF2e,
  data: Record<string, unknown>,
  options: unknown,
  userId: string,
): boolean {
  if (!game.users?.get(userId)?.isGM || !(options as { keepId?: boolean })?.keepId) return false;
  const id = (data?._id as string | undefined) ?? item?.id;
  const kept = getState(actor).suspended?.items ?? [];
  return !!id && kept.some((i) => (i as { _id?: string })?._id === id);
}

/** Why a feat may not be placed on this actor, as a lang key, or null when it may. */
export function blockReason(
  actor: ActorPF2e,
  item: ItemPF2e,
  location: string | null | undefined,
  userId: string,
): string | null {
  if (!isCharacter(actor) || item?.type !== "feat") return null;
  const active = isMythicActive(actor);
  if (isMythicItem(item) && !active) return "visibility.blockedFeat";
  if (!active) return null;
  if (location && lockedSlotIds(actor).includes(location)) return "visibility.lockedSlot";
  if (item.system?.category === PF2E.callingCategory) {
    const user = game.users?.get(userId);
    if (!user?.isGM) {
      const existing = callingItem(actor);
      if (getState(actor).callingChoice === "gm") return "visibility.callingGMOnly";
      if (existing && existing.id !== item.id) return "visibility.callingGMOnly";
    }
  }
  return null;
}

function onPreCreateItem(item: ItemPF2e, data: Record<string, unknown>, options: unknown, userId: string) {
  const actor = item?.parent;
  if (!actor || actor.documentName !== "Actor" || bypass(options)) return true;
  if (isRestoredItem(actor, item, data, options, userId)) return true;
  const location = item.system?.location ?? foundry.utils.getProperty(data, "system.location") ?? null;
  const reason = blockReason(actor, item, location, userId);
  if (!reason) return true;
  if (userId === game.user?.id) notify.warn(reason);
  return false;
}

function onPreUpdateItem(item: ItemPF2e, changes: Record<string, unknown>, options: unknown, userId: string) {
  const actor = item?.parent;
  if (!actor || actor.documentName !== "Actor" || bypass(options)) return true;
  if (!foundry.utils.hasProperty(changes ?? {}, "system.location")) return true;
  const location = foundry.utils.getProperty(changes, "system.location");
  // Unslotting is always fine.
  if (!location) return true;
  let reason: string | null = null;
  if (isMythicItem(item) && !isMythicActive(actor) && isCharacter(actor)) reason = "visibility.blockedFeat";
  else if (isMythicActive(actor) && lockedSlotIds(actor).includes(String(location))) {
    reason = "visibility.lockedSlot";
  }
  if (!reason) return true;
  if (userId === game.user?.id) notify.warn(reason);
  return false;
}

/** Removes every mythic trace from a non-active character's sheet. */
function onRenderCharacterSheet(app: { actor?: ActorPF2e }, html: unknown): void {
  const actor = app?.actor;
  if (!actor || isMythicActive(actor)) return;
  const root = rootElement(html);
  if (!root) return;
  for (const el of root.querySelectorAll(`[data-group-id="${PF2E.featGroup}"]`)) el.remove();
  // PF2e shows Mythic Points instead of Hero Points once a Calling is owned; hide it if one is left over.
  for (const pips of root.querySelectorAll(`[data-resource="${PF2E.mythicPointsResource}"]`)) {
    (pips.closest(".dots") ?? pips).remove();
  }
}

interface ContextEntry {
  label?: string;
  name?: string;
  visible?: boolean | ((target: unknown) => boolean);
  condition?: boolean | ((target: unknown) => boolean);
}

/** Hides PF2e's "Reroll using a Mythic Point" entry on messages from non-active characters. */
function onChatContext(_app: unknown, entries: ContextEntry[]): void {
  for (const entry of entries ?? []) {
    if ((entry.label ?? entry.name) !== "PF2E.RerollMenu.MythicPoint") continue;
    const original = entry.visible ?? entry.condition ?? true;
    entry.visible = (target: unknown) => {
      const el = rootElement(target);
      const message = game.messages?.get(el?.dataset.messageId ?? "");
      if (!message || !isMythicActive(message.actor)) return false;
      return typeof original === "function" ? original(target) : !!original;
    };
    delete entry.condition;
  }
}

export const feature: Feature = {
  id: "visibility",
  register() {
    Hooks.on("preCreateItem", onPreCreateItem);
    Hooks.on("preUpdateItem", onPreUpdateItem);
    Hooks.on("renderCharacterSheetPF2e", onRenderCharacterSheet);
    Hooks.on("getChatMessageContextOptions", onChatContext);
  },
};
