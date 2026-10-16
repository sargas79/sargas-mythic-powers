/**
 * World settings. Every visible setting is GM-only (scope "world", restricted). Hiding mythic content from
 * characters without an active grant is not a setting: it is always on.
 */
import { MODULE_ID, PF2E, SETTINGS } from "../constants.js";
import type { LedgerEntry } from "./ledger.js";

export interface SettingTypes {
  announce: "owners" | "none";
  gmApproval: boolean;
  killPrompt: boolean;
  regainPrompt: boolean;
  mythicDeath: boolean;
  heroPointsMixed: boolean;
  callingSources: string[];
  lateStartPerSession: number;
  session: number;
  sessionStartedAt: number;
  ledger: LedgerEntry[];
}

export const DEFAULT_CALLING_SOURCES = ["Pathfinder War of Immortals"];

export function registerSettings(): void {
  const reg = (key: string, data: Record<string, unknown>) =>
    game.settings.register(MODULE_ID, key, { scope: "world", restricted: true, ...data });

  reg(SETTINGS.announce, {
    name: `${MODULE_ID}.settings.announce.name`,
    hint: `${MODULE_ID}.settings.announce.hint`,
    config: true,
    type: String,
    choices: {
      owners: `${MODULE_ID}.settings.announce.owners`,
      none: `${MODULE_ID}.settings.announce.none`,
    },
    default: "owners",
  });
  const bool = (key: string, def: boolean) =>
    reg(key, {
      name: `${MODULE_ID}.settings.${key}.name`,
      hint: `${MODULE_ID}.settings.${key}.hint`,
      config: true,
      type: Boolean,
      default: def,
    });
  bool(SETTINGS.gmApproval, false);
  bool(SETTINGS.killPrompt, true);
  bool(SETTINGS.regainPrompt, true);
  bool(SETTINGS.mythicDeath, false);
  bool(SETTINGS.heroPointsMixed, false);
  reg(SETTINGS.lateStartPerSession, {
    name: `${MODULE_ID}.settings.lateStartPerSession.name`,
    hint: `${MODULE_ID}.settings.lateStartPerSession.hint`,
    config: true,
    type: Number,
    range: { min: 1, max: 5, step: 1 },
    default: 1,
  });
  // Edited from the Calling sources menu inside the Mythic Console, not the settings form.
  reg(SETTINGS.callingSources, { config: false, type: Array, default: DEFAULT_CALLING_SOURCES });
  reg(SETTINGS.session, { config: false, type: Number, default: 0 });
  reg(SETTINGS.sessionStartedAt, { config: false, type: Number, default: 0 });
  reg(SETTINGS.ledger, { config: false, type: Array, default: [] });
}

export function getSetting<K extends keyof SettingTypes>(key: K): SettingTypes[K] {
  return game.settings.get(MODULE_ID, key) as SettingTypes[K];
}

export async function setSetting<K extends keyof SettingTypes>(
  key: K,
  value: SettingTypes[K],
): Promise<void> {
  await game.settings.set(MODULE_ID, key, value);
}

/** PF2e's own world setting: "disabled" | "enabled" | "variant-tiers". */
export function getPf2eMythicMode(): "disabled" | "enabled" | "variant-tiers" {
  try {
    return game.settings.get("pf2e", PF2E.settingMythic) ?? "disabled";
  } catch {
    return "disabled";
  }
}
