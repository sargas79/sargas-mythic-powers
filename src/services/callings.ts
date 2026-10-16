/**
 * OWNER: agent B (M1 player side). Loads Callings from the PF2e compendium and assigns one to an actor.
 */
export interface CallingInfo {
  uuid: string;
  name: string;
  img: string;
  source: string;
  /** Plain-text summary of the actions that use mythic proficiency. */
  actions: string;
  /** Plain text of the daily regain sentence. */
  regain: string;
  edicts: string;
  anathema: string;
  /** Enriched HTML description. */
  description: string;
}

export async function loadCallings(_options: { allSources?: boolean } = {}): Promise<CallingInfo[]> {
  throw new Error("not implemented");
}

/** Adds the Calling to the "mythic-calling" slot. Owner or GM. */
export async function assignCalling(_actor: ActorPF2e, _uuid: string): Promise<void> {
  throw new Error("not implemented");
}
