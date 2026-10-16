/** OWNER: agent B. Feature "visibility". `register` runs at init, `ready` at ready. */
import type { Feature } from "./types.js";

export const feature: Feature = {
  id: "visibility",
  register() {},
};
