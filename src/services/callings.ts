/**
 * OWNER: agent B (M1 player side). Loads Callings from the PF2e compendium and assigns one to an actor.
 * Descriptions are parsed by src/rules/callings.ts. Ledger entries are written by the GM: a player's pick is
 * reported through the "callingChosen" GM action registered by the sheet-banner feature. Ledger messages
 * are plain text.
 */
import { PF2E } from "../constants.js";
import { appendLedger } from "../foundry/ledger.js";
import { notify, t } from "../foundry/i18n.js";
import { getSetting } from "../foundry/settings.js";
import { runAsGM } from "../foundry/socket.js";
import { getState, isMythicActive } from "../state/flags.js";
import { callingItem } from "../state/actor-mythic.js";
import { parseCalling, type ParsedCalling } from "../rules/callings.js";

export interface CallingInfo {
  uuid: string;
  name: string;
  img: string;
  source: string;
  /** Plain-text summary of the actions that use mythic proficiency. */
  actions: string;
  /** Plain text of the daily regain sentence. */
  regain: string;
  edicts: string;
  anathema: string;
  /** Enriched HTML description. */
  description: string;
  /** Short action names (for example ["Seek", "Track"]). */
  actionList: string[];
  /** Flavour text before the rules sentences. */
  summary: string;
}

/** GM action name for the ledger entry of a player's Calling pick. */
export const CALLING_LEDGER_ACTION = "callingChosen";

let cache: Promise<CallingInfo[]> | null = null;

function enrich(html: string): Promise<string> {
  const editor = foundry.applications?.ux?.TextEditor?.implementation ?? foundry.applications?.ux?.TextEditor;
  if (!editor?.enrichHTML) return Promise.resolve(html);
  return editor.enrichHTML(html, { async: true });
}

async function loadAll(): Promise<CallingInfo[]> {
  const pack = game.packs?.get(PF2E.callingsPack);
  if (!pack) {
    notify.warn("callingPicker.noPack");
    return [];
  }
  const index = await pack.getIndex({
    fields: ["system.category", "system.publication.title", "system.traits"],
  });
  const ids: string[] = [];
  for (const entry of index) {
    if (entry.type === "feat" && entry.system?.category === PF2E.callingCategory) ids.push(entry._id);
  }
  if (!ids.length) return [];
  const docs: ItemPF2e[] = await pack.getDocuments({ _id__in: ids });
  const out: CallingInfo[] = [];
  for (const doc of docs) {
    const html = String(doc.system?.description?.value ?? "");
    const parsed = parseCalling(html);
    out.push({
      uuid: doc.uuid,
      name: doc.name,
      img: doc.img,
      source: String(doc.system?.publication?.title ?? ""),
      actions: parsed.actionsText,
      regain: parsed.regain,
      edicts: parsed.edicts,
      anathema: parsed.anathema,
      description: await enrich(html),
      actionList: parsed.actions,
      summary: parsed.summary,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, game.i18n?.lang));
}

/** Callings from pf2e.classfeatures, filtered by the allowed-sources setting unless `allSources`. */
export async function loadCallings(options: { allSources?: boolean } = {}): Promise<CallingInfo[]> {
  cache ??= loadAll().catch((error) => {
    cache = null;
    throw error;
  });
  const all = await cache;
  if (options.allSources) return [...all];
  const allowed = allowedSources();
  if (!allowed.length) return [...all];
  return all.filter((c) => allowed.includes(c.source));
}

/** Publication titles allowed by the GM (empty = all). */
export function allowedSources(): string[] {
  try {
    const value = getSetting("callingSources");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

/** Parsed edicts, anathema, actions and regain of the actor's current Calling, or null. */
export function actorCalling(actor: ActorPF2e): (ParsedCalling & { name: string; item: ItemPF2e }) | null {
  const item = callingItem(actor);
  if (!item) return null;
  return { ...parseCalling(String(item.system?.description?.value ?? "")), name: item.name, item };
}

/** Whether `user` may pick (or, for the GM, replace) this actor's Calling now. */
export function canChooseCalling(actor: ActorPF2e, user: UserDoc = game.user): boolean {
  if (!isMythicActive(actor)) return false;
  if (user?.isGM) return true;
  if (!actor.testUserPermission?.(user, "OWNER")) return false;
  return getState(actor).callingChoice === "player" && !callingItem(actor);
}

/** Adds the Calling to the "mythic-calling" slot. Owner or GM. */
export async function assignCalling(actor: ActorPF2e, uuid: string): Promise<void> {
  if (!isMythicActive(actor)) {
    notify.warn("callingPicker.notActive");
    return;
  }
  if (!canChooseCalling(actor)) {
    notify.warn("callingPicker.notAllowed");
    return;
  }
  const item = await fromUuid(uuid);
  if (!item || item.type !== "feat" || item.system?.category !== PF2E.callingCategory) {
    notify.warn("callingPicker.notFound");
    return;
  }
  const existing = callingItem(actor);
  const oldName: string | null = existing?.name ?? null;
  if (existing) {
    const sourceId = existing._stats?.compendiumSource ?? existing.sourceId ?? existing.flags?.core?.sourceId;
    if (sourceId === uuid) return;
    // GM only (canChooseCalling): remove the old Calling and the items it granted.
    await existing.delete();
  }
  await actor.feats.insertFeat(item, { groupId: PF2E.featGroup, slotId: PF2E.callingSlot });

  if (game.user.isGM) {
    await writeCallingLedger(actor, item.name, oldName);
  } else {
    await runAsGM(CALLING_LEDGER_ACTION, { actorUuid: actor.uuid });
  }
}

async function writeCallingLedger(actor: ActorPF2e, calling: string, old: string | null): Promise<void> {
  const message = old
    ? t("callingPicker.ledgerReplaced", { actor: actor.name, calling, old })
    : t("callingPicker.ledger", { actor: actor.name, calling });
  await appendLedger({ kind: "calling", actorUuid: actor.uuid, actorName: actor.name, message });
}

/** GM handler for CALLING_LEDGER_ACTION: logs the Calling the player's character now has. */
export async function handleCallingLedger(payload: { actorUuid?: string }, userId: string): Promise<void> {
  if (!payload?.actorUuid) return;
  const actor = await fromUuid(payload.actorUuid);
  if (!actor || actor.documentName !== "Actor") return;
  const user = game.users?.get(userId);
  if (!user || !actor.testUserPermission(user, "OWNER")) return;
  const calling = callingItem(actor);
  if (!calling) return;
  await writeCallingLedger(actor, calling.name, null);
}

/** Clears the loaded Callings (for example after the compendium changes). */
export function resetCallingCache(): void {
  cache = null;
}
