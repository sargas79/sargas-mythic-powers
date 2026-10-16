/**
 * OWNER: agent F. Feature "progression": on Start Session, releases late-start catch-up slots and raises one
 * held-back mythic tier for every active mythic character. `register` runs at init.
 */
import { HOOKS } from "../constants.js";
import { notify } from "../foundry/i18n.js";
import { getState, isMythicActive } from "../state/flags.js";
import { mythicTier } from "../state/actor-mythic.js";
import { sessionStartPlan } from "../rules/progression-text.js";
import { raiseTier, releaseLateStart } from "../services/progression-service.js";
import type { Feature } from "./types.js";

async function onSessionStart(session: number): Promise<void> {
  // The hook fires only on the GM client that started the session, so a GM check is enough here.
  if (!game.user?.isGM) return;
  const actors: ActorPF2e[] = (game.actors?.contents ?? []).filter((a: ActorPF2e) => isMythicActive(a));
  for (const actor of actors) {
    try {
      const state = getState(actor);
      const plan = sessionStartPlan({
        progression: state.progression,
        session,
        grantedLevel: state.grantedLevel,
        lateStart: state.lateStart,
        trials: state.trials,
        tier: mythicTier(actor),
      });
      if (plan.releaseLateStart) await releaseLateStart(actor);
      if (plan.raiseTierTo !== null) await raiseTier(actor, plan.raiseTierTo, session);
    } catch (error) {
      notify.error("progression.notify.sessionError", { name: actor.name }, error);
    }
  }
}

export const feature: Feature = {
  id: "progression",
  register() {
    Hooks.on(HOOKS.sessionStart, (session: number) => void onSessionStart(Number(session)));
  },
};
