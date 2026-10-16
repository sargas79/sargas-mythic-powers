/** OWNER: agent C. Feature "approval". `register` runs at init, `ready` at ready. */
import type { Feature } from "./types.js";

export const feature: Feature = {
  id: "approval",
  register() {},
};
