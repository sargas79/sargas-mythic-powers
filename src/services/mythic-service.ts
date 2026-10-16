/**
 * OWNER: agent A (M1 GM side). Grant / enable / disable / revoke mythic power for one character. GM only.
 */
import type { Progression } from "../rules/progression.js";

export interface GrantOptions {
  source: string;
  progression: Progression;
  callingChoice: "player" | "gm";
  /** Compendium UUID of the Calling when the GM assigns it. */
  callingUuid?: string | null;
  startWithFullPoints: boolean;
  announce: boolean;
}

export async function grantMythic(_actor: ActorPF2e, _options: GrantOptions): Promise<void> {
  throw new Error("not implemented");
}
export async function enableMythic(_actor: ActorPF2e): Promise<void> {
  throw new Error("not implemented");
}
export async function disableMythic(_actor: ActorPF2e): Promise<void> {
  throw new Error("not implemented");
}
export async function revokeMythic(
  _actor: ActorPF2e,
  _options: { confirm?: boolean } = {},
): Promise<boolean> {
  throw new Error("not implemented");
}
/** Opens the Grant Mythic Power dialog (GM only). */
export async function openGrantDialog(_actor: ActorPF2e): Promise<void> {
  throw new Error("not implemented");
}
