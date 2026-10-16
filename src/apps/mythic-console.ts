/**
 * OWNER: agent D. GM Mythic Console (mockup M5, issues #15 and #16): one row per player character or granted
 * character with the enable switch, Calling, Mythic Points, progression, doomed, pending feats and awards,
 * a session toolbar and the newest ledger entries. Singleton, GM only, re-renders when actors change.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { HOOKS, MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { esc, notify, t } from "../foundry/i18n.js";
import { getLedger, markUndone } from "../foundry/ledger.js";
import { currentSession, sessionStartedAt } from "../foundry/session.js";
import { getSetting, setSetting } from "../foundry/settings.js";
import { MAX_MYTHIC_POINTS } from "../rules/awards.js";
import {
  distinctSources,
  initials,
  pipStates,
  pipTarget,
  trialProgress,
  undoableEntryId,
} from "../rules/console.js";
import { lateStartOwed, tierAboveHalfLevel, tierForTrials, trialsToNextTier } from "../rules/progression.js";
import { loadCallings } from "../services/callings.js";
import { approvePending, rejectPending } from "../services/feat-requests.js";
import { disableMythic, enableMythic, openGrantDialog, revokeMythic } from "../services/mythic-service.js";
import {
  activeMythicCharacters,
  awardDeed,
  awardKill,
  changePoints,
  startSession,
} from "../services/points.js";
import { logTrial, releaseLateStart } from "../services/progression-service.js";
import {
  callingItem,
  emptyOpenSlotIds,
  mythicPoints,
  mythicTier,
  setMythicPoints,
} from "../state/actor-mythic.js";
import { getState, isCharacter, isGranted } from "../state/flags.js";

const LEDGER_ROWS = 20;

let ConsoleClass: any = null;
let instance: any = null;

/** Characters shown in the console: player-owned or granted, sorted by name. */
function consoleActors(): ActorPF2e[] {
  return (game.actors?.contents ?? [])
    .filter((a: ActorPF2e) => isCharacter(a) && (a.hasPlayerOwner || isGranted(a)))
    .sort((a: ActorPF2e, b: ActorPF2e) => String(a.name).localeCompare(String(b.name)));
}

function ownerNames(actor: ActorPF2e): string {
  return (game.users?.contents ?? [])
    .filter((u: UserDoc) => !u.isGM && actor.testUserPermission?.(u, "OWNER"))
    .map((u: UserDoc) => u.name)
    .join(", ");
}

function formatTime(at: number): string {
  if (!at) return "";
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildRow(actor: ActorPF2e): Record<string, unknown> {
  const s = getState(actor);
  const active = s.granted && s.enabled;
  const level = Number(actor.level ?? 1);
  const className = actor.class?.name ?? "";

  let callingName: string | null = callingItem(actor)?.name ?? null;
  let callingKept = false;
  if (!callingName && s.suspended) {
    const kept = s.suspended.items.find((i: any) => i?.system?.category === "calling") as any;
    if (kept) {
      callingName = String(kept.name ?? "");
      callingKept = true;
    }
  }

  const points = mythicPoints(actor).value;
  const tier = mythicTier(actor);
  const progression: Record<string, unknown> = { kind: s.progression };
  let warning: string | null = null;
  if (s.progression === "trials") {
    const p = trialProgress(s.trials.count, tier);
    const toNext = trialsToNextTier(s.trials.count, tier);
    const reachable = tierForTrials(s.trials.count);
    progression.trials = true;
    progression.tierLabel = t("console.progress.tier", { tier });
    progression.percent = p.percent;
    progression.detail =
      p.nextTier === null
        ? t("console.progress.maxTier")
        : t("console.progress.toNext", { done: p.done, span: p.span, tier: p.nextTier });
    progression.trialsLabel = t("console.progress.trialCount", { count: s.trials.count });
    progression.heldBack = reachable > tier && toNext === 0;
    progression.heldBackLabel = t("console.progress.heldBack", { tier: reachable });
    if (tierAboveHalfLevel(tier, level)) warning = t("console.progress.aboveHalfLevel", { tier, level });
  } else if (s.progression === "lateStart") {
    const owed = lateStartOwed(s.grantedLevel).length;
    const released = Math.min(owed, s.lateStart.released);
    progression.lateStart = true;
    progression.caughtUp = released >= owed;
    progression.detail = t("console.progress.lateStart", { released, owed });
  } else {
    progression.standard = true;
    progression.detail = t("console.progress.openSlots", {
      count: active ? emptyOpenSlotIds(actor).length : 0,
    });
  }

  const subtitleParts = [`${className} ${level}`.trim()];
  if (active && s.pending.length) {
    subtitleParts.push(t("console.row.pendingCount", { count: s.pending.length }));
  }
  if (s.granted && !s.enabled) subtitleParts.push(t("console.row.disabled"));
  if (!s.granted) subtitleParts.push(t("console.row.neverGranted"));

  const hero = actor.system?.resources?.heroPoints ?? {};
  const owners = ownerNames(actor);
  return {
    id: actor.id,
    name: actor.name,
    img: actor.img,
    initials: initials(actor.name),
    subtitle: subtitleParts.join(" · "),
    active,
    granted: s.granted,
    disabled: s.granted && !s.enabled,
    callingName,
    callingKept,
    points,
    pips: pipStates(points, MAX_MYTHIC_POINTS),
    pointsLabel: t("console.row.pointsLabel", { value: points, max: MAX_MYTHIC_POINTS }),
    progression,
    warning,
    doomed: Number(actor.system?.attributes?.doomed?.value ?? 0),
    pending: s.pending.map((p) => ({ id: p.id, name: p.name, slot: p.slotId })),
    hiddenLabel: owners ? t("console.row.hiddenFrom", { player: owners }) : t("console.row.hidden"),
    heroLabel: t("console.row.heroPoints", {
      value: Number(hero.value ?? 0),
      max: Number(hero.max ?? 3),
    }),
    toggleLabel: t(active ? "console.row.disable" : "console.row.enable"),
  };
}

function buildContext(): Record<string, unknown> {
  const ledger = getLedger();
  const undoId = undoableEntryId(ledger);
  const startedAt = sessionStartedAt();
  return {
    rows: consoleActors().map(buildRow),
    session: currentSession(),
    sessionLabel: startedAt
      ? t("console.toolbar.sessionStarted", { session: currentSession(), time: formatTime(startedAt) })
      : t("console.toolbar.sessionNone", { session: currentSession() }),
    ledger: ledger.slice(0, LEDGER_ROWS).map((e) => ({
      id: e.id,
      time: formatTime(e.at),
      message: e.message,
      undone: !!e.undone,
      canUndo: e.id === undoId,
    })),
  };
}

function actorFrom(target: HTMLElement): ActorPF2e | null {
  const id = target.closest<HTMLElement>("[data-actor-id]")?.dataset.actorId;
  return id ? (game.actors?.get(id) ?? null) : null;
}

async function confirm(titleKey: string, body: string): Promise<boolean> {
  const result = await foundry.applications.api.DialogV2.confirm({
    window: { title: t(titleKey) },
    content: `<p>${esc(body)}</p>`,
    rejectClose: false,
  });
  return result === true;
}

async function input(titleKey: string, content: string): Promise<Record<string, any> | null> {
  const result = await foundry.applications.api.DialogV2.input({
    window: { title: t(titleKey) },
    content,
    rejectClose: false,
  });
  return result && typeof result === "object" ? result : null;
}

function field(label: string, control: string): string {
  return `<div class="form-group"><label>${esc(label)}</label><div class="form-fields">${control}</div></div>`;
}

async function customDialog(actor: ActorPF2e): Promise<void> {
  const data = await input(
    "console.dialog.customTitle",
    `<p>${esc(t("console.dialog.customHint", { name: actor.name }))}</p>` +
      field(t("console.dialog.delta"), `<input type="number" name="delta" value="1" step="1" autofocus>`) +
      field(t("console.dialog.reason"), `<input type="text" name="reason">`),
  );
  if (!data) return;
  const delta = Math.trunc(Number(data.delta));
  if (!Number.isFinite(delta) || delta === 0) return;
  const reason = String(data.reason ?? "").trim();
  await changePoints(actor, "custom", { custom: delta, ...(reason ? { reason } : {}) });
}

async function trialDialog(actor: ActorPF2e): Promise<void> {
  const data = await input(
    "console.dialog.trialTitle",
    `<p>${esc(t("console.dialog.trialHint", { name: actor.name }))}</p>` +
      field(t("console.dialog.note"), `<input type="text" name="note" autofocus>`),
  );
  if (!data) return;
  await logTrial(actor, String(data.note ?? "").trim());
}

async function deedDialog(): Promise<void> {
  const data = await input(
    "console.dialog.deedTitle",
    `<p>${esc(t("console.dialog.deedHint"))}</p>` +
      field(t("console.dialog.reason"), `<input type="text" name="reason" autofocus>`),
  );
  if (!data) return;
  await awardDeed(String(data.reason ?? "").trim() || undefined);
}

async function killDialog(): Promise<void> {
  const mythic = activeMythicCharacters();
  const options = [
    `<option value="">${esc(t("console.dialog.killerNone"))}</option>`,
    ...mythic.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`),
  ].join("");
  const data = await input(
    "console.dialog.killTitle",
    `<p>${esc(t("console.dialog.killHint"))}</p>` +
      field(t("console.dialog.foe"), `<input type="text" name="foe" autofocus>`) +
      field(t("console.dialog.killer"), `<select name="killer">${options}</select>`),
  );
  if (!data) return;
  const killer = data.killer ? (game.actors?.get(String(data.killer)) ?? null) : null;
  await awardKill(killer, String(data.foe ?? "").trim());
}

async function sourcesDialog(): Promise<void> {
  const all = distinctSources((await loadCallings({ allSources: true })).map((c) => c.source));
  if (all.length === 0) {
    notify.warn("console.notify.noSources");
    return;
  }
  const current = getSetting("callingSources") ?? [];
  const boxes = all
    .map(
      (src, i) =>
        `<label class="smp-console-source"><input type="checkbox" name="src${i}" ${
          current.length === 0 || current.includes(src) ? "checked" : ""
        }> ${esc(src)}</label>`,
    )
    .join("");
  const data = await input(
    "console.dialog.sourcesTitle",
    `<p>${esc(t("console.dialog.sourcesHint"))}</p><div class="smp-console-sources">${boxes}</div>`,
  );
  if (!data) return;
  const picked = all.filter((_src, i) => !!data[`src${i}`]);
  // Every source checked is stored as "all" (empty list) so new publications show up too.
  await setSetting("callingSources", picked.length === all.length ? [] : picked);
  notify.info("console.notify.sourcesSaved", { count: picked.length });
}

async function undoEntry(id: string): Promise<void> {
  const entry = getLedger().find((e) => e.id === id);
  if (!entry || entry.undone || typeof entry.pointsBefore !== "number" || !entry.actorUuid) return;
  const actor = await fromUuid(entry.actorUuid);
  if (!actor) {
    notify.warn("console.notify.undoMissing");
    return;
  }
  await setMythicPoints(actor, entry.pointsBefore);
  await markUndone(id);
}

async function handleAction(action: string, target: HTMLElement): Promise<void> {
  const actor = actorFrom(target);
  switch (action) {
    case "toggle":
      if (!actor) return;
      if (getState(actor).enabled && getState(actor).granted) await disableMythic(actor);
      else await enableMythic(actor);
      return;
    case "grant":
      if (actor) await openGrantDialog(actor);
      return;
    case "revoke":
      if (actor) await revokeMythic(actor, { confirm: true });
      return;
    case "openSheet":
      actor?.sheet?.render(true);
      return;
    case "pip": {
      if (!actor) return;
      const current = mythicPoints(actor).value;
      const next = pipTarget(current, Number(target.dataset.value ?? 0));
      if (next === current) return;
      await changePoints(actor, "custom", { custom: next - current, reason: t("console.reason.set") });
      return;
    }
    case "edict":
      if (actor) await changePoints(actor, "edict");
      return;
    case "custom":
      if (actor) await customDialog(actor);
      return;
    case "anathema":
      if (
        actor &&
        (await confirm(
          "console.dialog.anathemaTitle",
          t("console.dialog.anathemaBody", { name: actor.name }),
        ))
      ) {
        await changePoints(actor, "anathema");
      }
      return;
    case "trial":
      if (actor) await trialDialog(actor);
      return;
    case "release":
      if (actor) await releaseLateStart(actor, 1);
      return;
    case "approve":
      if (actor && target.dataset.pendingId) await approvePending(actor, target.dataset.pendingId);
      return;
    case "reject":
      if (actor && target.dataset.pendingId) await rejectPending(actor, target.dataset.pendingId);
      return;
    case "startSession":
      if (
        await confirm(
          "console.dialog.sessionTitle",
          t("console.dialog.sessionBody", { session: currentSession() + 1 }),
        )
      ) {
        await startSession();
      }
      return;
    case "deed":
      await deedDialog();
      return;
    case "kill":
      await killDialog();
      return;
    case "sources":
      await sourcesDialog();
      return;
    case "undo":
      if (target.dataset.entryId) await undoEntry(target.dataset.entryId);
      return;
  }
}

const ACTIONS = [
  "toggle",
  "grant",
  "revoke",
  "openSheet",
  "pip",
  "edict",
  "custom",
  "anathema",
  "trial",
  "release",
  "approve",
  "reject",
  "startSession",
  "deed",
  "kill",
  "sources",
  "undo",
] as const;

function consoleClass(): any {
  if (ConsoleClass) return ConsoleClass;
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
  const actions = Object.fromEntries(
    ACTIONS.map((name) => [
      name,
      async function (this: any, _event: Event, target: HTMLElement) {
        try {
          await handleAction(name, target);
        } catch (error) {
          notify.error("console.notify.actionFailed", {}, error);
        }
      },
    ]),
  );
  ConsoleClass = class MythicConsole extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: "smp-mythic-console",
      classes: ["smp-console"],
      tag: "div",
      window: { title: `${MODULE_ID}.console.title`, icon: "fa-solid fa-hand-sparkles", resizable: true },
      position: { width: 1080, height: 700 },
      actions,
    };
    static PARTS = {
      main: { template: `${TEMPLATE_PATH}/mythic-console.hbs`, scrollable: [".smp-console-scroll"] },
    };
    async _prepareContext(_options: unknown): Promise<Record<string, unknown>> {
      return buildContext();
    }
    async _onClose(options: unknown): Promise<void> {
      if (instance === this) instance = null;
      return super._onClose?.(options);
    }
  };
  return ConsoleClass;
}

export async function openMythicConsole(): Promise<void> {
  if (!game.user?.isGM) {
    notify.warn("errors.gmOnly");
    return;
  }
  instance ??= new (consoleClass())();
  await instance.render({ force: true });
  instance.bringToFront?.();
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced re-render of the open console. */
export function refreshMythicConsole(): void {
  if (!instance?.rendered) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (instance?.rendered) void instance.render();
  }, 150);
}

/** Hooks that keep the open console current. Called once at init by the console-launcher feature. */
export function registerConsoleRefresh(): void {
  const ifCharacter = (actor: ActorPF2e) => {
    if (isCharacter(actor)) refreshMythicConsole();
  };
  const ifCharacterItem = (item: ItemPF2e) => {
    if (isCharacter(item?.parent)) refreshMythicConsole();
  };
  Hooks.on("updateActor", ifCharacter);
  Hooks.on("createActor", ifCharacter);
  Hooks.on("deleteActor", ifCharacter);
  Hooks.on("createItem", ifCharacterItem);
  Hooks.on("deleteItem", ifCharacterItem);
  Hooks.on("updateItem", ifCharacterItem);
  Hooks.on(`${MODULE_ID}.ledger`, refreshMythicConsole);
  Hooks.on(HOOKS.stateChanged, refreshMythicConsole);
  Hooks.on(HOOKS.sessionStart, refreshMythicConsole);
  Hooks.on("updateSetting", (setting: any) => {
    if (String(setting?.key ?? "").startsWith(`${MODULE_ID}.`)) refreshMythicConsole();
  });
}
