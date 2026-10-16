/**
 * OWNER: agent Y. Feature "npc-mythic" (docs/mythic-npcs.md, features 2-4). GM tools for mythic NPCs:
 * the "Reroll (Mythic Point)" chat option, Mythic Skill spending, "Spend Mythic Point" buttons on Recharge,
 * Recharge Spell and Remove a Condition cards, the combat start reset, the Undying Myth and Mythic Defenses
 * prompts, and the refresh hooks of the Mythic Console's Encounter section. Nothing is shown to players.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { MODULE_ID } from "../constants.js";
import { esc, notify, t } from "../foundry/i18n.js";
import { appendLedger } from "../foundry/ledger.js";
import { getSetting } from "../foundry/settings.js";
import { onceAsActiveGM } from "../foundry/socket.js";
import { refreshMythicConsole } from "../apps/mythic-console.js";
import {
  REROLL_KEEP,
  SPEND_CARD_ABILITIES,
  UNDYING_CLEARED_CONDITIONS,
  MYTHIC_SKILL_OPTION,
  abilityKeyOf,
  canRerollWithPoint,
  isCriticalAttack,
  shouldPromptUndying,
  undyingHp,
  usesMythicSkill,
  type NpcAbilityKey,
} from "../rules/npc-mythic.js";
import {
  hasNpcAbility,
  isMythicNpc,
  mythicNpcCombatants,
  npcPoints,
  resetNpcPoints,
  spendNpcPoint,
  takeDeferredKill,
} from "../services/npc-points.js";
import { gmIds, renderCard, rootElement, bindButtons, removeButtons, type Doc } from "./automation-cards.js";
import { promptMythicKill } from "./mythic-kill.js";
import type { Feature } from "./types.js";

/** Flag key (under flags["sargas-mythic-powers"]) of this feature's whispered cards. */
const NPC_CARD_FLAG = "npcCard";
/** Flag key marking a Recharge / Remove a Condition item card whose point was spent. */
const SPEND_FLAG = "npcSpend";

const UNDYING_TEMPLATE = "npc-undying-card";
const DEFENSES_TEMPLATE = "npc-defenses-card";
const SPEND_TEMPLATE = "npc-spend-card";

interface UndyingFlag {
  kind: "undying";
  status: "pending" | "used" | "fell";
  actorUuid: string;
  name: string;
  hp: number;
}

interface DefensesFlag {
  kind: "defenses";
  status: "pending" | "rerolled" | "ignored";
  messageId: string;
  targetName: string;
  attackerName: string;
}

type NpcCardFlag = UndyingFlag | DefensesFlag;

/** Actor uuids at 0 HP since they were last above it (one Undying Myth prompt per drop). */
const down = new Set<string>();

function hp(actor: ActorPF2e): number {
  return Number(actor?.system?.attributes?.hp?.value ?? 0);
}

function npcCardFlag(message: Doc): NpcCardFlag | null {
  const f = message?.flags?.[MODULE_ID]?.[NPC_CARD_FLAG];
  return f && typeof f.kind === "string" ? (f as NpcCardFlag) : null;
}

async function createCard(template: string, data: Record<string, unknown>, flag: NpcCardFlag): Promise<void> {
  await ChatMessage.create({
    content: await renderCard(template, data),
    speaker: ChatMessage.getSpeaker({ alias: t("npcMythic.speaker") }),
    whisper: gmIds(),
    flags: { [MODULE_ID]: { [NPC_CARD_FLAG]: flag } },
  });
}

async function updateNpcCard(
  message: Doc,
  template: string,
  data: Record<string, unknown>,
  flag: NpcCardFlag,
): Promise<void> {
  const content = await renderCard(template, data);
  await message.update({ content, [`flags.${MODULE_ID}.${NPC_CARD_FLAG}`]: flag });
}

/** Whispers a plain warning card to the GMs. */
async function whisperWarning(text: string): Promise<void> {
  await ChatMessage.create({
    content: `<div class="smp-card smp-npc-card smp-npc-warning"><div class="smp-whisper">${esc(
      t("automation.whisperGM"),
    )}</div><p>${esc(text)}</p></div>`,
    speaker: ChatMessage.getSpeaker({ alias: t("npcMythic.speaker") }),
    whisper: gmIds(),
  });
}

function nameHtml(name: string): string {
  return `<b>${esc(name)}</b>`;
}

/* ---------------- Reroll (Mythic Point) ---------------- */

function messageFromLi(li: unknown): Doc | null {
  const el = (li instanceof HTMLElement ? li : (li as { [0]?: HTMLElement } | null)?.[0]) ?? null;
  const id = el?.dataset?.messageId;
  return id ? (game.messages?.get(id) ?? null) : null;
}

function canReroll(message: Doc | null): boolean {
  if (!message) return false;
  const actor = message.actor;
  return canRerollWithPoint({
    isGM: !!game.user?.isGM,
    mythicNpc: isMythicNpc(actor),
    hasReroll: !!actor && hasNpcAbility(actor, "reroll"),
    points: actor ? npcPoints(actor).value : 0,
    outcome: message.flags?.pf2e?.context?.outcome,
    rerollable: !!message.isRerollable,
  });
}

async function rerollWithPoint(message: Doc): Promise<void> {
  const actor = message.actor;
  if (!canReroll(message)) return;
  await game.pf2e.Check.rerollFromMessage(message, { keep: REROLL_KEEP });
  if (!(await spendNpcPoint(actor, t("npcMythic.reason.reroll")))) {
    notify.warn("npcMythic.notify.noPoints", { name: actor.name });
  }
}

function addContextOptions(_app: unknown, options: any[]): void {
  if (!game.user?.isGM || !Array.isArray(options)) return;
  options.push({
    label: t("npcMythic.reroll.label"),
    icon: "fa-solid fa-circle-m",
    visible: (li: unknown) => canReroll(messageFromLi(li)),
    onClick: (_event: Event, li: unknown) => {
      const message = messageFromLi(li);
      if (message)
        rerollWithPoint(message).catch((error) => notify.error("npcMythic.notify.failed", {}, error));
    },
  });
}

/* ---------------- Mythic Skill ---------------- */

async function onMythicSkill(message: Doc): Promise<void> {
  const actor = message.actor;
  if (!isMythicNpc(actor)) return;
  const spent = await spendNpcPoint(actor, t("npcMythic.reason.skill"));
  // PF2e: toggleRollOption(domain, option, itemId | null, value). The glossary rule has the default domain "all".
  await actor.toggleRollOption("all", MYTHIC_SKILL_OPTION, null, false);
  if (!spent) await whisperWarning(t("npcMythic.skill.noPoints", { name: actor.name }));
}

/* ---------------- Mythic Defenses ---------------- */

function targetOf(message: Doc): ActorPF2e | null {
  if (message.target?.actor) return message.target.actor;
  const uuid = message.flags?.pf2e?.context?.target?.actor;
  if (typeof uuid !== "string" || !uuid) return null;
  try {
    const doc = fromUuidSync(uuid);
    return doc?.documentName === "Actor" ? doc : (doc?.actor ?? null);
  } catch {
    return null;
  }
}

function defensesData(flag: DefensesFlag): Record<string, unknown> {
  return {
    whisper: t("automation.whisperGM"),
    title: t("npcMythic.defenses.title"),
    body: t("npcMythic.defenses.body", {
      target: nameHtml(flag.targetName),
      attacker: nameHtml(flag.attackerName),
    }),
    pending: flag.status === "pending",
    status: flag.status,
    statusText:
      flag.status === "rerolled" ? t("npcMythic.defenses.rerolled") : t("npcMythic.defenses.ignored"),
    labels: { reroll: t("npcMythic.defenses.reroll"), ignore: t("npcMythic.defenses.ignore") },
  };
}

async function onCriticalAttack(message: Doc): Promise<void> {
  const target = targetOf(message);
  if (!target || !hasNpcAbility(target, "defenses")) return;
  const flag: DefensesFlag = {
    kind: "defenses",
    status: "pending",
    messageId: message.id,
    targetName: target.name,
    attackerName: message.actor?.name ?? message.alias ?? "",
  };
  await createCard(DEFENSES_TEMPLATE, defensesData(flag), flag);
}

async function onDefensesButton(card: Doc, flag: DefensesFlag, action: string): Promise<void> {
  if (action === "reroll") {
    const attack = game.messages?.get(flag.messageId);
    if (!attack) {
      notify.warn("npcMythic.notify.attackGone");
      return;
    }
    await game.pf2e.Check.rerollFromMessage(attack, { keep: REROLL_KEEP });
    const next: DefensesFlag = { ...flag, status: "rerolled" };
    await updateNpcCard(card, DEFENSES_TEMPLATE, defensesData(next), next);
  } else if (action === "ignore") {
    const next: DefensesFlag = { ...flag, status: "ignored" };
    await updateNpcCard(card, DEFENSES_TEMPLATE, defensesData(next), next);
  }
}

/* ---------------- Undying Myth ---------------- */

function undyingData(flag: UndyingFlag): Record<string, unknown> {
  return {
    whisper: t("automation.whisperGM"),
    title: t("npcMythic.undying.title"),
    body: t("npcMythic.undying.body", { name: nameHtml(flag.name), hp: flag.hp }),
    pending: flag.status === "pending",
    status: flag.status,
    statusText:
      flag.status === "used"
        ? t("npcMythic.undying.used", { name: flag.name, hp: flag.hp })
        : t("npcMythic.undying.fell", { name: flag.name }),
    labels: { use: t("npcMythic.undying.use"), fall: t("npcMythic.undying.fall") },
  };
}

async function promptUndying(actor: ActorPF2e): Promise<void> {
  const flag: UndyingFlag = {
    kind: "undying",
    status: "pending",
    actorUuid: actor.uuid,
    name: actor.name,
    hp: undyingHp(Number(actor.system?.attributes?.hp?.max ?? 0)),
  };
  await createCard(UNDYING_TEMPLATE, undyingData(flag), flag);
}

/** Combatants of any encounter that represent the actor. */
function combatantsOf(actor: ActorPF2e): any[] {
  return (game.combats?.contents ?? []).flatMap((combat: any) =>
    (combat.combatants?.contents ?? []).filter((c: any) => c.actor?.uuid === actor.uuid),
  );
}

/**
 * Stands the creature back up: clears the defeated / dead marks first (so PF2e's own "revive" toggle on the HP
 * update has nothing to flip back), removes dying and unconscious, then sets HP and spends every point.
 */
async function useUndying(actor: ActorPF2e): Promise<number> {
  const restored = undyingHp(Number(actor.system?.attributes?.hp?.max ?? 0));
  for (const c of combatantsOf(actor)) if (c.defeated) await c.update({ defeated: false });
  if (actor.statuses?.has?.("dead")) await actor.toggleStatusEffect("dead", { active: false, overlay: true });
  const cleared: readonly string[] = UNDYING_CLEARED_CONDITIONS;
  const conditionIds = (actor.itemTypes?.condition ?? [])
    .filter((c: any) => cleared.includes(c.slug))
    .map((c: any) => c.id);
  if (conditionIds.length) await actor.deleteEmbeddedDocuments("Item", conditionIds);
  const before = npcPoints(actor).value;
  await actor.update({
    "system.attributes.hp.value": restored,
    "system.resources.mythicPoints.value": 0,
  });
  await appendLedger({
    kind: "death",
    actorUuid: actor.uuid,
    actorName: actor.name,
    message: t("npcMythic.ledger.undying", { name: actor.name, hp: restored, before }),
  });
  return restored;
}

async function onUndyingButton(card: Doc, flag: UndyingFlag, action: string): Promise<void> {
  const actor = fromUuidSync(flag.actorUuid);
  if (action === "use") {
    if (!actor) {
      notify.warn("npcMythic.notify.actorGone", { name: flag.name });
      return;
    }
    const restored = await useUndying(actor);
    takeDeferredKill(flag.actorUuid);
    const next: UndyingFlag = { ...flag, status: "used", hp: restored };
    await updateNpcCard(card, UNDYING_TEMPLATE, undyingData(next), next);
  } else if (action === "fall") {
    const next: UndyingFlag = { ...flag, status: "fell" };
    await updateNpcCard(card, UNDYING_TEMPLATE, undyingData(next), next);
    if (takeDeferredKill(flag.actorUuid) && actor) promptMythicKill(actor);
  }
}

function onUpdateActor(actor: ActorPF2e, changes: Record<string, unknown>): void {
  if (actor?.type !== "npc") return;
  refreshMythicConsole();
  // Every GM client tracks who is down; only one of them prompts (keyed on this update).
  if (!game.user.isGM) return;
  if (foundry.utils.getProperty(changes ?? {}, "system.attributes.hp.value") === undefined) return;
  const key = actor.uuid;
  if (hp(actor) > 0) {
    down.delete(key);
    return;
  }
  const alreadyDown = down.has(key);
  down.add(key);
  const prompt = shouldPromptUndying({
    enabled: !!getSetting("undyingPrompt"),
    mythicNpc: isMythicNpc(actor),
    hasUndying: hasNpcAbility(actor, "undying"),
    points: npcPoints(actor).value,
    hp: hp(actor),
    alreadyDown,
  });
  if (!prompt) return;
  const once = `undying:${key}:${actor._stats?.modifiedTime ?? ""}`;
  onceAsActiveGM(once, () => promptUndying(actor)).catch((error) =>
    notify.error("npcMythic.notify.failed", {}, error),
  );
}

/* ---------------- Spend buttons on item cards ---------------- */

/** The mythic NPC and spend-card ability of an item card, or null. */
function spendCardOf(message: Doc): { actor: ActorPF2e; item: any; key: NpcAbilityKey } | null {
  const pf2e = message?.flags?.pf2e;
  if (!pf2e?.origin || pf2e.context) return null;
  let item: any = null;
  try {
    item = message.item ?? (pf2e.origin.uuid ? fromUuidSync(pf2e.origin.uuid) : null);
  } catch {
    item = null;
  }
  const key = abilityKeyOf(item);
  if (!key || !SPEND_CARD_ABILITIES.includes(key)) return null;
  const actor = item?.actor ?? message.actor;
  return isMythicNpc(actor) ? { actor, item, key } : null;
}

async function chooseCondition(actor: ActorPF2e): Promise<any | null | undefined> {
  const conditions: any[] = actor.conditions?.stored ?? actor.itemTypes?.condition ?? [];
  if (conditions.length === 0) {
    notify.warn("npcMythic.notify.noConditions", { name: actor.name });
    return undefined;
  }
  const options = conditions.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  const content = `<div class="form-group"><label>${esc(t("npcMythic.remove.label"))}</label>
    <div class="form-fields"><select name="condition">${options}</select></div></div>`;
  const result = await foundry.applications.api.DialogV2.input({
    window: { title: t("npcMythic.remove.title", { name: actor.name }) },
    content,
    ok: { label: t("npcMythic.remove.ok") },
    rejectClose: false,
  });
  if (!result?.condition) return undefined;
  return conditions.find((c) => c.id === result.condition) ?? null;
}

async function onSpend(message: Doc): Promise<void> {
  const card = spendCardOf(message);
  if (!card || message.flags?.[MODULE_ID]?.[SPEND_FLAG]?.used) return;
  const { actor, item, key } = card;
  if (npcPoints(actor).value < 1) {
    notify.warn("npcMythic.notify.noPoints", { name: actor.name });
    return;
  }
  let removed: string | null = null;
  if (key === "removeCondition") {
    const condition = await chooseCondition(actor);
    if (!condition) return;
    removed = String(condition.name ?? "");
    await actor.decreaseCondition(condition, { forceRemove: true });
  }
  const reason = removed
    ? t("npcMythic.reason.removed", { ability: item.name, condition: removed })
    : String(item.name ?? "");
  if (!(await spendNpcPoint(actor, reason))) {
    notify.warn("npcMythic.notify.noPoints", { name: actor.name });
    return;
  }
  await message.update({ [`flags.${MODULE_ID}.${SPEND_FLAG}`]: { used: true, removed } });
}

async function injectSpendButton(message: Doc, root: HTMLElement): Promise<void> {
  const card = spendCardOf(message);
  if (!card) return;
  const spent = message.flags?.[MODULE_ID]?.[SPEND_FLAG];
  const { value, max } = npcPoints(card.actor);
  const html = await renderCard(SPEND_TEMPLATE, {
    used: !!spent?.used,
    usedText: spent?.removed
      ? t("npcMythic.spend.usedRemoved", { condition: spent.removed })
      : t("npcMythic.spend.used"),
    canSpend: value >= 1,
    label: t("npcMythic.spend.label"),
    tooltip: t("npcMythic.spend.tooltip"),
    pointsLabel: t("npcMythic.console.pointsLabel", { value, max }),
  });
  const holder = document.createElement("div");
  holder.innerHTML = html.trim();
  const block = holder.firstElementChild as HTMLElement | null;
  if (!block) return;
  root.querySelector(".smp-npc-spend")?.remove();
  (root.querySelector(".message-content") ?? root).append(block);
  const button = block.querySelector<HTMLButtonElement>("[data-smp-npc-spend]");
  button?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    try {
      await onSpend(message);
    } catch (error) {
      notify.error("npcMythic.notify.failed", {}, error);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });
}

/* ---------------- Chat hooks ---------------- */

function onCreateMessage(message: Doc): void {
  if (!game.user.isGM) return;
  const context = message?.flags?.pf2e?.context;
  if (!context) return;
  const run = async () => {
    if (usesMythicSkill(context)) await onMythicSkill(message);
    if (isCriticalAttack(context) && getSetting("defensesPrompt")) await onCriticalAttack(message);
  };
  onceAsActiveGM(`npc-message:${message.id}`, run).catch((error) =>
    notify.error("npcMythic.notify.failed", {}, error),
  );
}

async function onCardButton(message: Doc, action: string): Promise<void> {
  const flag = npcCardFlag(message);
  if (!flag || flag.status !== "pending" || !game.user.isGM) return;
  try {
    if (flag.kind === "undying") await onUndyingButton(message, flag, action);
    else if (flag.kind === "defenses") await onDefensesButton(message, flag, action);
  } catch (error) {
    notify.error("npcMythic.notify.failed", {}, error);
  }
}

function onRender(message: Doc, html: unknown): void {
  const root = rootElement(html);
  if (!root) return;
  if (npcCardFlag(message)) {
    if (!game.user.isGM) removeButtons(root);
    else bindButtons(root, (action) => onCardButton(message, action));
    return;
  }
  if (!game.user.isGM) return;
  injectSpendButton(message, root).catch((error) => notify.error("npcMythic.notify.failed", {}, error));
}

/* ---------------- Combat ---------------- */

function onCombatStart(combat: any): void {
  if (!game.user.isGM || !getSetting("npcResetOnCombat")) return;
  const run = async () => {
    for (const actor of mythicNpcCombatants(combat))
      await resetNpcPoints(actor, t("npcMythic.reason.combat"));
  };
  onceAsActiveGM(`npc-combat-start:${combat?.id}`, run).catch((error) =>
    notify.error("npcMythic.notify.failed", {}, error),
  );
}

export const feature: Feature = {
  id: "npc-mythic",
  register() {
    Hooks.on("getChatMessageContextOptions", addContextOptions);
    Hooks.on("createChatMessage", onCreateMessage);
    Hooks.on("renderChatMessageHTML", onRender);
    Hooks.on("updateActor", onUpdateActor);
    Hooks.on("combatStart", onCombatStart);
    // Mythic Console Encounter section (the console's own hooks cover characters only).
    for (const hook of [
      "updateCombat",
      "createCombat",
      "deleteCombat",
      "createCombatant",
      "deleteCombatant",
    ]) {
      Hooks.on(hook, () => refreshMythicConsole());
    }
    const ifNpcItem = (item: ItemPF2e) => {
      if (item?.parent?.type === "npc") refreshMythicConsole();
    };
    Hooks.on("createItem", ifNpcItem);
    Hooks.on("deleteItem", ifNpcItem);
  },
  ready() {
    // Creatures already down when the world loads don't prompt until healed above 0 HP.
    const npcs: ActorPF2e[] = [
      ...(game.actors?.contents ?? []),
      ...(game.combats?.contents ?? []).flatMap((c: any) =>
        (c.combatants?.contents ?? []).map((cb: any) => cb.actor),
      ),
    ];
    for (const actor of npcs) if (actor?.type === "npc" && hp(actor) <= 0) down.add(actor.uuid);
  },
};
