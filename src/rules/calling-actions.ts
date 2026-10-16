/**
 * Calling daily regain (War of Immortals): "The first time each day that you critically succeed on <checks>,
 * you regain a Mythic Point." Pure table and matcher, keyed by the Calling slug (PF2e `system.slug`, the
 * sluggified name). Conditions the system cannot see (a library, dream subjects, a wild animal, your words)
 * are marked `needsGM` so the card tells the GM to decide. Unknown or homebrew Callings never match.
 */

export interface RegainTrigger {
  /** PF2e action slugs; a check matches when its roll options contain `action:<slug>`. */
  actions: string[];
  /** Allowed check statistics (`check:statistic:<slug>`). Omitted = any. */
  statistics?: string[];
  /** The target must be an enemy (hostile / opponent). Unknown target = GM decides. */
  enemy?: boolean;
  /** The target must not be an ally. Unknown target = GM decides. */
  notAlly?: boolean;
  /** Only during an encounter. */
  inCombat?: boolean;
  /** The text has a condition the module can't verify: the GM decides. */
  needsGM?: boolean;
  /** i18n key suffix (automation.regain.gm.<key>) explaining what the GM must check. */
  gmNote?: string;
}

export const CALLING_REGAIN: Readonly<Record<string, RegainTrigger[]>> = {
  "acrobats-calling": [
    {
      actions: ["balance", "tumble-through", "maneuver-in-flight"],
      statistics: ["acrobatics"],
      inCombat: true,
    },
  ],
  "runelords-calling": [
    { actions: ["identify-magic"], statistics: ["arcana", "nature", "occultism", "religion"] },
  ],
  "artisans-calling": [{ actions: ["repair"] }],
  "sagas-calling": [{ actions: ["gather-information"] }],
  "thespians-calling": [{ actions: ["perform"] }],
  "doomsayers-calling": [{ actions: ["repair", "administer-first-aid"] }],
  "dreamers-calling": [
    { actions: ["craft"] },
    { actions: ["recall-knowledge"], needsGM: true, gmNote: "dreams" },
  ],
  "echoes-of-the-scrolls": [{ actions: ["decipher-writing", "gather-information", "recall-knowledge"] }],
  "guardians-calling": [{ actions: ["disarm", "reposition", "shove"], enemy: true }],
  "sages-calling": [{ actions: ["recall-knowledge"], enemy: true }],
  "bookkeepers-calling": [{ actions: ["recall-knowledge"], needsGM: true, gmNote: "library" }],
  "thiefs-calling": [{ actions: ["pick-a-lock"] }, { actions: ["steal"], enemy: true }],
  "echoes-of-the-spells": [
    {
      actions: ["identify-magic", "recall-knowledge", "trick-magic-item"],
      needsGM: true,
      gmNote: "tradition",
    },
  ],
  "echoes-of-the-swords": [
    {
      actions: ["climb", "force-open", "high-jump", "long-jump", "swim"],
      statistics: ["athletics"],
    },
  ],
  "handlers-calling": [
    { actions: ["make-an-impression"], needsGM: true, gmNote: "wildAnimal" },
    { actions: ["command-an-animal"], needsGM: true, gmNote: "notCompanion" },
  ],
  "demagogues-calling": [
    { actions: ["coerce"], notAlly: true },
    { actions: ["create-a-diversion"], needsGM: true, gmNote: "words" },
    { actions: ["make-an-impression"], needsGM: true, gmNote: "audience" },
  ],
  "caretakers-calling": [{ actions: ["treat-wounds"] }],
  "hunters-calling": [{ actions: ["seek", "track"], enemy: true }],
};

export interface RegainContext {
  outcome: string | null | undefined;
  rollOptions: string[];
  /** null when the check had no target (or it can't be resolved). */
  targetIsEnemy: boolean | null;
  targetIsAlly?: boolean | null;
  inCombat: boolean;
}

export interface RegainMatch {
  /** The action slug that matched. */
  action: string;
  needsGM: boolean;
  /** Reason key for the GM note (`automation.regain.gm.<key>`), or null. */
  gmNote: string | null;
}

/** PF2e-style slug of a name: "Sage's Calling" -> "sages-calling". */
export function callingSlug(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function hasRegainEntry(slug: string | null | undefined): boolean {
  return !!slug && Object.prototype.hasOwnProperty.call(CALLING_REGAIN, slug);
}

function hasAction(options: Set<string>, all: string[], slug: string): boolean {
  if (options.has(`action:${slug}`)) return true;
  return all.some((o) => o.startsWith(`action:${slug}:`));
}

/** Does this check trigger the Calling's daily regain? null = no. */
export function regainMatches(callingSlugValue: string, ctx: RegainContext): RegainMatch | null {
  if (ctx.outcome !== "criticalSuccess") return null;
  if (!hasRegainEntry(callingSlugValue)) return null;
  const all = ctx.rollOptions ?? [];
  const options = new Set(all);
  const statistics = all
    .filter((o) => o.startsWith("check:statistic:") && !o.startsWith("check:statistic:base:"))
    .map((o) => o.slice("check:statistic:".length));
  const inCombat = ctx.inCombat || options.has("encounter");

  for (const trigger of CALLING_REGAIN[callingSlugValue]!) {
    const action = trigger.actions.find((a) => hasAction(options, all, a));
    if (!action) continue;
    if (trigger.statistics && statistics.length > 0) {
      if (!statistics.some((s) => trigger.statistics!.includes(s))) continue;
    }
    if (trigger.inCombat && !inCombat) continue;
    let needsGM = !!trigger.needsGM;
    let gmNote = trigger.gmNote ?? null;
    if (trigger.enemy) {
      if (ctx.targetIsEnemy === false) continue;
      if (ctx.targetIsEnemy == null) {
        needsGM = true;
        gmNote ??= "enemy";
      }
    }
    if (trigger.notAlly) {
      const ally = ctx.targetIsAlly ?? null;
      if (ally === true) continue;
      if (ally == null) {
        needsGM = true;
        gmNote ??= "notAlly";
      }
    }
    return { action, needsGM, gmNote };
  }
  return null;
}

/**
 * Key of an in-world day. Uses the PF2e world clock's ISO date when available (YYYY-MM-DD), otherwise the
 * day number since the world clock's epoch.
 */
export function worldDateKey(isoDate: string | null | undefined, worldTime: number): string {
  if (typeof isoDate === "string" && /^-?\d{4,}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  return `day-${Math.floor((Number(worldTime) || 0) / 86400)}`;
}
