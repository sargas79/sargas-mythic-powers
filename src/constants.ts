export const MODULE_ID = "sargas-mythic-powers";
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const TEMPLATE_PATH = `modules/${MODULE_ID}/templates`;

/** Key of the single actor flag object: flags["sargas-mythic-powers"].state */
export const FLAG_KEY = "state";

export const SETTINGS = {
  /** "owners" | "none": who receives the grant / enable card (always plus GMs). */
  announce: "announce",
  gmApproval: "gmApproval",
  killPrompt: "killPrompt",
  regainPrompt: "regainPrompt",
  mythicDeath: "mythicDeath",
  heroPointsMixed: "heroPointsMixed",
  /** string[] of publication titles allowed in the Calling picker. Empty = all. */
  callingSources: "callingSources",
  lateStartPerSession: "lateStartPerSession",
  /** Hidden: number, incremented by Start Session. */
  session: "session",
  /** Hidden: timestamp of the last Start Session. */
  sessionStartedAt: "sessionStartedAt",
  /** Hidden: LedgerEntry[] (newest first, capped). */
  ledger: "ledger",
} as const;

/** PF2e feat group and slot ids (pf2e 8.5.1, CharacterFeats). */
export const PF2E = {
  settingMythic: "mythic",
  featGroup: "mythic",
  callingSlot: "mythic-calling",
  destinySlot: "mythic-12",
  /** Item traits that mark mythic content. */
  mythicTraits: ["mythic", "calling", "destiny"],
  callingCategory: "calling",
  callingsPack: "pf2e.classfeatures",
  featsPack: "pf2e.feats-srd",
  mythicPointsResource: "mythic-points",
} as const;

/** Module hook names other features can listen to. */
export const HOOKS = {
  /** (session: number) after the GM starts a session. */
  sessionStart: `${MODULE_ID}.sessionStart`,
  /** (actor, state) after grant / enable / disable / revoke or any flag change. */
  stateChanged: `${MODULE_ID}.stateChanged`,
} as const;
