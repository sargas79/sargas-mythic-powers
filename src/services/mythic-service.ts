/**
 * OWNER: agent A (M1 GM side). Grant / enable / disable / revoke mythic power for one character. GM only.
 *
 * Disable stores a full copy of every mythic item (and what it granted) in `state.suspended` before deleting
 * anything, so a reload mid-way never loses data. Enable recreates the copies with their original ids,
 * bypassing PF2e's item pre-create pipeline so GrantItem / ChoiceSet rules don't run a second time.
 */
import { GrantDialog } from "../apps/grant-dialog.js";
import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { esc, notify, t } from "../foundry/i18n.js";
import { appendLedger } from "../foundry/ledger.js";
import { getPf2eMythicMode, getSetting } from "../foundry/settings.js";
import type { Progression } from "../rules/progression.js";
import {
  cardRecipients,
  collectSuspendIds,
  itemsToRestore,
  mergeSuspended,
  type GrantMeta,
  type ItemSourceLike,
} from "../rules/suspend.js";
import {
  callingItem,
  mythicPoints,
  mythicTier,
  setMythicPoints,
  setMythicTier,
} from "../state/actor-mythic.js";
import { clearState, getState, isCharacter, setState, type MythicState } from "../state/flags.js";
import { assignCalling } from "./callings.js";

export interface GrantOptions {
  source: string;
  progression: Progression;
  callingChoice: "player" | "gm";
  /** Compendium UUID of the Calling when the GM assigns it. */
  callingUuid?: string | null;
  startWithFullPoints: boolean;
  announce: boolean;
}

/** Flag key (next to `state`) holding grant bookkeeping that is not part of the shared MythicState. */
export const GRANT_META_KEY = "grantMeta";

export function getGrantMeta(actor: ActorPF2e): Partial<GrantMeta> | null {
  return actor?.flags?.[MODULE_ID]?.[GRANT_META_KEY] ?? null;
}

/** GM only. Writes the grant bookkeeping flag. */
export async function setGrantMeta(actor: ActorPF2e, meta: GrantMeta): Promise<void> {
  await actor.update({ [`flags.${MODULE_ID}.${GRANT_META_KEY}`]: meta });
}

/**
 * setState, then put grantMeta back if the state write replaced it (setState writes with recursive: false).
 */
async function writeState(actor: ActorPF2e, patch: Partial<MythicState>): Promise<void> {
  const meta = getGrantMeta(actor);
  await setState(actor, patch);
  if (meta && !getGrantMeta(actor)) await setGrantMeta(actor, meta as GrantMeta);
}

function assertGM(): boolean {
  if (game.user?.isGM) return true;
  notify.warn("errors.gmOnly");
  return false;
}

/** True when the grant / enable card should be sent at all (world setting). */
export function announcementsEnabled(): boolean {
  try {
    return getSetting("announce") !== "none";
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Chat cards
// ---------------------------------------------------------------------------------------------------------

export type CardKind = "grant" | "enable";

/** Every GM plus the actor's non-GM owners. */
export function announcementRecipients(actor: ActorPF2e): string[] {
  const users = (game.users?.contents ?? []).map((u: UserDoc) => ({
    id: u.id as string,
    isGM: !!u.isGM,
    isOwner: !u.isGM && !!actor.testUserPermission(u, "OWNER"),
  }));
  return cardRecipients(users);
}

export async function sendCard(actor: ActorPF2e, kind: CardKind): Promise<void> {
  if (!announcementsEnabled()) return;
  const state = getState(actor);
  const name = actor.name ?? "";
  const data = {
    kind,
    actorUuid: actor.uuid,
    whisper: t("grant.card.whisper", { name: esc(name) }),
    title: kind === "grant" ? t("grant.card.grantTitle") : t("grant.card.enableTitle"),
    body:
      kind === "grant"
        ? state.source
          ? t("grant.card.grantBodySource", { name: esc(name), source: esc(state.source) })
          : t("grant.card.grantBody", { name: esc(name) })
        : t("grant.card.enableBody", { name: esc(name) }),
    callingHint:
      kind === "grant" && state.callingChoice === "player" && !callingItem(actor)
        ? t("grant.card.callingHint", { name: esc(name) })
        : "",
    showButton: kind === "grant" && state.callingChoice === "player" && !callingItem(actor),
    buttonLabel: t("grant.card.chooseCalling"),
  };
  const content = await foundry.applications.handlebars.renderTemplate(
    `${TEMPLATE_PATH}/grant-card.hbs`,
    data,
  );
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: announcementRecipients(actor),
    flags: { [MODULE_ID]: { card: { kind, actorUuid: actor.uuid } } },
  });
}

// ---------------------------------------------------------------------------------------------------------
// Grant
// ---------------------------------------------------------------------------------------------------------

export async function grantMythic(actor: ActorPF2e, options: GrantOptions): Promise<void> {
  if (!assertGM()) return;
  if (!isCharacter(actor)) {
    notify.warn("grant.errors.notCharacter");
    return;
  }
  const trials = options.progression === "trials";
  const hadCalling = !!callingItem(actor);
  const previous = getState(actor);
  const now = Date.now();

  await setState(actor, {
    granted: true,
    enabled: true,
    source: options.source ?? "",
    progression: options.progression,
    callingChoice: options.callingChoice,
    grantedAt: now,
    grantedLevel: Number(actor.level ?? 1),
    lateStart: { released: 0, lastReleaseSession: null },
    trials: trials
      ? { count: 1, log: [{ at: now, note: t("grant.trialNote") }], lastTierUpSession: null }
      : previous.trials,
    suspended: null,
  });
  // Written after setState: a non-recursive state write can replace sibling flags.
  await setGrantMeta(actor, {
    firstCallingDone: hadCalling,
    startWithFullPoints: !!options.startWithFullPoints,
  });

  if (trials) {
    await setMythicTier(actor, 0);
    if (getPf2eMythicMode() !== "variant-tiers") notify.warn("grant.errors.trialsNeedTiers");
  }
  if (hadCalling && options.startWithFullPoints) await setMythicPoints(actor, 3);

  if (options.callingChoice === "gm" && options.callingUuid && !hadCalling) {
    try {
      await assignCalling(actor, options.callingUuid);
    } catch (error) {
      notify.error("grant.errors.callingFailed", { name: actor.name }, error);
    }
  }

  await appendLedger({
    kind: "grant",
    actorUuid: actor.uuid,
    actorName: actor.name,
    message: t("grant.ledger.grant", {
      name: actor.name,
      progression: t(`grant.progression.${options.progression}.label`),
    }),
  });
  if (options.announce) await sendCard(actor, "grant");
  notify.info("grant.notify.granted", { name: actor.name });
}

// ---------------------------------------------------------------------------------------------------------
// Disable / enable
// ---------------------------------------------------------------------------------------------------------

function sourceSummary(item: ItemPF2e): ItemSourceLike {
  const src = item._source ?? item;
  return { _id: item.id, type: item.type, system: src.system, flags: src.flags };
}

/** Ids of the mythic items on the actor plus everything they granted. */
export function suspendIds(actor: ActorPF2e): string[] {
  return collectSuspendIds((actor.items?.contents ?? []).map(sourceSummary));
}

export async function disableMythic(actor: ActorPF2e): Promise<void> {
  if (!assertGM()) return;
  const state = getState(actor);
  if (!state.granted || !isCharacter(actor)) return;
  if (!state.enabled && state.suspended) return;

  const ids = suspendIds(actor);
  const data = ids.map((id) => actor.items.get(id)?.toObject()).filter(Boolean) as Record<string, unknown>[];
  const points = mythicPoints(actor).value;
  const tier = state.progression === "trials" ? mythicTier(actor) : null;

  // 1. Store first, so nothing is lost if Foundry reloads mid-way.
  const items = state.suspended ? mergeSuspended(state.suspended.items, data) : data;
  await writeState(actor, {
    suspended: {
      items,
      points: state.suspended ? state.suspended.points : points,
      tier: state.suspended ? state.suspended.tier : tier,
      at: Date.now(),
    },
  });
  // 2. Delete.
  const existing = ids.filter((id) => actor.items.has(id));
  if (existing.length) await actor.deleteEmbeddedDocuments("Item", existing);
  // 3. Flip the switch.
  await writeState(actor, { enabled: false });

  await appendLedger({
    kind: "disable",
    actorUuid: actor.uuid,
    actorName: actor.name,
    message: t("grant.ledger.disable", { name: actor.name, count: items.length }),
  });
  notify.info("grant.notify.disabled", { name: actor.name });
}

/**
 * Recreate stored items with their original ids. Uses the base Document.createDocuments so PF2e's
 * ItemPF2e.createDocuments override (which runs GrantItem and ChoiceSet pre-create logic) does not add
 * duplicate granted children or prompt for choices again. The stored data already contains the children
 * and the `itemGrants` / `grantedBy` links between them.
 */
async function recreateItems(actor: ActorPF2e, data: Record<string, unknown>[]): Promise<void> {
  if (!data.length) return;
  const ItemClass = CONFIG.Item.documentClass;
  await foundry.abstract.Document.createDocuments.call(ItemClass, foundry.utils.deepClone(data), {
    parent: actor,
    keepId: true,
  });
}

export async function enableMythic(actor: ActorPF2e): Promise<void> {
  if (!assertGM()) return;
  const state = getState(actor);
  if (!state.granted || !isCharacter(actor)) return;
  if (state.enabled && !state.suspended) return;
  const suspended = state.suspended;

  if (suspended) {
    const existing = (actor.items?.contents ?? []).map((i: ItemPF2e) => i.id as string);
    const toCreate = itemsToRestore(suspended.items as { _id?: string }[], existing);
    await recreateItems(actor, toCreate as Record<string, unknown>[]);
  }
  await writeState(actor, { enabled: true, suspended: null });
  if (suspended) {
    if (suspended.tier !== null && suspended.tier !== undefined) await setMythicTier(actor, suspended.tier);
    await setMythicPoints(actor, suspended.points);
  }

  await appendLedger({
    kind: "enable",
    actorUuid: actor.uuid,
    actorName: actor.name,
    message: t("grant.ledger.enable", { name: actor.name, count: suspended?.items.length ?? 0 }),
  });
  if (announcementsEnabled()) await sendCard(actor, "enable");
  notify.info("grant.notify.enabled", { name: actor.name });
}

// ---------------------------------------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------------------------------------

export async function revokeMythic(actor: ActorPF2e, options: { confirm?: boolean } = {}): Promise<boolean> {
  if (!assertGM()) return false;
  if (!isCharacter(actor) || !getState(actor).granted) return false;
  if (options.confirm !== false) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("grant.revoke.title", { name: actor.name }), icon: "fa-solid fa-ban" },
      content: `<p>${t("grant.revoke.content", { name: esc(actor.name) })}</p>`,
      rejectClose: false,
      modal: true,
    });
    if (!ok) return false;
  }
  const ids = suspendIds(actor).filter((id) => actor.items.has(id));
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
  await clearState(actor);
  await appendLedger({
    kind: "revoke",
    actorUuid: actor.uuid,
    actorName: actor.name,
    message: t("grant.ledger.revoke", { name: actor.name, count: ids.length }),
  });
  notify.info("grant.notify.revoked", { name: actor.name });
  return true;
}

/** Opens the Grant Mythic Power dialog (GM only). */
export async function openGrantDialog(actor: ActorPF2e): Promise<void> {
  if (!assertGM()) return;
  if (!isCharacter(actor)) {
    notify.warn("grant.errors.notCharacter");
    return;
  }
  await GrantDialog.open(actor);
}
