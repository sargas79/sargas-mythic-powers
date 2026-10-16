export interface Feature {
  id: string;
  /** Runs during `init`: register hooks, settings-independent wiring, GM socket actions. */
  register(): void;
  /** Runs during `ready` (game data available). */
  ready?(): void | Promise<void>;
}
