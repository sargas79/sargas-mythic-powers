/**
 * GM ledger of every mythic change (points, grants, toggles, trials, death). Stored in a hidden world
 * setting, newest first, capped at LEDGER_LIMIT. Only the GM writes it; players' actions reach it through
 * GM socket actions.
 */
import { HOOKS, MODULE_ID } from "../constants.js";
import { getSetting, setSetting } from "./settings.js";

export const LEDGER_LIMIT = 200;

export type LedgerKind =
  | "grant"
  | "enable"
  | "disable"
  | "revoke"
  | "calling"
  | "feat"
  | "points"
  | "session"
  | "trial"
  | "tier"
  | "lateStart"
  | "death"
  | "heroPoint";

export interface LedgerEntry {
  id: string;
  at: number;
  kind: LedgerKind;
  actorUuid: string | null;
  actorName: string | null;
  /** Already-localized, human-readable line. */
  message: string;
  /** For points entries: values before/after so the GM can undo. */
  pointsBefore?: number;
  pointsAfter?: number;
  /** For death entries: doomed/dying before so the GM can undo. */
  undo?: Record<string, unknown>;
  undone?: boolean;
}

export async function appendLedger(entry: Omit<LedgerEntry, "id" | "at">): Promise<LedgerEntry> {
  const full: LedgerEntry = { id: foundry.utils.randomID(), at: Date.now(), ...entry };
  if (!game.user.isGM) return full;
  const list = [full, ...getLedger()].slice(0, LEDGER_LIMIT);
  await setSetting("ledger", list);
  Hooks.callAll(`${MODULE_ID}.ledger`, full);
  return full;
}

export function getLedger(): LedgerEntry[] {
  return [...(getSetting("ledger") ?? [])];
}

export async function markUndone(id: string): Promise<void> {
  const list = getLedger().map((e) => (e.id === id ? { ...e, undone: true } : e));
  await setSetting("ledger", list);
}

export { HOOKS };
