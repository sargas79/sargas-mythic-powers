import { describe, expect, it } from "vitest";
import {
  CLAIM_TTL_MS,
  CLAIM_VERIFY_MS,
  CLAIM_WAIT_MS,
  GMElection,
  PEER_TTL_MS,
  SETTLE_MS,
  claimDelay,
  compareClients,
} from "../src/rules/gm-election.js";

const GM = "gmUser";
const T0 = 1_000_000;

function client(clientId: string, startedAt: number, userId = GM) {
  return new GMElection({ clientId, userId, startedAt }, startedAt);
}

/** Delivers every message one client sends to all the others, as the module socket does. */
function connect(...clients: GMElection[]) {
  return (from: GMElection, message: ReturnType<GMElection["hello"]>, now: number) => {
    for (const to of clients) {
      if (to === from) continue;
      const reply = to.receive(message, now);
      if (reply) for (const back of clients) if (back !== to) back.receive(reply, now);
    }
  };
}

describe("GM client election", () => {
  it("a lone GM client acts once settled", () => {
    const a = client("a", T0);
    expect(a.isLeader(GM, T0)).toBe(false);
    expect(a.isLeader(GM, T0 + SETTLE_MS)).toBe(true);
  });

  it("two tabs of the same GM user: exactly one acts, the older one", () => {
    const old = client("zzz", T0);
    const fresh = client("aaa", T0 + 60_000);
    const send = connect(old, fresh);
    send(fresh, fresh.hello(true), T0 + 60_000);
    for (const now of [T0 + 60_000, T0 + 60_000 + SETTLE_MS, T0 + 90_000]) {
      expect(old.isLeader(GM, now)).toBe(true);
      expect(fresh.isLeader(GM, now)).toBe(false);
    }
  });

  it("the probe makes older peers answer so the new tab learns of them", () => {
    const old = client("b", T0);
    const fresh = client("a", T0 + 5_000);
    const reply = old.receive(fresh.hello(true), T0 + 5_000);
    expect(reply).toMatchObject({ type: "hello", clientId: "b" });
    expect(old.receive(fresh.hello(), T0 + 5_000)).toBeNull();
    fresh.receive(reply, T0 + 5_000);
    expect(fresh.clientsOf(GM, T0 + 5_000).map((c) => c.clientId)).toEqual(["b", "a"]);
  });

  it("ties on start time break on client id, the same way on both clients", () => {
    const a = client("a", T0);
    const b = client("b", T0);
    a.receive(b.hello(), T0);
    b.receive(a.hello(), T0);
    const now = T0 + SETTLE_MS;
    expect([a.isLeader(GM, now), b.isLeader(GM, now)]).toEqual([true, false]);
  });

  it("the next client takes over when the leader says bye", () => {
    const old = client("old", T0);
    const fresh = client("new", T0 + 10_000);
    fresh.receive(old.hello(), T0 + 10_000);
    const now = T0 + 20_000;
    expect(fresh.isLeader(GM, now)).toBe(false);
    fresh.receive(old.bye(), now);
    expect(fresh.isLeader(GM, now)).toBe(true);
  });

  it("the next client takes over when the leader stops heartbeating", () => {
    const old = client("old", T0);
    const fresh = client("new", T0 + 10_000);
    fresh.receive(old.hello(), T0 + 10_000);
    expect(fresh.isLeader(GM, T0 + 10_000 + PEER_TTL_MS)).toBe(false);
    expect(fresh.isLeader(GM, T0 + 10_000 + PEER_TTL_MS + 1)).toBe(true);
  });

  it("a heartbeat keeps the leader alive past the TTL", () => {
    const old = client("old", T0);
    const fresh = client("new", T0 + 10_000);
    fresh.receive(old.hello(), T0 + 10_000);
    fresh.receive(old.hello(), T0 + 100_000);
    expect(fresh.isLeader(GM, T0 + 10_000 + PEER_TTL_MS + 1)).toBe(false);
  });

  it("only clients of the active GM user count", () => {
    const mine = client("z", T0 + 1_000, "gmA");
    const other = client("a", T0, "gmB");
    mine.receive(other.hello(), T0 + 1_000);
    const now = T0 + 1_000 + SETTLE_MS;
    expect(mine.isLeader("gmA", now)).toBe(true);
    expect(mine.isLeader("gmB", now)).toBe(false);
    expect(mine.clientsOf("gmB", now).map((c) => c.clientId)).toEqual(["a"]);
  });

  it("ignores its own echo and malformed messages", () => {
    const a = client("a", T0);
    expect(a.receive(a.hello(true), T0)).toBeNull();
    expect(a.receive(null, T0)).toBeNull();
    expect(a.receive({ type: "hello" } as never, T0)).toBeNull();
    expect(a.clientsOf(GM, T0).map((c) => c.clientId)).toEqual(["a"]);
  });

  it("orders clients by start time, then id", () => {
    const list = [
      { clientId: "b", userId: GM, startedAt: 2 },
      { clientId: "c", userId: GM, startedAt: 1 },
      { clientId: "a", userId: GM, startedAt: 2 },
    ].sort(compareClients);
    expect(list.map((c) => c.clientId)).toEqual(["c", "a", "b"]);
  });

  it("ranks the live clients of the active GM user, -1 while settling or for another user", () => {
    const a = client("a", T0);
    const b = client("b", T0 + 1_000);
    const c = client("c", T0 + 2_000);
    for (const x of [a, b, c]) for (const y of [a, b, c]) if (x !== y) x.receive(y.hello(), T0 + 2_000);
    expect(c.rank(GM, T0 + 2_000)).toBe(-1);
    const now = T0 + 2_000 + SETTLE_MS;
    expect([a.rank(GM, now), b.rank(GM, now), c.rank(GM, now)]).toEqual([0, 1, 2]);
    expect(a.rank("someoneElse", now)).toBe(-1);
    expect([claimDelay(0), claimDelay(1), claimDelay(2), claimDelay(-1)]).toEqual([
      0,
      CLAIM_WAIT_MS,
      2 * CLAIM_WAIT_MS,
      0,
    ]);
  });

  it("a follower sees the leader's claim and stays quiet", () => {
    const leader = client("a", T0);
    const follower = client("b", T0 + 1_000);
    follower.receive(leader.hello(), T0 + 1_000);
    const now = T0 + 10_000;
    follower.receive(leader.claim("request:1", now), now);
    expect(leader.isClaimed("request:1", now)).toBe(true);
    expect(follower.isClaimed("request:1", now + CLAIM_WAIT_MS)).toBe(true);
    expect(follower.isClaimed("request:2", now + CLAIM_WAIT_MS)).toBe(false);
  });

  it("a claim refreshes the claimant as a live peer", () => {
    const leader = client("a", T0);
    const follower = client("b", T0 + 1_000);
    follower.receive(leader.hello(), T0 + 1_000);
    follower.receive(leader.claim("k", T0 + 100_000), T0 + 100_000);
    expect(follower.isLeader(GM, T0 + 1_000 + PEER_TTL_MS + 1)).toBe(false);
  });

  it("claims are forgotten after CLAIM_TTL_MS", () => {
    const a = client("a", T0);
    a.claim("k", T0);
    expect(a.isClaimed("k", T0 + CLAIM_TTL_MS)).toBe(true);
    expect(a.isClaimed("k", T0 + CLAIM_TTL_MS + 1)).toBe(false);
  });

  it("an unclaimed key makes the follower take over from the silent clients ahead of it", () => {
    const dead = client("a", T0);
    const next = client("b", T0 + 1_000);
    const last = client("c", T0 + 2_000);
    for (const x of [next, last]) x.receive(dead.hello(), T0 + 2_000);
    next.receive(last.hello(), T0 + 2_000);
    last.receive(next.hello(), T0 + 2_000);
    const now = T0 + 20_000;
    // The leader tab closed: no claim for "request:1" arrives, so rank 1 acts after its wait.
    expect(next.rank(GM, now)).toBe(1);
    next.takeOver(GM, now + CLAIM_WAIT_MS);
    const claim = next.claim("request:1", now + CLAIM_WAIT_MS);
    last.receive(claim, now + CLAIM_WAIT_MS);
    expect(last.isClaimed("request:1", now + 2 * CLAIM_WAIT_MS)).toBe(true);
    // From then on it leads at once; the client behind it is untouched.
    expect(next.isLeader(GM, now + CLAIM_WAIT_MS)).toBe(true);
    expect(next.clientsOf(GM, now + CLAIM_WAIT_MS).map((c) => c.clientId)).toEqual(["b", "c"]);
  });

  it("two followers sharing a rank (one counts a closed tab) claim together and only the older acts", () => {
    // Live bug: tab B reloaded without a bye, so tab A still counts B's old instance ahead of it. A and the
    // new B both rank 1, both see no leader claim, both claim. The verify step lets only the older one act.
    const ghost = client("ghost", T0);
    const a = client("a", T0 + 1_000);
    const b = client("b", T0 + 5_000);
    a.receive(ghost.hello(), T0 + 1_000);
    a.receive(b.hello(true), T0 + 5_000);
    b.receive(a.hello(), T0 + 5_000);
    const now = T0 + 30_000;
    expect([a.rank(GM, now), b.rank(GM, now)]).toEqual([1, 1]);
    const t = now + claimDelay(1);
    const claimA = a.claim("request:1", t);
    const claimB = b.claim("request:1", t);
    a.receive(claimB, t);
    b.receive(claimA, t);
    const verify = t + CLAIM_VERIFY_MS;
    expect([a.wonClaim("request:1", verify), b.wonClaim("request:1", verify)]).toEqual([true, false]);
  });

  it("a lone claimant wins its own claim", () => {
    const a = client("a", T0);
    a.claim("k", T0);
    expect(a.wonClaim("k", T0)).toBe(true);
    expect(a.wonClaim("other", T0)).toBe(false);
  });
});
