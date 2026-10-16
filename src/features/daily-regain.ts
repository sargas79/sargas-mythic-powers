/**
 * OWNER: agent E. Feature "daily-regain" (#19). The first critical success each in-world day on one of the
 * character's Calling checks offers +1 Mythic Point. The active GM whispers a card to the GM and the
 * character's owners; Restore is applied by the GM (`smp.regain`), which re-checks the date.
 */
import { MODULE_ID } from "../constants.js";
import { esc, notify, t } from "../foundry/i18n.js";
import { getSetting } from "../foundry/settings.js";
import { isActiveGM, registerGMAction, runAsGM } from "../foundry/socket.js";
import { callingSlug, regainMatches, worldDateKey } from "../rules/calling-actions.js";
import { changePoints } from "../services/points.js";
import { callingItem } from "../state/actor-mythic.js";
import { getState, isMythicActive, setState } from "../state/flags.js";
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

const TEMPLATE = "regain-card";
const GM_ACTION = "smp.regain";

interface RegainFlag extends CardFlag {
  kind: "regain";
  status: "pending" | "restored" | "declined" | "already";
  actorUuid: string;
  actorName: string;
  callingName: string;
  action: string;
  targetName: string | null;
  dateKey: string;
  gmNote: string | null;
  gmOnly: boolean;
}

/** Today's in-world date key (PF2e world clock date, else days since epoch). */
export function todayKey(): string {
  let iso: string | null = null;
  try {
    iso = game.pf2e?.worldClock?.worldTime?.toISODate?.() ?? null;
  } catch {
    iso = null;
  }
  return worldDateKey(iso, Number(game.time?.worldTime ?? 0));
}

function actionLabel(slug: string): string {
  try {
    const action = game.pf2e?.actions?.get?.(slug);
    if (action?.name) return game.i18n.localize(action.name);
  } catch {
    // fall through to the slug
  }
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function cardData(flag: RegainFlag): Record<string, unknown> {
  const action = `<b>${esc(actionLabel(flag.action))}</b>`;
  const body = flag.targetName
    ? t("automation.regain.bodyTarget", {
        action,
        target: `<b>${esc(flag.targetName)}</b>`,
        name: esc(flag.actorName),
      })
    : t("automation.regain.body", { action, name: esc(flag.actorName) });
  const statusKey = { pending: "", restored: "restored", declined: "declined", already: "already" }[
    flag.status
  ];
  return {
    whisper: flag.gmOnly
      ? t("automation.whisperGM")
      : t("automation.whisperOwners", { name: flag.actorName }),
    title: t("automation.regain.title", { calling: flag.callingName }),
    body,
    gmNote: flag.gmNote ? t(`automation.regain.gm.${flag.gmNote}`) : "",
    pending: flag.status === "pending",
    status: flag.status,
    statusText: statusKey ? t(`automation.regain.${statusKey}`, { name: flag.actorName }) : "",
    labels: { restore: t("automation.regain.restore"), decline: t("automation.regain.decline") },
  };
}

/** True if a still-pending regain card exists for this actor and day (no duplicate prompts). */
function hasPendingCard(actorUuid: string, dateKey: string): boolean {
  return (game.messages?.contents ?? []).some((m: Doc) => {
    const f = cardFlag(m) as RegainFlag | null;
    return (
      f?.kind === "regain" && f.actorUuid === actorUuid && f.dateKey === dateKey && f.status === "pending"
    );
  });
}

function isEnemy(actor: ActorPF2e, target: ActorPF2e, token: Doc): boolean {
  if (actor?.isEnemyOf?.(target)) return true;
  const hostile = foundry.CONST?.TOKEN_DISPOSITIONS?.HOSTILE ?? -1;
  return token?.disposition === hostile;
}

async function onCreateMessage(message: Doc): Promise<void> {
  const context = message?.flags?.pf2e?.context;
  if (!context || context.outcome !== "criticalSuccess") return;
  if (["damage-roll", "damage-taken"].includes(context.type)) return;
  const actor = message.actor;
  if (!actor || !isMythicActive(actor)) return;
  const calling = callingItem(actor);
  if (!calling) return;
  const slug = calling.slug || calling.system?.slug || callingSlug(calling.name);

  const target = message.target ?? null;
  const targetActor = target?.actor ?? null;
  const inCombat = !!game.combat?.started && !!game.combat.combatants?.some((c: Doc) => c.actor === actor);
  const match = regainMatches(slug, {
    outcome: context.outcome,
    rollOptions: Array.isArray(context.options) ? context.options : [],
    targetIsEnemy: targetActor ? isEnemy(actor, targetActor, target.token) : null,
    targetIsAlly: targetActor ? !!actor.isAllyOf?.(targetActor) : null,
    inCombat,
  });
  if (!match) return;

  const dateKey = todayKey();
  if (getState(actor).dailyRegain.lastDate === dateKey) return;
  if (hasPendingCard(actor.uuid, dateKey)) return;

  // A blind roll (e.g. secret Recall Knowledge) must not reveal its outcome to the player.
  const gmOnly = !!message.blind;
  const flag: RegainFlag = {
    kind: "regain",
    status: "pending",
    actorUuid: actor.uuid,
    actorName: actor.name,
    callingName: calling.name,
    action: match.action,
    targetName: targetActor ? (target.token?.name ?? targetActor.name) : null,
    dateKey,
    gmNote: match.needsGM ? match.gmNote : null,
    gmOnly,
  };
  await ChatMessage.create({
    content: await renderCard(TEMPLATE, cardData(flag)),
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: gmOnly ? gmIds() : [...new Set([...gmIds(), ...ownerIds(actor)])],
    flags: { [MODULE_ID]: { [CARD_FLAG]: flag } },
  });
}

/** GM side of Restore / Not this time. */
async function handleRegain(payload: { messageId: string; accept: boolean }, userId: string): Promise<void> {
  const message = game.messages?.get(payload?.messageId);
  const flag = cardFlag(message) as RegainFlag | null;
  if (!message || flag?.kind !== "regain" || flag.status !== "pending") return;
  const actor = await fromUuid(flag.actorUuid);
  if (!actor) return;
  const user = game.users?.get(userId);
  if (!user?.isGM && (flag.gmOnly || !actor.testUserPermission(user, "OWNER"))) return;

  let status: RegainFlag["status"] = "declined";
  if (payload.accept) {
    if (!isMythicActive(actor)) return;
    if (getState(actor).dailyRegain.lastDate === flag.dateKey) status = "already";
    else {
      await changePoints(actor, "regain", { reason: flag.callingName });
      await setState(actor, { dailyRegain: { lastDate: flag.dateKey } });
      status = "restored";
    }
  }
  const next: RegainFlag = { ...flag, status };
  await updateCard(message, TEMPLATE, cardData(next), next);
}

function onRender(message: Doc, html: unknown): void {
  const flag = cardFlag(message) as RegainFlag | null;
  if (flag?.kind !== "regain") return;
  const root = rootElement(html);
  if (!root) return;
  const actor = fromUuidSync(flag.actorUuid);
  const canAct = game.user.isGM || (!flag.gmOnly && !!actor && isMythicActive(actor) && actor.isOwner);
  if (!canAct) {
    removeButtons(root);
    return;
  }
  bindButtons(root, async (action) => {
    if (action !== "restore" && action !== "decline") return;
    try {
      await runAsGM(GM_ACTION, { messageId: message.id, accept: action === "restore" });
    } catch (error) {
      notify.error("automation.regain.failed", {}, error);
    }
  });
}

export const feature: Feature = {
  id: "daily-regain",
  register() {
    registerGMAction(GM_ACTION, handleRegain);
    Hooks.on("createChatMessage", (message: Doc) => {
      if (!isActiveGM() || !getSetting("regainPrompt")) return;
      if (cardFlag(message)) return;
      onCreateMessage(message).catch((error) => notify.error("automation.regain.failed", {}, error));
    });
    Hooks.on("renderChatMessageHTML", onRender);
  },
};
