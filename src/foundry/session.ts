/** Game-session counter, advanced by the GM's Start Session button in the Mythic Console. */
import { HOOKS } from "../constants.js";
import { getSetting, setSetting } from "./settings.js";

export function currentSession(): number {
  return getSetting("session") ?? 0;
}

export function sessionStartedAt(): number {
  return getSetting("sessionStartedAt") ?? 0;
}

/** GM only. Increments the counter and fires `sargas-mythic-powers.sessionStart` (session number). */
export async function advanceSession(): Promise<number> {
  const next = currentSession() + 1;
  await setSetting("session", next);
  await setSetting("sessionStartedAt", Date.now());
  Hooks.callAll(HOOKS.sessionStart, next);
  return next;
}
