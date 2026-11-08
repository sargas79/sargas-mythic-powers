/**
 * OWNER: agent X. Feature "npc-template" (docs/mythic-npcs.md, feature 1): GM-only "Make Mythic…" and
 * "Remove Mythic Template" actor directory entries for NPCs, a GM-only NPC sheet header button (PF2e's NPC
 * sheet is AppV1, so getActorSheetHeaderButtons fires for it), a GM-only Token Controls tool for the selected
 * tokens, and the API functions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { confirmRemove, openBulkTemplateDialog, openNpcTemplateDialog } from "../apps/npc-template-dialog.js";
import { MODULE_ID } from "../constants.js";
import { t } from "../foundry/i18n.js";
import {
  applyMythicTemplate,
  applyMythicTemplateToMany,
  isMythicNpc,
  isNpc,
  isTemplateApplied,
  removeMythicTemplate,
  removeMythicTemplateFromMany,
} from "../services/npc-template.js";
import type { Feature } from "./types.js";

const BULK_TOOL_NAME = "smp-mythic-template-bulk";

function actorFromLi(li: HTMLElement): ActorPF2e | null {
  const id = (li.closest("[data-entry-id]") as HTMLElement | null)?.dataset.entryId;
  return id ? (game.actors?.get(id) ?? null) : null;
}

function gmNpc(li: HTMLElement): ActorPF2e | null {
  if (!game.user?.isGM) return null;
  const actor = actorFromLi(li);
  return actor && isNpc(actor) ? actor : null;
}

async function removeWithConfirm(actor: ActorPF2e): Promise<void> {
  if (await confirmRemove(actor)) await removeMythicTemplate(actor);
}

function contextOptions(_app: unknown, options: Record<string, unknown>[]): void {
  if (!game.user?.isGM) return;
  options.push(
    {
      label: t("npcTemplate.menu.make"),
      icon: "fa-solid fa-dragon",
      group: MODULE_ID,
      visible: (li: HTMLElement) => {
        const actor = gmNpc(li);
        return !!actor && !isMythicNpc(actor) && !isTemplateApplied(actor);
      },
      onClick: (_e: Event, li: HTMLElement) => {
        const actor = gmNpc(li);
        if (actor) void openNpcTemplateDialog(actor);
      },
    },
    {
      label: t("npcTemplate.menu.remove"),
      icon: "fa-solid fa-trash",
      group: MODULE_ID,
      visible: (li: HTMLElement) => {
        const actor = gmNpc(li);
        return !!actor && isTemplateApplied(actor);
      },
      onClick: (_e: Event, li: HTMLElement) => {
        const actor = gmNpc(li);
        if (actor) void removeWithConfirm(actor);
      },
    },
  );
}

/** NPC sheet header (works for unlinked token actors too: the sheet's actor is the synthetic actor). */
function headerButtons(sheet: { actor?: ActorPF2e }, buttons: Record<string, unknown>[]): void {
  if (!game.user?.isGM) return;
  const actor = sheet?.actor;
  if (!actor || !isNpc(actor)) return;
  buttons.unshift({
    label: t("npcTemplate.header.label"),
    class: "smp-npct-header",
    icon: "fa-solid fa-dragon",
    onclick: () => void openNpcTemplateDialog(actor),
  });
}

/** Token Controls button: the mythic template for every selected token. */
function sceneControls(controls: any): void {
  if (!game.user?.isGM) return;
  const tools = controls?.tokens?.tools;
  if (!tools) return;
  tools[BULK_TOOL_NAME] = {
    name: BULK_TOOL_NAME,
    title: `${MODULE_ID}.npcTemplate.bulk.tool`,
    icon: "fa-solid fa-dragon",
    button: true,
    visible: true,
    order: Object.keys(tools).length,
    // onChange only: setting onClick as well fires the handler twice on v13+.
    onChange: () => void openBulkTemplateDialog(),
  };
}

export const feature: Feature = {
  id: "npc-template",
  register() {
    Hooks.on("getActorContextOptions", contextOptions);
    Hooks.on("getActorSheetHeaderButtons", headerButtons);
    Hooks.on("getSceneControlButtons", sceneControls);
  },
  ready() {
    // src/api.ts is shared core; the API object exists before features' ready runs.
    const api = game.modules.get(MODULE_ID)?.api;
    if (api) {
      Object.assign(api, {
        openNpcTemplateDialog,
        openBulkTemplateDialog,
        applyMythicTemplate,
        applyMythicTemplateToMany,
        removeMythicTemplate,
        removeMythicTemplateFromMany,
      });
    }
  },
};
