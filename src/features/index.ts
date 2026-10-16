import type { Feature } from "./types.js";
import { feature as grant } from "./grant.js";
import { feature as pf2e_setting_check } from "./pf2e-setting-check.js";
import { feature as visibility } from "./visibility.js";
import { feature as sheet_banner } from "./sheet-banner.js";
import { feature as compendium_filter } from "./compendium-filter.js";
import { feature as approval } from "./approval.js";
import { feature as console_launcher } from "./console-launcher.js";
import { feature as hero_points } from "./hero-points.js";
import { feature as mythic_kill } from "./mythic-kill.js";
import { feature as daily_regain } from "./daily-regain.js";
import { feature as mythic_death } from "./mythic-death.js";
import { feature as progression } from "./progression.js";

/** Every feature, in registration order. */
export const FEATURES: Feature[] = [
  grant,
  pf2e_setting_check,
  visibility,
  sheet_banner,
  compendium_filter,
  approval,
  console_launcher,
  hero_points,
  mythic_kill,
  daily_regain,
  mythic_death,
  progression,
];
