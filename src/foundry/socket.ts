/**
 * GM executor over the module socket. Players request actions that touch documents they don't own (or that
 * must be GM-only, like grant state); the active GM runs them.
 *
 *   registerGMAction("awardPoints", async (payload, userId) => { ... });
 *   await runAsGM("awardPoints", { ... });   // runs locally when the caller is the GM
 *
 * GM-only hooks that fire on every client go through `onceAsActiveGM(key, fn)` so one GM client runs them,
 * even when the GM user has several tabs open (see rules/gm-election).
 */
import { SOCKET_NAME } from "../constants.js";
import {
  GMElection,
  HEARTBEAT_MS,
  CLAIM_VERIFY_MS,
  SETTLE_MS,
  claimDelay,
  type ElectionMessage,
} from "../rules/gm-election.js";
import { log, notify } from "./i18n.js";

type Handler = (payload: any, userId: string) => Promise<void> | void; // eslint-disable-line @typescript-eslint/no-explicit-any

const handlers = new Map<string, Handler>();

export function registerGMAction(name: string, handler: Handler): void {
  if (handlers.has(name)) throw new Error(`GM action already registered: ${name}`);
  handlers.set(name, handler);
}

let election: GMElection | null = null;

function activeGMUserId(): string {
  return game.users?.activeGM?.id ?? game.user.id;
}

/**
 * True on one connected client: the oldest live client of the active GM user. A GM user with two tabs open
 * is one `activeGM` but two clients, so the GM clients elect one between them. Use `onceAsActiveGM` for
 * actions that must not be lost when that client has just closed.
 */
export function isActiveGM(): boolean {
  if (!game.user?.isGM) return false;
  if (!election) return game.users?.activeGM?.isSelf ?? true;
  return election.isLeader(activeGMUserId(), Date.now());
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` on exactly one client of the active GM user for this `key`, which must be the same on every
 * client (a document id, a request id). The leader claims the key and runs at once; followers wait their
 * turn and run only if no claim arrived, which covers a leader tab that closed without a word.
 */
export async function onceAsActiveGM(key: string, fn: () => unknown): Promise<void> {
  if (!game.user?.isGM) return;
  if (!election) {
    if (isActiveGM()) await fn();
    return;
  }
  const rank = election.rank(activeGMUserId(), Date.now());
  if (rank < 0) return;
  if (rank === 0) {
    if (election.isClaimed(key, Date.now())) return;
    emitElection(election.claim(key, Date.now()));
    await fn();
    return;
  }
  await sleep(claimDelay(rank));
  if (election.isClaimed(key, Date.now())) return;
  emitElection(election.claim(key, Date.now()));
  await sleep(CLAIM_VERIFY_MS);
  if (!election.wonClaim(key, Date.now())) return;
  log("gm election: no claim from the clients ahead, taking over", key);
  election.takeOver(activeGMUserId(), Date.now());
  await fn();
}

/** Resolves once this client's election has settled, so a ready-time `isActiveGM()` check is meaningful. */
export function gmElectionSettled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, election ? SETTLE_MS + 100 : 0));
}

function emitElection(message: ElectionMessage): void {
  game.socket.emit(SOCKET_NAME, { election: message });
}

function startElection(): void {
  if (!game.user.isGM) return;
  const now = Date.now();
  election = new GMElection(
    { clientId: foundry.utils.randomID(16), userId: game.user.id, startedAt: now },
    now,
  );
  emitElection(election.hello(true));
  setInterval(() => emitElection(election!.hello()), HEARTBEAT_MS);
  window.addEventListener("pagehide", () => emitElection(election!.bye()));
  log("gm election joined", election.self.clientId);
}

export async function runAsGM(name: string, payload: unknown = {}): Promise<boolean> {
  if (!handlers.has(name)) throw new Error(`Unknown GM action: ${name}`);
  if (game.user.isGM) {
    await handlers.get(name)!(payload, game.user.id);
    return true;
  }
  if (!game.users?.activeGM) {
    notify.warn("errors.noGM");
    return false;
  }
  const requestId = foundry.utils.randomID();
  game.socket.emit(SOCKET_NAME, { action: name, payload, userId: game.user.id, requestId });
  return true;
}

export function registerSocket(): void {
  game.socket.on(
    SOCKET_NAME,
    async (message: {
      action: string;
      payload: unknown;
      userId: string;
      requestId?: string;
      election?: ElectionMessage;
    }) => {
      if (message?.election) {
        const reply = election?.receive(message.election, Date.now());
        if (reply) emitElection(reply);
        return;
      }
      const handler = handlers.get(message?.action);
      if (!handler) return;
      try {
        const run = () => {
          log("socket", message.action, message.userId);
          return handler(message.payload, message.userId);
        };
        if (message.requestId) await onceAsActiveGM(`request:${message.requestId}`, run);
        else if (isActiveGM()) await run();
      } catch (error) {
        notify.error("errors.socket", { action: message.action }, error);
      }
    },
  );
  startElection();
}
