/**
 * GM executor over the module socket. Players request actions that touch documents they don't own (or that
 * must be GM-only, like grant state); the active GM runs them.
 *
 *   registerGMAction("awardPoints", async (payload, userId) => { ... });
 *   await runAsGM("awardPoints", { ... });   // runs locally when the caller is the GM
 */
import { SOCKET_NAME } from "../constants.js";
import { log, notify } from "./i18n.js";

type Handler = (payload: any, userId: string) => Promise<void> | void; // eslint-disable-line @typescript-eslint/no-explicit-any

const handlers = new Map<string, Handler>();

export function registerGMAction(name: string, handler: Handler): void {
  if (handlers.has(name)) throw new Error(`GM action already registered: ${name}`);
  handlers.set(name, handler);
}

/** True on exactly one connected client: the active GM. */
export function isActiveGM(): boolean {
  return !!game.user?.isGM && (game.users?.activeGM?.isSelf ?? game.user.isGM);
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
  game.socket.emit(SOCKET_NAME, { action: name, payload, userId: game.user.id });
  return true;
}

export function registerSocket(): void {
  game.socket.on(SOCKET_NAME, async (message: { action: string; payload: unknown; userId: string }) => {
    if (!isActiveGM()) return;
    const handler = handlers.get(message?.action);
    if (!handler) return;
    try {
      log("socket", message.action, message.userId);
      await handler(message.payload, message.userId);
    } catch (error) {
      notify.error("errors.socket", { action: message.action }, error);
    }
  });
}
