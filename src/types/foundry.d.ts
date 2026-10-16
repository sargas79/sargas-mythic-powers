/**
 * Loose ambient declarations for the Foundry VTT 14 / PF2e 8.5 globals this module uses.
 * Foundry and PF2e ship no usable types for a module build, so these are typed as `any` on purpose;
 * keep Foundry access inside src/foundry, src/state, src/services, src/features and src/apps.
 * src/rules must stay free of these globals so it can be unit tested in Node.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  const game: any;
  const ui: any;
  const Hooks: any;
  const CONFIG: any;
  const foundry: any;
  const ChatMessage: any;
  const Actor: any;
  const Item: any;
  function fromUuid(uuid: string): Promise<any>;
  function fromUuidSync(uuid: string): any;

  /** Minimal shapes used in signatures. */
  type ActorPF2e = any;
  type ItemPF2e = any;
  type UserDoc = any;
}
export {};
