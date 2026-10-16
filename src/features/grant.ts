/** OWNER: agent A. Feature "grant". `register` runs at init, `ready` at ready. */
import type { Feature } from "./types.js";

export const feature: Feature = {
  id: "grant",
  register() {},
};
