/**
 * OWNER: agent A. Feature "grant": GM-only actor directory menu entries and badges, the GM sheet header
 * control, full Mythic Points on the first Calling, and the Choose Calling button on grant chat cards.
 */
import { openCallingPicker } from "../apps/calling-picker.js";
import { HOOKS, MODULE_ID, PF2E } from "../constants.js";
import { esc, notify, t } from "../foundry/i18n.js";
import { isActiveGM } from "../foundry/socket.js";
import { shouldFillPoints, showChooseCalling } from "../rules/suspend.js";
import {
  disableMythic,
  enableMythic,
  getGrantMeta,
  openGrantDialog,
  revokeMythic,
  setGrantMeta,
} from "../services/mythic-service.js";
import { callingItem, setMythicPoints } from "../state/actor-mythic.js";
import { getState, isCharacter, isMythicActive } from "../state/flags.js";
import type { Feature } from "./types.js";

/** Accepts an HTMLElement or a jQuery object (AppV1 render hooks). */
function toElement(html: unknown): HTMLElement | null {
  if (html instanceof HTMLElement) return html;
  const first = (html as { [0]?: unknown } | null)?.[0];
  return first instanceof HTMLElement ? first : null;
}

function actorFromLi(li: HTMLElement): ActorPF2e | null {
  const id = (li.closest("[data-entry-id]") as HTMLElement | null)?.dataset.entryId;
  return id ? (game.actors?.get(id) ?? null) : null;
}

// ---------------------------------------------------------------------------------------------------------
// Actor directory
// ---------------------------------------------------------------------------------------------------------

function contextOptions(_app: unknown, options: Record<string, unknown>[]): void {
  if (!game.user?.isGM) return;
  const gmActor = (li: HTMLElement) => {
    const actor = actorFromLi(li);
    return game.user.isGM && actor && isCharacter(actor) ? actor : null;
  };
  options.push(
    {
      label: t("grant.menu.grant"),
      icon: "fa-solid fa-star",
      group: MODULE_ID,
      visible: (li: HTMLElement) => {
        const actor = gmActor(li);
        return !!actor && !getState(actor).granted;
      },
      onClick: (_e: Event, li: HTMLElement) => {
        const actor = actorFromLi(li);
        if (actor) void openGrantDialog(actor);
      },
    },
    {
      label: t("grant.menu.disable"),
      icon: "fa-solid fa-pause",
      group: MODULE_ID,
      visible: (li: HTMLElement) => {
        const actor = gmActor(li);
        return !!actor && getState(actor).granted && getState(actor).enabled;
      },
      onClick: (_e: Event, li: HTMLElement) => {
        const actor = actorFromLi(li);
        if (actor) void disableMythic(actor);
      },
    },
    {
      label: t("grant.menu.enable"),
      icon: "fa-solid fa-play",
      group: MODULE_ID,
      visible: (li: HTMLElement) => {
        const actor = gmActor(li);
        return !!actor && getState(actor).granted && !getState(actor).enabled;
      },
      onClick: (_e: Event, li: HTMLElement) => {
        const actor = actorFromLi(li);
        if (actor) void enableMythic(actor);
      },
    },
    {
      label: t("grant.menu.revoke"),
      icon: "fa-solid fa-ban",
      group: MODULE_ID,
      visible: (li: HTMLElement) => {
        const actor = gmActor(li);
        return !!actor && getState(actor).granted;
      },
      onClick: (_e: Event, li: HTMLElement) => {
        const actor = actorFromLi(li);
        if (actor) void revokeMythic(actor);
      },
    },
  );
}

function decorateDirectory(_app: unknown, html: unknown): void {
  if (!game.user?.isGM) return;
  const root = toElement(html);
  if (!root) return;
  root.querySelectorAll<HTMLElement>(".directory-item[data-entry-id]").forEach((li) => {
    li.querySelector(".smp-dir-badge")?.remove();
    const actor = game.actors?.get(li.dataset.entryId);
    if (!actor || !isCharacter(actor)) return;
    const state = getState(actor);
    if (!state.granted) return;
    const badge = document.createElement("span");
    badge.className = `smp-dir-badge ${state.enabled ? "smp-dir-badge-on" : "smp-dir-badge-off"}`;
    badge.textContent = state.enabled ? t("grant.badge.active") : t("grant.badge.disabled");
    badge.title = state.enabled ? t("grant.badge.activeHint") : t("grant.badge.disabledHint");
    const name = li.querySelector(".entry-name");
    if (name) name.after(badge);
    else li.append(badge);
  });
}

// ---------------------------------------------------------------------------------------------------------
// Sheet header control (PF2e character sheet is an AppV1 ActorSheet)
// ---------------------------------------------------------------------------------------------------------

async function openStateDialog(actor: ActorPF2e): Promise<void> {
  const state = getState(actor);
  if (!state.granted) return openGrantDialog(actor);
  const status = state.enabled ? t("grant.badge.active") : t("grant.badge.disabled");
  const content = `<p>${t("grant.status.content", {
    name: esc(actor.name),
    status: esc(status),
    progression: esc(t(`grant.progression.${state.progression}.label`)),
  })}</p>${state.source ? `<p><em>${esc(state.source)}</em></p>` : ""}`;
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: t("grant.status.title", { name: actor.name }), icon: "fa-solid fa-star" },
    content,
    rejectClose: false,
    buttons: [
      state.enabled
        ? { action: "disable", label: t("grant.menu.disable"), icon: "fa-solid fa-pause" }
        : { action: "enable", label: t("grant.menu.enable"), icon: "fa-solid fa-play", default: true },
      { action: "revoke", label: t("grant.menu.revoke"), icon: "fa-solid fa-ban" },
      { action: "close", label: t("grant.status.close"), default: state.enabled },
    ],
  });
  if (choice === "disable") await disableMythic(actor);
  else if (choice === "enable") await enableMythic(actor);
  else if (choice === "revoke") await revokeMythic(actor);
}

function headerButtons(sheet: { actor?: ActorPF2e }, buttons: Record<string, unknown>[]): void {
  if (!game.user?.isGM) return;
  const actor = sheet?.actor;
  if (!actor || !isCharacter(actor)) return;
  buttons.unshift({
    label: t("grant.header.label"),
    class: "smp-grant-header",
    icon: "fa-solid fa-star",
    onclick: () => void openStateDialog(actor),
  });
}

// ---------------------------------------------------------------------------------------------------------
// Full Mythic Points on the first Calling
// ---------------------------------------------------------------------------------------------------------

async function onCreateItem(item: ItemPF2e): Promise<void> {
  if (!isActiveGM()) return;
  if (item?.type !== "feat" || item.system?.category !== PF2E.callingCategory) return;
  const actor = item.parent;
  if (!actor || !isCharacter(actor)) return;
  const state = getState(actor);
  const meta = getGrantMeta(actor);
  if (!state.granted || !state.enabled || !meta || meta.firstCallingDone) return;
  const fill = shouldFillPoints({ granted: state.granted, enabled: state.enabled, meta });
  await setGrantMeta(actor, { firstCallingDone: true, startWithFullPoints: !!meta.startWithFullPoints });
  if (fill) await setMythicPoints(actor, 3);
}

// ---------------------------------------------------------------------------------------------------------
// Choose Calling button on grant cards
// ---------------------------------------------------------------------------------------------------------

interface CardFlag {
  kind?: string;
  actorUuid?: string;
}

function onRenderChatMessage(message: { flags?: Record<string, { card?: CardFlag }> }, html: unknown): void {
  const card = message?.flags?.[MODULE_ID]?.card;
  if (!card) return;
  const root = toElement(html);
  const button = root?.querySelector<HTMLButtonElement>(".smp-choose-calling");
  if (!root || !button) return;
  const actor = card.actorUuid ? fromUuidSync(card.actorUuid) : null;
  const canUse = !!actor && (game.user.isGM || actor.testUserPermission(game.user, "OWNER"));
  const show =
    !!actor &&
    showChooseCalling({
      callingChoice: getState(actor).callingChoice,
      hasCalling: !!callingItem(actor),
      active: isMythicActive(actor),
      canUse,
    });
  if (!show) {
    button.closest(".smp-buttons")?.remove();
    return;
  }
  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (!(game.user.isGM || actor.testUserPermission(game.user, "OWNER"))) {
      notify.warn("grant.errors.notOwner");
      return;
    }
    if (callingItem(actor)) {
      notify.info("grant.notify.hasCalling", { name: actor.name });
      button.closest(".smp-buttons")?.remove();
      return;
    }
    void openCallingPicker(actor);
  });
}

/** Re-renders grant cards still offering Choose Calling once the actor has a Calling (every client). */
function refreshGrantCards(item: ItemPF2e): void {
  if (item?.type !== "feat" || item.system?.category !== PF2E.callingCategory || !item.parent) return;
  const actorUuid = item.parent.uuid;
  for (const message of game.messages?.contents ?? []) {
    if (message?.flags?.[MODULE_ID]?.card?.actorUuid !== actorUuid) continue;
    if (document.querySelector(`[data-message-id="${message.id}"] .smp-choose-calling`)) {
      ui.chat?.updateMessage?.(message);
    }
  }
}

export const feature: Feature = {
  id: "grant",
  register() {
    Hooks.on("getActorContextOptions", contextOptions);
    Hooks.on("renderActorDirectory", decorateDirectory);
    Hooks.on("getActorSheetHeaderButtons", headerButtons);
    Hooks.on("createItem", (item: ItemPF2e) => {
      void onCreateItem(item);
      refreshGrantCards(item);
    });
    Hooks.on("renderChatMessageHTML", onRenderChatMessage);
    Hooks.on(HOOKS.stateChanged, () => {
      if (game.user?.isGM) ui.actors?.render();
    });
  },
};
