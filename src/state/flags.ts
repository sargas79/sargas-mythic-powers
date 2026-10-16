/**
 * The module's actor state, stored as one object at flags["sargas-mythic-powers"].state.
 * `isMythicActive(actor)` is the single test every feature uses to decide whether anything mythic is shown.
 * Only GMs may write this flag (enforced in preUpdateActor); players go through GM socket actions.
 */
import { FLAG_KEY, HOOKS, MODULE_ID } from "../constants.js";
import type { Progression } from "../rules/progression.js";

export interface PendingFeat {
  id: string;
  uuid: string;
  name: string;
  slotId: string;
  userId: string;
  requestedAt: number;
}

export interface SuspendedState {
  /** Full item source data (toObject()) of the Calling, mythic and destiny feats and their grants. */
  items: Record<string, unknown>[];
  points: number;
  tier: number | null;
  at: number;
}

export interface MythicState {
  granted: boolean;
  enabled: boolean;
  source: string;
  progression: Progression;
  callingChoice: "player" | "gm";
  grantedAt: number | null;
  /** Character level at grant time (late start catch-up). */
  grantedLevel: number;
  lateStart: { released: number; lastReleaseSession: number | null };
  trials: { count: number; log: { at: number; note: string }[]; lastTierUpSession: number | null };
  /** World date key (YYYY-MM-DD from the world clock) of the last Calling daily regain. */
  dailyRegain: { lastDate: string | null };
  pending: PendingFeat[];
  suspended: SuspendedState | null;
}

export function defaultState(): MythicState {
  return {
    granted: false,
    enabled: false,
    source: "",
    progression: "standard",
    callingChoice: "player",
    grantedAt: null,
    grantedLevel: 1,
    lateStart: { released: 0, lastReleaseSession: null },
    trials: { count: 0, log: [], lastTierUpSession: null },
    dailyRegain: { lastDate: null },
    pending: [],
    suspended: null,
  };
}

/** Read state merged over defaults (missing fields from older versions are filled in). */
export function getState(actor: ActorPF2e): MythicState {
  const raw = actor?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? {};
  const d = defaultState();
  return {
    ...d,
    ...raw,
    lateStart: { ...d.lateStart, ...(raw.lateStart ?? {}) },
    trials: { ...d.trials, ...(raw.trials ?? {}) },
    dailyRegain: { ...d.dailyRegain, ...(raw.dailyRegain ?? {}) },
    pending: Array.isArray(raw.pending) ? raw.pending : [],
    suspended: raw.suspended ?? null,
  };
}

export function isCharacter(actor: ActorPF2e): boolean {
  return actor?.type === "character";
}

/** Granted and enabled: the only state in which anything mythic is shown for this actor. */
export function isMythicActive(actor: ActorPF2e): boolean {
  if (!isCharacter(actor)) return false;
  const s = getState(actor);
  return s.granted && s.enabled;
}

/** Granted (enabled or disabled). */
export function isGranted(actor: ActorPF2e): boolean {
  return isCharacter(actor) && getState(actor).granted;
}

/** True if the user owns at least one character with active mythic power. */
export function userHasActiveMythic(user: UserDoc = game.user): boolean {
  if (user?.isGM) return true;
  return (game.actors?.contents ?? []).some(
    (a: ActorPF2e) => isMythicActive(a) && a.testUserPermission(user, "OWNER"),
  );
}

/** GM only. Shallow-merges `patch` into the state and writes the whole object. */
export async function setState(actor: ActorPF2e, patch: Partial<MythicState>): Promise<MythicState> {
  if (!game.user.isGM) throw new Error(`${MODULE_ID} | only a GM can change mythic state`);
  const next = { ...getState(actor), ...patch };
  // ForcedReplacement replaces only this key; `recursive: false` would replace the whole `flags` root in v14.
  const replace = foundry.data.operators.ForcedReplacement.create(next);
  await actor.update({ [`flags.${MODULE_ID}.${FLAG_KEY}`]: replace }, { diff: false });
  Hooks.callAll(HOOKS.stateChanged, actor, next);
  return next;
}

/** GM only. Removes all module flags from the actor. */
export async function clearState(actor: ActorPF2e): Promise<void> {
  if (!game.user.isGM) throw new Error(`${MODULE_ID} | only a GM can change mythic state`);
  await actor.update({ [`flags.${MODULE_ID}`]: foundry.data.operators.ForcedDeletion.create() });
  Hooks.callAll(HOOKS.stateChanged, actor, defaultState());
}

/** Blocks non-GM writes to this module's actor flags. */
export function registerFlagGuard(): void {
  Hooks.on(
    "preUpdateActor",
    (_actor: ActorPF2e, changes: Record<string, unknown>, _o: unknown, userId: string) => {
      const user = game.users?.get(userId);
      if (user?.isGM) return true;
      const flat = foundry.utils.flattenObject(changes ?? {});
      const touches = Object.keys(flat).some(
        (k) => k.startsWith(`flags.${MODULE_ID}`) || k.startsWith(`flags.-=${MODULE_ID}`),
      );
      if (touches) {
        console.warn(`${MODULE_ID} | blocked a non-GM change to mythic state`);
        return false;
      }
      return true;
    },
  );
}
