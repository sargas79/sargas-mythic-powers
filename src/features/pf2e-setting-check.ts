/**
 * OWNER: agent A. Feature "pf2e-setting-check": on ready, the active GM is offered to switch on PF2e's
 * "Mythic Rules" setting when it is disabled, and warned when trial-based grants run without the
 * Alternate Mythic Progression (variant-tiers) mode. Players never see any of it.
 */
import { PF2E } from "../constants.js";
import { notify, t } from "../foundry/i18n.js";
import { getPf2eMythicMode } from "../foundry/settings.js";
import { gmElectionSettled, isActiveGM } from "../foundry/socket.js";
import { getState, isCharacter } from "../state/flags.js";
import type { Feature } from "./types.js";

function trialActors(): ActorPF2e[] {
  return (game.actors?.contents ?? []).filter((a: ActorPF2e) => {
    if (!isCharacter(a)) return false;
    const s = getState(a);
    return s.granted && s.progression === "trials";
  });
}

async function offerEnable(usesTrials: boolean): Promise<void> {
  const mode = usesTrials ? "variant-tiers" : "enabled";
  const content = [
    `<p>${t("settingCheck.content")}</p>`,
    `<p>${t("settingCheck.hidden")}</p>`,
    usesTrials ? `<p>${t("settingCheck.trials")}</p>` : "",
  ].join("");
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: t("settingCheck.title"), icon: "fa-solid fa-star" },
    content,
    rejectClose: false,
    buttons: [
      { action: "enable", label: t("settingCheck.enable"), icon: "fa-solid fa-check", default: true },
      { action: "later", label: t("settingCheck.later"), icon: "fa-solid fa-xmark" },
    ],
  });
  if (choice !== "enable") return;
  await game.settings.set("pf2e", PF2E.settingMythic, mode);
  notify.info("settingCheck.enabled");
}

async function checkSetting(): Promise<void> {
  if (!isActiveGM()) return;
  const mode = getPf2eMythicMode();
  const trials = trialActors();
  if (mode === "disabled") {
    await offerEnable(trials.length > 0);
    return;
  }
  if (trials.length && mode !== "variant-tiers") {
    ui.notifications?.warn(t("settingCheck.trialsWarning", { names: trials.map((a) => a.name).join(", ") }), {
      permanent: true,
    });
  }
}

export const feature: Feature = {
  id: "pf2e-setting-check",
  register() {},
  ready() {
    // Wait for the GM clients to elect one, without holding up the other features' ready.
    if (game.user.isGM) void gmElectionSettled().then(checkSetting);
  },
};
