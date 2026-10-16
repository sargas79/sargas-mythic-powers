/**
 * Public API at game.modules.get("sargas-mythic-powers").api, for macros and other modules.
 */
import { openCallingPicker } from "./apps/calling-picker.js";
import { openFeatPicker } from "./apps/feat-picker.js";
import { openMythicConsole } from "./apps/mythic-console.js";
import {
  disableMythic,
  enableMythic,
  grantMythic,
  openGrantDialog,
  revokeMythic,
} from "./services/mythic-service.js";
import { awardDeed, awardKill, changePoints, startSession } from "./services/points.js";
import { logTrial, releaseLateStart } from "./services/progression-service.js";
import { getState, isGranted, isMythicActive } from "./state/flags.js";

export function createApi() {
  return {
    getState,
    isGranted,
    isMythicActive,
    grantMythic,
    enableMythic,
    disableMythic,
    revokeMythic,
    openGrantDialog,
    openCallingPicker,
    openFeatPicker,
    openMythicConsole,
    changePoints,
    startSession,
    awardDeed,
    awardKill,
    logTrial,
    releaseLateStart,
  };
}
