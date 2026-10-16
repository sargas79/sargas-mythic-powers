/**
 * OWNER: agent B. Feature "sheet-banner" (issue #9, mockup M3). For active mythic characters only, decorates
 * the PF2e character sheet's Feats tab: a banner above the "mythic" feat group (Calling, source, progression,
 * Mythic Points, edicts and anathema), a badge with the number of open mythic slots on the Feats tab, a
 * "Choose feat…" / "Choose Calling…" button on empty open slots and a lock on late-start locked slots.
 * Every render rebuilds the decorations, so re-renders are idempotent. Also opens the Calling picker for a
 * player when their character becomes mythic, and registers the GM ledger action for players' Calling picks.
 */
import { MODULE_ID, PF2E, TEMPLATE_PATH } from "../constants.js";
import { t } from "../foundry/i18n.js";
import { registerGMAction } from "../foundry/socket.js";
import { getState, isMythicActive } from "../state/flags.js";
import {
  callingItem,
  emptyOpenSlotIds,
  lockedSlotIds,
  mythicPoints,
  mythicTier,
  progressionInput,
} from "../state/actor-mythic.js";
import { lateStartOwed } from "../rules/progression.js";
import {
  actorCalling,
  CALLING_LEDGER_ACTION,
  canChooseCalling,
  handleCallingLedger,
} from "../services/callings.js";
import { openCallingPicker } from "../apps/calling-picker.js";
import { openFeatPicker } from "../apps/feat-picker.js";
import { rootElement } from "./visibility.js";
import type { Feature } from "./types.js";

const BANNER_TEMPLATE = `${TEMPLATE_PATH}/sheet-banner.hbs`;

/** Human-readable progression status. */
function progressionText(actor: ActorPF2e): string {
  const state = getState(actor);
  switch (state.progression) {
    case "lateStart": {
      const input = progressionInput(actor);
      const owed = lateStartOwed(input.lateStart.grantedLevel).length;
      const done = Math.min(owed, Math.max(0, input.lateStart.released));
      return done >= owed
        ? t("sheet.progressionLateStartDone")
        : t("sheet.progressionLateStart", { done, owed });
    }
    case "trials":
      return t("sheet.progressionTrials", { tier: mythicTier(actor), count: state.trials.count });
    default:
      return t("sheet.progressionStandard");
  }
}

function bannerContext(actor: ActorPF2e): Record<string, unknown> {
  const state = getState(actor);
  const calling = actorCalling(actor);
  const points = mythicPoints(actor);
  const pips = Array.from({ length: Math.max(0, points.max) }, (_v, i) => i < points.value);
  return {
    calling: calling?.name ?? null,
    title: calling ? t("sheet.title", { calling: calling.name }) : "",
    mythicLabel: t("sheet.mythic"),
    canChoose: canChooseCalling(actor),
    chooseLabel: t("sheet.chooseCalling"),
    noCallingLabel:
      state.callingChoice === "gm" && !game.user.isGM ? t("sheet.gmChoosesCalling") : t("sheet.noCalling"),
    source: state.source,
    sourceLabel: t("sheet.source"),
    progression: progressionText(actor),
    progressionLabel: t("sheet.progression"),
    points,
    pips,
    pointsText: t("sheet.points", { value: points.value, max: points.max }),
    pointsLabel: t("sheet.pointsLabel"),
    edicts: calling?.edicts ?? "",
    anathema: calling?.anathema ?? "",
    hasEA: !!(calling?.edicts || calling?.anathema),
    edictsLabel: t("sheet.edicts"),
    anathemaLabel: t("sheet.anathema"),
  };
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "smp-slot-choose";
  el.textContent = label;
  el.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return el;
}

/** Choose / lock decorations on the mythic group's slots. */
function decorateSlots(group: HTMLElement, actor: ActorPF2e): void {
  const locked = new Set(lockedSlotIds(actor));
  const empty = emptyOpenSlotIds(actor);
  const canEdit = !!actor.isOwner;
  let next = true;
  for (const li of group.querySelectorAll<HTMLElement>("li.slot[data-slot-id]")) {
    if (li.dataset.smpDecorated) continue;
    li.dataset.smpDecorated = "1";
    const slotId = li.dataset.slotId ?? "";
    if (li.dataset.itemId) continue;
    let controls = li.querySelector<HTMLElement>(":scope > .item-controls");
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "item-controls";
      li.append(controls);
    }
    if (locked.has(slotId)) {
      li.classList.add("smp-slot-locked");
      const placeholder = li.querySelector<HTMLElement>(".item-placeholder");
      if (placeholder) {
        placeholder.textContent = t("sheet.lockedSlot");
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-lock smp-lock";
        placeholder.prepend(icon, " ");
      }
      controls.querySelector("[data-action=browse-feats]")?.remove();
      continue;
    }
    if (!empty.includes(slotId)) continue;
    if (next) li.classList.add("smp-slot-next");
    next = false;
    if (slotId === PF2E.callingSlot) {
      if (canChooseCalling(actor)) {
        controls.prepend(button(t("sheet.chooseCallingSlot"), () => void openCallingPicker(actor)));
      }
    } else if (canEdit) {
      controls.prepend(button(t("sheet.chooseFeat"), () => void openFeatPicker(actor, slotId)));
    }
  }
}

/** Badge with the number of empty open mythic slots on the Feats tab. */
function decorateBadge(root: HTMLElement, actor: ActorPF2e): void {
  const tab = root.querySelector<HTMLElement>('nav.sheet-navigation [data-tab="feats"]');
  if (!tab) return;
  tab.querySelector(".smp-tab-badge")?.remove();
  const count = emptyOpenSlotIds(actor).length;
  if (count <= 0) return;
  const badge = document.createElement("span");
  badge.className = "smp-tab-badge";
  badge.textContent = String(count);
  badge.dataset.tooltip = t("sheet.openSlots", { count });
  tab.append(badge);
}

async function insertBanner(group: HTMLElement, actor: ActorPF2e): Promise<void> {
  const html: string = await foundry.applications.handlebars.renderTemplate(
    BANNER_TEMPLATE,
    bannerContext(actor),
  );
  if (!group.isConnected && !group.parentElement) return;
  const parent = group.parentElement;
  if (!parent) return;
  for (const old of parent.querySelectorAll(":scope > [data-smp-banner]")) old.remove();
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  const banner = wrapper.firstElementChild as HTMLElement | null;
  if (!banner) return;
  banner.querySelector("[data-smp-action=choose-calling]")?.addEventListener("click", (event) => {
    event.preventDefault();
    void openCallingPicker(actor);
  });
  group.before(banner);
}

async function onRenderCharacterSheet(app: { actor?: ActorPF2e }, html: unknown): Promise<void> {
  const actor = app?.actor;
  if (!actor || !isMythicActive(actor)) return;
  const root = rootElement(html);
  if (!root) return;
  try {
    decorateBadge(root, actor);
    const group = root.querySelector<HTMLElement>(`.tab.feats [data-group-id="${PF2E.featGroup}"]`);
    if (!group) return;
    decorateSlots(group, actor);
    await insertBanner(group, actor);
  } catch (error) {
    console.error(`${MODULE_ID} | sheet banner failed`, error);
  }
}

/** Actors seen active by this client, to open the Calling picker only when one becomes active. */
const knownActive = new Set<string>();

function onUpdateActor(actor: ActorPF2e): void {
  if (!actor?.id) return;
  const active = isMythicActive(actor);
  const was = knownActive.has(actor.id);
  if (active) knownActive.add(actor.id);
  else knownActive.delete(actor.id);
  if (!active || was || game.user.isGM || !actor.isOwner) return;
  if (callingItem(actor) || !canChooseCalling(actor)) return;
  void openCallingPicker(actor);
}

export const feature: Feature = {
  id: "sheet-banner",
  register() {
    registerGMAction(CALLING_LEDGER_ACTION, handleCallingLedger);
    Hooks.on("renderCharacterSheetPF2e", onRenderCharacterSheet);
  },
  ready() {
    for (const actor of game.actors?.contents ?? []) {
      if (isMythicActive(actor)) knownActive.add(actor.id);
    }
    Hooks.on("updateActor", onUpdateActor);
    Hooks.on("createActor", onUpdateActor);
    void foundry.applications.handlebars.loadTemplates?.([BANNER_TEMPLATE]);
  },
};
