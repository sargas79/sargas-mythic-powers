/**
 * OWNER: agent C. Feature "approval": GM socket actions for mythic feat picks and the Approve / Reject
 * buttons on the GM request card (issue #14).
 */
import { MODULE_ID } from "../constants.js";
import { esc, t } from "../foundry/i18n.js";
import { getState } from "../state/flags.js";
import {
  approvePending,
  registerFeatRequestActions,
  rejectPending,
  type RequestCardFlag,
} from "../services/feat-requests.js";
import type { Feature } from "./types.js";

function rootOf(html: unknown): HTMLElement | null {
  if (html instanceof HTMLElement) return html;
  const first = (html as { [0]?: unknown } | null)?.[0];
  return first instanceof HTMLElement ? first : null;
}

async function askReason(): Promise<string | null> {
  const DialogV2 = foundry.applications.api.DialogV2;
  const result = await DialogV2.input({
    window: { title: t("feats.card.rejectTitle") },
    content: `<label>${esc(t("feats.card.rejectReason"))}<input type="text" name="reason" autofocus></label>`,
    ok: { label: t("feats.card.reject"), icon: "fa-solid fa-xmark" },
  });
  if (result === null || result === undefined) return null;
  return String(result.reason ?? "");
}

function onRenderMessage(message: { flags?: Record<string, Record<string, unknown>> }, html: unknown): void {
  const flag = message?.flags?.[MODULE_ID]?.featRequest as RequestCardFlag | undefined;
  if (!flag) return;
  const root = rootOf(html);
  const buttons = root?.querySelector<HTMLElement>(".smp-feat-request .smp-buttons");
  if (!root || !buttons) return;
  if (!game.user.isGM) {
    buttons.remove();
    return;
  }
  const actor = fromUuidSync(flag.actorUuid);
  const pending = actor ? getState(actor).pending.find((p) => p.id === flag.pendingId) : null;
  if (!pending) {
    buttons.outerHTML = `<p class="smp-resolved">${esc(t("feats.card.resolved"))}</p>`;
    return;
  }
  buttons.querySelectorAll<HTMLButtonElement>("button[data-smp-action]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      buttons.querySelectorAll("button").forEach((b) => (b.disabled = true));
      try {
        const done =
          button.dataset.smpAction === "approve"
            ? await approvePending(actor, flag.pendingId)
            : await (async () => {
                const reason = await askReason();
                return reason === null ? false : rejectPending(actor, flag.pendingId, reason);
              })();
        if (done) ui.chat?.updateMessage?.(message);
      } finally {
        buttons.querySelectorAll("button").forEach((b) => (b.disabled = false));
      }
    });
  });
}

export const feature: Feature = {
  id: "approval",
  register() {
    registerFeatRequestActions();
    Hooks.on("renderChatMessageHTML", onRenderMessage);
  },
};
