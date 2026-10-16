/**
 * OWNER: agent E. Shared helpers for the automation chat cards (mythic kill, daily regain, mythic death):
 * card flags, whisper recipients, template rendering and button binding.
 */
import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";

/** Flag key under flags["sargas-mythic-powers"] for automation cards. */
export const CARD_FLAG = "automation";

/** Loosely typed Foundry document (chat message, combatant, token). */
export type Doc = ReturnType<typeof fromUuidSync>;

export type CardKind = "kill" | "regain" | "death";

export interface CardFlag {
  kind: CardKind;
  status: string;
  [key: string]: unknown;
}

export function cardFlag(message: Doc): CardFlag | null {
  const f = message?.flags?.[MODULE_ID]?.[CARD_FLAG];
  return f && typeof f.kind === "string" ? (f as CardFlag) : null;
}

/** User ids of every GM. */
export function gmIds(): string[] {
  return (game.users?.contents ?? []).filter((u: UserDoc) => u.isGM).map((u: UserDoc) => u.id);
}

/** User ids of non-GM owners of the actor. */
export function ownerIds(actor: ActorPF2e): string[] {
  return (game.users?.contents ?? [])
    .filter((u: UserDoc) => !u.isGM && actor?.testUserPermission?.(u, "OWNER"))
    .map((u: UserDoc) => u.id);
}

export async function renderCard(name: string, data: Record<string, unknown>): Promise<string> {
  return foundry.applications.handlebars.renderTemplate(`${TEMPLATE_PATH}/${name}.hbs`, data);
}

/** The card root element from a render hook argument (HTMLElement or jQuery). */
export function rootElement(html: unknown): HTMLElement | null {
  if (html instanceof HTMLElement) return html;
  const first = (html as { [0]?: unknown } | null)?.[0];
  return first instanceof HTMLElement ? first : null;
}

/** Binds `[data-smp-action]` buttons inside the card; disables them while a handler runs. */
export function bindButtons(root: HTMLElement, handler: (action: string) => Promise<void>): void {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(".smp-auto-card [data-smp-action]"));
  for (const button of buttons) {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      buttons.forEach((b) => (b.disabled = true));
      try {
        await handler(button.dataset.smpAction ?? "");
      } finally {
        if (button.isConnected) buttons.forEach((b) => (b.disabled = false));
      }
    });
  }
}

/** Removes the card's buttons (for users who may not act on it). */
export function removeButtons(root: HTMLElement): void {
  root.querySelectorAll(".smp-auto-card .smp-buttons").forEach((el) => el.remove());
}

/** Rewrites a card's content and flag (GM only: the GM authored every automation card). */
export async function updateCard(
  message: Doc,
  template: string,
  data: Record<string, unknown>,
  flag: CardFlag,
): Promise<void> {
  const content = await renderCard(template, data);
  await message.update({ content, [`flags.${MODULE_ID}.${CARD_FLAG}`]: flag });
}
