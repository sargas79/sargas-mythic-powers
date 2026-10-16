/**
 * OWNER: agent C. Mythic feat picks: direct insertion and the optional GM approval queue (issue #14).
 *
 * Players call `requestFeat`; the active GM validates, stores a PendingFeat in the actor state and whispers
 * the GMs a card with Approve / Reject. `approvePending` / `rejectPending` (GM) resolve it and whisper the
 * character's owners. The Mythic Console (agent D) also calls those two.
 */
import { MODULE_ID, PF2E, TEMPLATE_PATH } from "../constants.js";
import { esc, notify, t } from "../foundry/i18n.js";
import { appendLedger } from "../foundry/ledger.js";
import { getSetting } from "../foundry/settings.js";
import { registerGMAction, runAsGM } from "../foundry/socket.js";
import { featInSlot } from "../state/actor-mythic.js";
import { getState, isMythicActive, setState, type PendingFeat } from "../state/flags.js";
import { slotLevel } from "../rules/progression.js";
import { evaluateFeat, featRecord, loadMythicFeats, noteText } from "./mythic-feats.js";

export const GM_ACTIONS = {
  request: "smp.requestFeat",
  added: "smp.featAdded",
} as const;

interface RequestPayload {
  actorUuid: string;
  uuid: string;
  slotId: string;
}

/** Flag on the GM card so the render hook can find the request. */
export interface RequestCardFlag {
  actorUuid: string;
  pendingId: string;
}

function gmIds(): string[] {
  return (game.users?.contents ?? []).filter((u: UserDoc) => u.isGM).map((u: UserDoc) => u.id);
}

/** Owners of the actor (players) plus every GM. */
function ownerIds(actor: ActorPF2e): string[] {
  const players = (game.users?.contents ?? [])
    .filter((u: UserDoc) => !u.isGM && actor.testUserPermission(u, "OWNER"))
    .map((u: UserDoc) => u.id);
  return [...new Set([...players, ...gmIds()])];
}

function slotLabel(slotId: string): string {
  return t("feats.slotLabel", { level: slotLevel(slotId) ?? slotId });
}

async function whisper(userIds: string[], content: string, flags?: Record<string, unknown>): Promise<void> {
  if (!userIds.length) return;
  await ChatMessage.create({
    content,
    whisper: userIds,
    speaker: { alias: t("title") },
    ...(flags ? { flags: { [MODULE_ID]: flags } } : {}),
  });
}

function simpleCard(title: string, body: string): string {
  return `<div class="smp-card smp-feat-result"><h3>${esc(title)}</h3><p>${body}</p></div>`;
}

/** Runs the eligibility rules for a compendium feat on the actor. Returns localized reasons. */
async function validate(
  actor: ActorPF2e,
  item: ItemPF2e,
  slotId: string,
): Promise<{ ok: boolean; reasons: string[]; warnings: string[] }> {
  if (!item || item.type !== "feat") return { ok: false, reasons: [t("feats.errors.notFeat")], warnings: [] };
  const { knownFeatNames } = await loadMythicFeats().catch(() => ({ knownFeatNames: undefined }));
  const result = evaluateFeat(actor, featRecord(item), slotId, knownFeatNames ? { knownFeatNames } : {});
  const reasons = result.reasons.map(noteText);
  if (featInSlot(actor, slotId)) reasons.push(t("feats.reason.slotFilled"));
  return { ok: reasons.length === 0, reasons, warnings: result.warnings.map(noteText) };
}

/**
 * Inserts a feat into a mythic slot right away (no approval). Owner or GM. Returns false when the rules say no.
 */
export async function addFeatDirectly(actor: ActorPF2e, uuid: string, slotId: string): Promise<boolean> {
  if (!isMythicActive(actor) || !actor.isOwner) return false;
  const item = await fromUuid(uuid);
  const check = await validate(actor, item, slotId);
  if (!check.ok) {
    notify.warn("feats.notify.cannotAdd", { feat: item?.name ?? uuid, reasons: check.reasons.join("; ") });
    return false;
  }
  await actor.feats.insertFeat(item, { groupId: PF2E.featGroup, slotId });
  // Ledger entry when a GM is around to write it; a missing GM must not look like a failure here.
  if (game.user.isGM || game.users?.activeGM) {
    await runAsGM(GM_ACTIONS.added, { actorUuid: actor.uuid, name: item.name, slotId }).catch(() => false);
  }
  return true;
}

/** Owner: sends a pick to the GM. When the caller is a GM the feat is added directly. */
export async function requestFeat(actor: ActorPF2e, uuid: string, slotId: string): Promise<void> {
  if (!isMythicActive(actor)) return;
  if (game.user.isGM) {
    await addFeatDirectly(actor, uuid, slotId);
    return;
  }
  const payload: RequestPayload = { actorUuid: actor.uuid, uuid, slotId };
  const sent = await runAsGM(GM_ACTIONS.request, payload);
  if (sent) notify.info("feats.notify.sent");
}

/** Active GM: validates a request and queues it. */
async function handleRequest(payload: RequestPayload, userId: string): Promise<void> {
  const actor = await fromUuid(payload?.actorUuid);
  const user = game.users.get(userId);
  if (!actor || !user || !isMythicActive(actor)) return;
  if (!user.isGM && !actor.testUserPermission(user, "OWNER")) return;
  const item = await fromUuid(payload.uuid);
  const state = getState(actor);
  const name = item?.name ?? payload.uuid;

  if (state.pending.some((p) => p.slotId === payload.slotId || p.uuid === payload.uuid)) {
    await whisper(
      [userId],
      simpleCard(
        t("feats.card.title"),
        esc(t("feats.card.alreadyPending", { feat: name, actor: actor.name })),
      ),
    );
    return;
  }
  const check = await validate(actor, item, payload.slotId);
  if (!check.ok) {
    await whisper(
      [userId],
      simpleCard(
        t("feats.card.title"),
        esc(t("feats.card.invalid", { feat: name, reasons: check.reasons.join("; ") })),
      ),
    );
    return;
  }

  const pending: PendingFeat = {
    id: foundry.utils.randomID(),
    uuid: payload.uuid,
    name: item.name,
    slotId: payload.slotId,
    userId,
    requestedAt: Date.now(),
  };
  await setState(actor, { pending: [...state.pending, pending] });

  const renderTemplate = foundry.applications.handlebars.renderTemplate;
  const content = await renderTemplate(`${TEMPLATE_PATH}/feat-request-card.hbs`, {
    actorName: actor.name,
    userName: user.name,
    featName: item.name,
    featUuid: payload.uuid,
    slot: slotLabel(payload.slotId),
    warnings: check.warnings,
    actorUuid: actor.uuid,
    pendingId: pending.id,
  });
  const flag: RequestCardFlag = { actorUuid: actor.uuid, pendingId: pending.id };
  await whisper(gmIds(), content, { featRequest: flag });
  await whisper(
    [userId],
    simpleCard(
      t("feats.card.title"),
      esc(t("feats.card.sent", { feat: item.name, actor: actor.name, slot: slotLabel(payload.slotId) })),
    ),
  );
}

function findPending(actor: ActorPF2e, pendingId: string): PendingFeat | null {
  return getState(actor).pending.find((p) => p.id === pendingId) ?? null;
}

async function removePending(actor: ActorPF2e, pendingId: string): Promise<void> {
  const state = getState(actor);
  await setState(actor, { pending: state.pending.filter((p) => p.id !== pendingId) });
}

/** GM: adds the pending feat to its slot, clears it from the queue and tells the owners. */
export async function approvePending(actor: ActorPF2e, pendingId: string): Promise<boolean> {
  if (!game.user.isGM) {
    notify.warn("errors.gmOnly");
    return false;
  }
  const pending = findPending(actor, pendingId);
  if (!pending) {
    notify.warn("feats.notify.noPending");
    return false;
  }
  const item = await fromUuid(pending.uuid);
  if (!item) {
    notify.warn("feats.notify.missingItem", { feat: pending.name });
    return false;
  }
  if (featInSlot(actor, pending.slotId)) {
    notify.warn("feats.notify.slotFilled", { slot: slotLabel(pending.slotId) });
    return false;
  }
  await actor.feats.insertFeat(item, { groupId: PF2E.featGroup, slotId: pending.slotId });
  await removePending(actor, pendingId);
  const data = { actor: actor.name, feat: pending.name, slot: slotLabel(pending.slotId) };
  await appendLedger({
    kind: "feat",
    actorUuid: actor.uuid,
    actorName: actor.name,
    message: t("feats.ledger.approved", data),
  });
  await whisper(
    ownerIds(actor),
    simpleCard(t("feats.card.approvedTitle"), esc(t("feats.card.approved", data))),
  );
  return true;
}

/** GM: drops the pending pick and tells the owners (with the optional reason). */
export async function rejectPending(actor: ActorPF2e, pendingId: string, reason?: string): Promise<boolean> {
  if (!game.user.isGM) {
    notify.warn("errors.gmOnly");
    return false;
  }
  const pending = findPending(actor, pendingId);
  if (!pending) {
    notify.warn("feats.notify.noPending");
    return false;
  }
  await removePending(actor, pendingId);
  const data = { actor: actor.name, feat: pending.name, slot: slotLabel(pending.slotId) };
  const why = reason?.trim() ? ` ${esc(t("feats.card.reason", { reason: reason.trim() }))}` : "";
  await whisper(
    ownerIds(actor),
    simpleCard(t("feats.card.rejectedTitle"), esc(t("feats.card.rejected", data)) + why),
  );
  return true;
}

/** Active GM: ledger entry for a feat a player added directly (approval off). */
async function handleAdded(payload: { actorUuid: string; name: string; slotId: string }): Promise<void> {
  const actor = await fromUuid(payload?.actorUuid);
  if (!actor) return;
  await appendLedger({
    kind: "feat",
    actorUuid: actor.uuid,
    actorName: actor.name,
    message: t("feats.ledger.added", {
      actor: actor.name,
      feat: String(payload.name ?? ""),
      slot: slotLabel(String(payload.slotId ?? "")),
    }),
  });
}

/** True when picks go through the GM (setting on and the user isn't a GM). */
export function needsApproval(): boolean {
  return !game.user.isGM && !!getSetting("gmApproval");
}

export function registerFeatRequestActions(): void {
  registerGMAction(GM_ACTIONS.request, handleRequest);
  registerGMAction(GM_ACTIONS.added, (payload) => handleAdded(payload));
}
