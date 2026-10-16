/**
 * Pure election among the browser clients of the active GM user. Foundry's `activeGM` is a user, and one
 * user can have several clients connected (a leftover tab, a second monitor), so "am I the active GM?" is
 * true on all of them. Each GM client announces itself over the module socket and the oldest live client of
 * the active GM user acts.
 *
 * A closing tab cannot say goodbye (the socket is gone before `pagehide` runs), so every action also has a
 * key. The leader claims the key over the socket before acting. A follower of rank k waits k × CLAIM_WAIT_MS
 * and, when nobody claimed the key, claims it too, waits CLAIM_VERIFY_MS for rival claims and acts only if
 * it is the oldest claimant. Two followers can share a rank (one of them may still count a closed tab as
 * alive), and the verify step makes exactly one of them act. No Foundry globals: time is passed in.
 */

/** How often a GM client re-announces itself. */
export const HEARTBEAT_MS = 30_000;
/** A peer not heard from for this long is gone. Background tabs may only fire timers once a minute. */
export const PEER_TTL_MS = 130_000;
/** A new client waits this long for older peers to answer its hello before it may act. */
export const SETTLE_MS = 2_000;
/** How long each follower rank waits for a claim before acting itself. */
export const CLAIM_WAIT_MS = 3_000;
/** How long a follower that claimed a key waits for rival claims before acting. */
export const CLAIM_VERIFY_MS = 500;
/** Claims older than this are forgotten. */
export const CLAIM_TTL_MS = 10 * 60_000;

export interface GMClient {
  clientId: string;
  userId: string;
  /** When the client started (its own clock). Older clients win. */
  startedAt: number;
}

export type ElectionMessage =
  | ({ type: "hello"; probe?: boolean } & GMClient)
  | ({ type: "claim"; key: string } & GMClient)
  | { type: "bye"; clientId: string };

/** Total order on clients: earliest start first, client id breaks ties. Same answer on every client. */
export function compareClients(a: GMClient, b: GMClient): number {
  if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
  return a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0;
}

/** How long a client of `rank` waits for a claim before acting. Rank 0 acts at once. */
export function claimDelay(rank: number): number {
  return Math.max(0, rank) * CLAIM_WAIT_MS;
}

export class GMElection {
  private readonly peers = new Map<string, GMClient & { lastSeen: number }>();
  private readonly claims = new Map<string, { at: number; claimants: GMClient[] }>();

  constructor(
    readonly self: GMClient,
    /** Local time the client joined the election; it may act from SETTLE_MS later. */
    private readonly joinedAt: number,
  ) {}

  /** The hello this client sends; `probe` asks every peer to answer at once. */
  hello(probe = false): ElectionMessage {
    return { type: "hello", ...this.self, ...(probe ? { probe: true } : {}) };
  }

  bye(): ElectionMessage {
    return { type: "bye", clientId: this.self.clientId };
  }

  /** Records that this client claims `key` and returns the claim to broadcast. */
  claim(key: string, now: number): ElectionMessage {
    this.addClaim(key, this.self, now);
    return { type: "claim", key, ...this.self };
  }

  /** True when some client has claimed `key`. */
  isClaimed(key: string, now: number): boolean {
    this.pruneClaims(now);
    return this.claims.has(key);
  }

  /** True when this client is the oldest of the clients that claimed `key`. */
  wonClaim(key: string, now: number): boolean {
    this.pruneClaims(now);
    const claimants = this.claims.get(key)?.claimants ?? [];
    return [...claimants].sort(compareClients)[0]?.clientId === this.self.clientId;
  }

  private addClaim(key: string, client: GMClient, now: number): void {
    const entry = this.claims.get(key) ?? { at: now, claimants: [] };
    if (!entry.claimants.some((c) => c.clientId === client.clientId)) entry.claimants.push(client);
    this.claims.set(key, entry);
  }

  /** Records a peer's message. Returns the hello to send back when the peer asked for answers. */
  receive(message: ElectionMessage | null | undefined, now: number): ElectionMessage | null {
    if (!message || message.clientId === this.self.clientId) return null;
    if (message.type === "bye") {
      this.peers.delete(message.clientId);
      return null;
    }
    if ((message.type !== "hello" && message.type !== "claim") || typeof message.userId !== "string")
      return null;
    const peer = {
      clientId: message.clientId,
      userId: message.userId,
      startedAt: Number(message.startedAt) || 0,
    };
    this.peers.set(peer.clientId, { ...peer, lastSeen: now });
    if (message.type === "claim") {
      if (typeof message.key === "string") this.addClaim(message.key, peer, now);
      return null;
    }
    return message.probe ? this.hello() : null;
  }

  /** Drops peers not heard from within PEER_TTL_MS. */
  prune(now: number): void {
    for (const [id, peer] of this.peers) if (now - peer.lastSeen > PEER_TTL_MS) this.peers.delete(id);
  }

  private pruneClaims(now: number): void {
    for (const [key, { at }] of this.claims) if (now - at > CLAIM_TTL_MS) this.claims.delete(key);
  }

  /** Live clients of `userId`, this one included when it belongs to that user, oldest first. */
  clientsOf(userId: string, now: number): GMClient[] {
    this.prune(now);
    const clients: GMClient[] = [...this.peers.values()].filter((p) => p.userId === userId);
    if (this.self.userId === userId) clients.push(this.self);
    return clients.sort(compareClients);
  }

  /**
   * This client's place among the live clients of the active GM user: 0 is the leader. -1 when it is not
   * a client of that user or has not settled yet (it may not know the older clients).
   */
  rank(activeGMUserId: string, now: number): number {
    if (this.self.userId !== activeGMUserId) return -1;
    if (now - this.joinedAt < SETTLE_MS) return -1;
    return this.clientsOf(activeGMUserId, now).findIndex((c) => c.clientId === this.self.clientId);
  }

  isLeader(activeGMUserId: string, now: number): boolean {
    return this.rank(activeGMUserId, now) === 0;
  }

  /** Forgets the clients ranked ahead of this one: they let a claim time out, so they are gone. */
  takeOver(activeGMUserId: string, now: number): void {
    for (const client of this.clientsOf(activeGMUserId, now)) {
      if (client.clientId === this.self.clientId) break;
      this.peers.delete(client.clientId);
    }
  }
}
