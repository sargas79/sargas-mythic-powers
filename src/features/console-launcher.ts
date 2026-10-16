/**
 * OWNER: agent D. Feature "console-launcher": GM-only launchers for the Mythic Console (a Token Controls tool
 * and a button in the Actors sidebar header), live refresh of the console, and the Rewrite Fate spend log.
 *
 * PF2e's `pf2e.reroll` hook doesn't say which actor rerolled, so the spend is matched to the next
 * Mythic Point decrease this client makes (PF2e deducts the point right after the hook). The GM logs it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { MODULE_ID, PF2E } from "../constants.js";
import { t } from "../foundry/i18n.js";
import { appendLedger } from "../foundry/ledger.js";
import { registerGMAction, runAsGM } from "../foundry/socket.js";
import { openMythicConsole, registerConsoleRefresh } from "../apps/mythic-console.js";
import { isMythicActive } from "../state/flags.js";
import type { Feature } from "./types.js";

const TOOL_NAME = "smp-mythic-console";
const ICON = "fa-solid fa-hand-sparkles";
/** How long after a reroll the matching point deduction is accepted. */
const REROLL_WINDOW_MS = 10_000;

let pendingReroll: { value: number; at: number } | null = null;

function registerSceneControl(): void {
  Hooks.on("getSceneControlButtons", (controls: any) => {
    if (!game.user?.isGM) return;
    const group = controls?.tokens ?? controls?.token;
    if (!group) return;
    const tool = {
      name: TOOL_NAME,
      title: `${MODULE_ID}.console.title`,
      icon: ICON,
      button: true,
      visible: true,
      // onChange only: setting onClick as well fires the handler twice on v13+.
      onChange: () => void openMythicConsole(),
    };
    if (Array.isArray(group.tools)) group.tools.push(tool);
    else if (group.tools && typeof group.tools === "object") {
      group.tools[TOOL_NAME] = { ...tool, order: Object.keys(group.tools).length };
    }
  });
}

function registerDirectoryButton(): void {
  Hooks.on("renderActorDirectory", (_app: unknown, html: HTMLElement | { 0?: HTMLElement }) => {
    if (!game.user?.isGM) return;
    const root: HTMLElement | undefined =
      html instanceof HTMLElement ? html : (html as { 0?: HTMLElement })[0];
    if (!root) return;
    const header = root.querySelector<HTMLElement>(".directory-header .header-actions, .header-actions");
    if (!header || header.querySelector(".smp-console-launch")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "smp-console-launch";
    button.dataset.tooltip = t("console.launchTooltip");
    button.setAttribute("aria-label", t("console.title"));
    const icon = document.createElement("i");
    icon.className = ICON;
    button.append(icon, ` ${t("console.title")}`);
    button.addEventListener("click", () => void openMythicConsole());
    header.appendChild(button);
  });
}

function registerRerollLog(): void {
  registerGMAction("smp.logReroll", async (payload: { actorUuid?: string }) => {
    if (!game.user?.isGM || !payload?.actorUuid) return;
    const actor = await fromUuid(payload.actorUuid);
    if (!actor || !isMythicActive(actor)) return;
    await appendLedger({
      kind: "points",
      actorUuid: actor.uuid,
      actorName: actor.name,
      // No pointsBefore: PF2e did the deduction, so this entry isn't undoable from the console.
      message: t("console.ledger.rewriteFate", { name: actor.name }),
    });
  });

  Hooks.on("pf2e.reroll", (_oldRoll: unknown, _newRoll: unknown, resource: any) => {
    if (resource?.slug !== PF2E.mythicPointsResource) return;
    const value = Number(resource.value ?? 0);
    pendingReroll = value > 0 ? { value, at: Date.now() } : null;
  });

  Hooks.on("updateActor", (actor: ActorPF2e, changes: unknown, _options: unknown, userId: string) => {
    if (!pendingReroll || userId !== game.user?.id) return;
    if (Date.now() - pendingReroll.at > REROLL_WINDOW_MS) {
      pendingReroll = null;
      return;
    }
    const next = foundry.utils.getProperty(changes, "system.resources.mythicPoints.value");
    if (next === undefined || Number(next) !== pendingReroll.value - 1) return;
    pendingReroll = null;
    if (!isMythicActive(actor)) return;
    void runAsGM("smp.logReroll", { actorUuid: actor.uuid });
  });
}

export const feature: Feature = {
  id: "console-launcher",
  register() {
    registerSceneControl();
    registerDirectoryButton();
    registerRerollLog();
    registerConsoleRefresh();
  },
};
