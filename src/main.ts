/**
 * Module entry point. Registers settings, the flag guard, the GM socket and every feature once.
 */
import { MODULE_ID } from "./constants.js";
import { FEATURES } from "./features/index.js";
import { log } from "./foundry/i18n.js";
import { registerSettings } from "./foundry/settings.js";
import { registerSocket } from "./foundry/socket.js";
import { registerFlagGuard } from "./state/flags.js";
import { createApi } from "./api.js";

let initialized = false;

Hooks.once("init", () => {
  if (initialized) return;
  initialized = true;
  if (game.system?.id !== "pf2e") {
    console.warn(`${MODULE_ID} | This module requires the PF2e system and is inactive.`);
    return;
  }
  registerSettings();
  registerFlagGuard();
  for (const feature of FEATURES) {
    try {
      feature.register();
    } catch (error) {
      console.error(`${MODULE_ID} | feature ${feature.id} failed to register`, error);
    }
  }
  log("initialized");
});

Hooks.once("ready", async () => {
  if (game.system?.id !== "pf2e") return;
  registerSocket();
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = createApi();
  for (const feature of FEATURES) {
    try {
      await feature.ready?.();
    } catch (error) {
      console.error(`${MODULE_ID} | feature ${feature.id} failed on ready`, error);
    }
  }
  log("ready");
});
