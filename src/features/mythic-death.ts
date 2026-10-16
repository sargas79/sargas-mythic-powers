/**
 * OWNER: agent E. Feature "mythic-death" (#20, setting `mythicDeath`, off by default). When the dying
 * condition of an active mythic character would reach its maximum, the change is blocked and the GM applies
 * the mythic rule instead: dying removed, 0 HP, unconscious (stabilized), doomed +1. At doomed 4 the
 * character dies normally. A ledger entry carries `undo` data; the card has an Undo button for the GM.
 */
import { MODULE_ID } from "../constants.js";
import { esc, notify, t } from "../foundry/i18n.js";
import { appendLedger, getLedger, markUndone } from "../foundry/ledger.js";
import { getSetting } from "../foundry/settings.js";
import { registerGMAction, runAsGM } from "../foundry/socket.js";
import { MYTHIC_DEATH_DOOMED, mythicDeathDecision } from "../rules/death.js";
import { isMythicActive } from "../state/flags.js";
import {
  CARD_FLAG,
  bindButtons,
  cardFlag,
  gmIds,
  ownerIds,
  removeButtons,
  renderCard,
  rootElement,
  updateCard,
  type CardFlag,
  type Doc,
} from "./automation-cards.js";
import type { Feature } from "./types.js";

const TEMPLATE = "death-card";
const GM_ACTION = "smp.mythicDeath";

/** Values before the interception, stored in the ledger entry and the card so the GM can restore them. */
export interface MythicDeathUndo extends Record<string, unknown> {
  type: "mythicDeath";
  actorUuid: string;
  hpBefore: number;
  dyingBefore: number;
  doomedBefore: number;
  unconsciousBefore: boolean;
  /** Dying value the blocked change would have set. */
  dyingBlocked: number;
}

interface DeathFlag extends CardFlag {
  kind: "death";
  status: "applied" | "undone";
  actorName: string;
  doomedFrom: number;
  doomedTo: number;
  dyingBlocked: number;
  ledgerId: string | null;
  undo: MythicDeathUndo;
}

/** Actors with an interception in flight on this client (blocks repeats until the GM has applied it). */
const inFlight = new Set<string>();

function condition(actor: ActorPF2e, slug: string): ItemPF2e | null {
  return actor?.itemTypes?.condition?.find((c: ItemPF2e) => c.slug === slug) ?? null;
}

function conditionValue(item: ItemPF2e | null): number {
  return Number(item?._source?.system?.value?.value ?? item?.system?.value?.value ?? 0) || 0;
}

function doomedValue(actor: ActorPF2e): number {
  return Number(actor?.attributes?.doomed?.value ?? conditionValue(condition(actor, "doomed"))) || 0;
}

function dyingMax(actor: ActorPF2e): number {
  return Number(actor?.attributes?.dying?.max ?? actor?.system?.attributes?.dying?.max ?? 4);
}

function applies(actor: ActorPF2e): boolean {
  return actor?.type === "character" && !!getSetting("mythicDeath") && isMythicActive(actor);
}

/**
 * Synchronous part, on the client making the change: returns false to block the dying change and hands
 * the mythic rule to the GM.
 */
function intercept(item: ItemPF2e, dyingNew: unknown): boolean {
  if (item?.type !== "condition" || item.slug !== "dying") return true;
  const actor = item.parent;
  if (!actor || typeof dyingNew !== "number" || !applies(actor)) return true;
  const decision = mythicDeathDecision({ dyingNew, dyingMax: dyingMax(actor), doomed: doomedValue(actor) });
  if (!decision.intercept) return true;
  if (!game.user.isGM && !game.users?.activeGM) return true; // Nobody can apply it: normal PF2e rules.
  if (inFlight.has(actor.uuid)) return false;
  inFlight.add(actor.uuid);
  runAsGM(GM_ACTION, { actorUuid: actor.uuid, dyingTo: dyingNew })
    .catch((error) => notify.error("automation.death.failed", {}, error))
    .finally(() => setTimeout(() => inFlight.delete(actor.uuid), 1500));
  return false;
}

function cardData(flag: DeathFlag): Record<string, unknown> {
  return {
    whisper: t("automation.whisperOwners", { name: flag.actorName }),
    title: t("automation.death.title"),
    body: t("automation.death.body", {
      name: esc(flag.actorName),
      dying: `<b>${esc(t("automation.death.dying", { value: flag.dyingBlocked }))}</b>`,
    }),
    doomedLine: t("automation.death.doomed", { from: flag.doomedFrom, to: flag.doomedTo }),
    diesAt: t("automation.death.diesAt", { value: MYTHIC_DEATH_DOOMED }),
    canUndo: flag.status === "applied",
    undone: flag.status === "undone",
    undoneText: t("automation.death.undone"),
    labels: { undo: t("automation.death.undo") },
  };
}

/** GM: apply the mythic death rule. */
async function applyMythicDeath(
  payload: { actorUuid: string; dyingTo: number },
  userId: string,
): Promise<void> {
  const actor = await fromUuid(payload?.actorUuid);
  if (!actor || !applies(actor)) return;
  const user = game.users?.get(userId);
  if (!user?.isGM && !actor.testUserPermission(user, "OWNER")) return;
  const dyingTo = Number(payload.dyingTo) || 0;
  const dying = condition(actor, "dying");
  const doomedBefore = doomedValue(actor);
  const decision = mythicDeathDecision({
    dyingNew: dyingTo,
    dyingMax: dyingMax(actor),
    doomed: doomedBefore,
  });

  if (!decision.intercept) {
    // The actor changed in between: apply the original change under normal PF2e rules.
    if (dying) await game.pf2e.ConditionManager.updateConditionValue(dying.id, actor, dyingTo);
    else await actor.increaseCondition("dying", { value: dyingTo });
    return;
  }

  const undo: MythicDeathUndo = {
    type: "mythicDeath",
    actorUuid: actor.uuid,
    hpBefore: Number(actor.system?.attributes?.hp?.value ?? 0),
    dyingBefore: conditionValue(dying),
    doomedBefore,
    unconsciousBefore: !!condition(actor, "unconscious"),
    dyingBlocked: dyingTo,
  };
  if (dying) await dying.delete();
  if (undo.hpBefore !== 0) await actor.update({ "system.attributes.hp.value": 0 });
  await actor.increaseCondition("doomed", { max: decision.newDoomed });
  // Stabilized at 0 HP: unconscious but no longer dying (deleting dying also removed its granted unconscious).
  if (!condition(actor, "unconscious")) await actor.increaseCondition("unconscious");

  const entry = await appendLedger({
    kind: "death",
    actorUuid: actor.uuid,
    actorName: actor.name,
    message: t("automation.death.ledger", {
      name: actor.name,
      from: doomedBefore,
      to: decision.newDoomed,
    }),
    undo,
  });
  const flag: DeathFlag = {
    kind: "death",
    status: "applied",
    actorName: actor.name,
    doomedFrom: doomedBefore,
    doomedTo: decision.newDoomed,
    dyingBlocked: dyingTo,
    ledgerId: entry.id,
    undo,
  };
  await ChatMessage.create({
    content: await renderCard(TEMPLATE, cardData(flag)),
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: [...new Set([...gmIds(), ...ownerIds(actor)])],
    flags: { [MODULE_ID]: { [CARD_FLAG]: flag } },
  });
}

async function setCondition(actor: ActorPF2e, slug: string, value: number): Promise<void> {
  const item = condition(actor, slug);
  if (value <= 0) {
    if (item) await item.delete();
  } else if (item) {
    await game.pf2e.ConditionManager.updateConditionValue(item.id, actor, value);
  } else {
    await actor.increaseCondition(slug, { value });
  }
}

/** GM only. Restores HP, dying, doomed and unconscious from a mythic death `undo` record. */
export async function undoMythicDeath(undo: Record<string, unknown>): Promise<boolean> {
  if (!game.user.isGM || undo?.type !== "mythicDeath") return false;
  const data = undo as MythicDeathUndo;
  const actor = await fromUuid(data.actorUuid);
  if (!actor) return false;
  await setCondition(actor, "doomed", data.doomedBefore);
  await actor.update({ "system.attributes.hp.value": data.hpBefore });
  if (data.dyingBefore > 0) {
    // Restored dying grants its own unconscious: drop the one added when the character stabilized.
    const extra = (actor.itemTypes?.condition ?? []).filter(
      (c: ItemPF2e) => c.slug === "unconscious" && !c.flags?.pf2e?.grantedBy,
    );
    for (const c of extra) await c.delete();
  }
  await setCondition(actor, "dying", data.dyingBefore);
  if (!data.unconsciousBefore && data.dyingBefore <= 0) {
    const unconscious = condition(actor, "unconscious");
    if (unconscious) await unconscious.delete();
  }
  return true;
}

/** Marks the death cards of a ledger entry as undone (removes their Undo button). */
async function markCardsUndone(ledgerId: string): Promise<void> {
  for (const message of game.messages?.contents ?? []) {
    const flag = cardFlag(message) as DeathFlag | null;
    if (flag?.kind !== "death" || flag.ledgerId !== ledgerId || flag.status !== "applied") continue;
    const next: DeathFlag = { ...flag, status: "undone" };
    await updateCard(message, TEMPLATE, cardData(next), next);
  }
}

/**
 * GM only. Undoes a mythic death ledger entry: restores the actor, marks the entry and its chat cards
 * undone. Used by the card's Undo button and the Mythic Console ledger, so either one undoes it once.
 */
export async function undoDeathEntry(ledgerId: string): Promise<boolean> {
  if (!game.user.isGM) return false;
  const entry = getLedger().find((e) => e.id === ledgerId);
  if (!entry || entry.undone || !entry.undo) return false;
  if (!(await undoMythicDeath(entry.undo))) return false;
  await markUndone(ledgerId);
  await markCardsUndone(ledgerId);
  return true;
}

async function onUndo(message: Doc): Promise<void> {
  const flag = cardFlag(message) as DeathFlag | null;
  if (!game.user.isGM || flag?.kind !== "death" || flag.status !== "applied") return;
  try {
    if (flag.ledgerId) {
      // Already undone from the console: just bring the card up to date.
      if (!(await undoDeathEntry(flag.ledgerId))) await markCardsUndone(flag.ledgerId);
      return;
    }
    if (!(await undoMythicDeath(flag.undo))) return;
    const next: DeathFlag = { ...flag, status: "undone" };
    await updateCard(message, TEMPLATE, cardData(next), next);
  } catch (error) {
    notify.error("automation.death.failed", {}, error);
  }
}

function onRender(message: Doc, html: unknown): void {
  const flag = cardFlag(message);
  if (flag?.kind !== "death") return;
  const root = rootElement(html);
  if (!root) return;
  if (!game.user.isGM) {
    removeButtons(root);
    return;
  }
  bindButtons(root, async (action) => {
    if (action === "undo") await onUndo(message);
  });
}

export const feature: Feature = {
  id: "mythic-death",
  register() {
    registerGMAction(GM_ACTION, applyMythicDeath);
    Hooks.on("preCreateItem", (item: ItemPF2e, data: Record<string, unknown>) =>
      intercept(
        item,
        item?.system?.value?.value ?? foundry.utils.getProperty(data ?? {}, "system.value.value") ?? 1,
      ),
    );
    Hooks.on("preUpdateItem", (item: ItemPF2e, changes: Record<string, unknown>) => {
      const value = foundry.utils.getProperty(changes ?? {}, "system.value.value");
      if (value === undefined) return true;
      return intercept(item, value);
    });
    Hooks.on("renderChatMessageHTML", onRender);
  },
};
