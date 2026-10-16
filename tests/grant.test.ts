import { describe, expect, it } from "vitest";
import {
  cardRecipients,
  collectSuspendIds,
  isMythicSource,
  itemsToRestore,
  mergeSuspended,
  owedFeats,
  shouldFillPoints,
  showChooseCalling,
  type ItemSourceLike,
} from "../src/rules/suspend.js";

const feat = (
  _id: string,
  extra: { category?: string; traits?: string[]; grantedBy?: string; grants?: Record<string, string> } = {},
  grantOnDelete = "detach",
): ItemSourceLike => ({
  _id,
  type: "feat",
  system: { category: extra.category ?? "class", traits: { value: extra.traits ?? [] } },
  flags: {
    pf2e: {
      grantedBy: extra.grantedBy ? { id: extra.grantedBy, onDelete: "cascade" } : null,
      itemGrants: Object.fromEntries(
        Object.entries(extra.grants ?? {}).map(([k, id]) => [k, { id, onDelete: grantOnDelete }]),
      ),
    },
  },
});

describe("isMythicSource", () => {
  it("matches callings, mythic and destiny feats only", () => {
    expect(isMythicSource(feat("a", { category: "calling" }))).toBe(true);
    expect(isMythicSource(feat("b", { traits: ["mythic"] }))).toBe(true);
    expect(isMythicSource(feat("c", { traits: ["destiny", "mythic"] }))).toBe(true);
    expect(isMythicSource(feat("d", { traits: ["general"] }))).toBe(false);
    expect(isMythicSource({ _id: "e", type: "action", system: { traits: { value: ["mythic"] } } })).toBe(
      false,
    );
  });
});

describe("collectSuspendIds", () => {
  it("includes granted children found via itemGrants and grantedBy, recursively", () => {
    const items: ItemSourceLike[] = [
      feat("calling", { category: "calling", grants: { rewriteFate: "rf" } }),
      { _id: "rf", type: "action", flags: { pf2e: { grantedBy: { id: "calling" } } } },
      feat("myth", { traits: ["mythic"] }),
      { _id: "child", type: "action", flags: { pf2e: { grantedBy: { id: "myth" } } } },
      { _id: "grandchild", type: "effect", flags: { pf2e: { grantedBy: { id: "child" } } } },
      feat("general", { traits: ["general"] }),
      { _id: "sword", type: "weapon" },
    ];
    expect(collectSuspendIds(items)).toEqual(["calling", "rf", "myth", "child", "grandchild"]);
  });

  it("includes a non-mythic granter that would cascade-delete with its mythic grant", () => {
    const items: ItemSourceLike[] = [
      feat("parent", { grants: { x: "m" } }, "cascade"),
      feat("m", { traits: ["mythic"], grantedBy: "parent" }),
      feat("other", { grants: { y: "n" } }, "detach"),
      feat("n", { traits: ["mythic"], grantedBy: "other" }),
    ];
    expect(collectSuspendIds(items)).toEqual(["parent", "m", "n"]);
  });

  it("ignores dangling grant references", () => {
    const items = [feat("c", { category: "calling", grants: { gone: "missing" } })];
    expect(collectSuspendIds(items)).toEqual(["c"]);
  });

  it("returns nothing for a plain character", () => {
    expect(collectSuspendIds([feat("a"), { _id: "b", type: "weapon" }])).toEqual([]);
  });
});

describe("restore helpers", () => {
  it("skips items that already exist", () => {
    expect(itemsToRestore([{ _id: "a" }, { _id: "b" }], ["b"])).toEqual([{ _id: "a" }]);
  });
  it("merges an interrupted suspension without duplicates", () => {
    expect(mergeSuspended([{ _id: "a" }], [{ _id: "a" }, { _id: "b" }])).toEqual([
      { _id: "a" },
      { _id: "b" },
    ]);
  });
});

describe("owedFeats", () => {
  it("counts even levels for standard and late start, none for trials", () => {
    expect(owedFeats("standard", 7)).toBe(3);
    expect(owedFeats("lateStart", 7)).toBe(3);
    expect(owedFeats("standard", 1)).toBe(0);
    expect(owedFeats("standard", 20)).toBe(10);
    expect(owedFeats("trials", 12)).toBe(0);
  });
});

describe("cardRecipients", () => {
  it("whispers GMs and owners only", () => {
    expect(
      cardRecipients([
        { id: "gm", isGM: true, isOwner: false },
        { id: "owner", isGM: false, isOwner: true },
        { id: "other", isGM: false, isOwner: false },
      ]),
    ).toEqual(["gm", "owner"]);
  });
});

describe("shouldFillPoints", () => {
  const base = { granted: true, enabled: true };
  it("fills on the first Calling when requested", () => {
    expect(shouldFillPoints({ ...base, meta: { firstCallingDone: false, startWithFullPoints: true } })).toBe(
      true,
    );
  });
  it("respects the start-with-3 choice", () => {
    expect(shouldFillPoints({ ...base, meta: { firstCallingDone: false, startWithFullPoints: false } })).toBe(
      false,
    );
  });
  it("never fills twice, when disabled, or without grant bookkeeping", () => {
    expect(shouldFillPoints({ ...base, meta: { firstCallingDone: true, startWithFullPoints: true } })).toBe(
      false,
    );
    expect(
      shouldFillPoints({
        granted: true,
        enabled: false,
        meta: { firstCallingDone: false, startWithFullPoints: true },
      }),
    ).toBe(false);
    expect(shouldFillPoints({ ...base, meta: null })).toBe(false);
  });
});

describe("showChooseCalling", () => {
  it("shows only for player choice, no Calling, active grant and an owner", () => {
    const ok = { callingChoice: "player" as const, hasCalling: false, active: true, canUse: true };
    expect(showChooseCalling(ok)).toBe(true);
    expect(showChooseCalling({ ...ok, callingChoice: "gm" })).toBe(false);
    expect(showChooseCalling({ ...ok, hasCalling: true })).toBe(false);
    expect(showChooseCalling({ ...ok, active: false })).toBe(false);
    expect(showChooseCalling({ ...ok, canUse: false })).toBe(false);
  });
});
