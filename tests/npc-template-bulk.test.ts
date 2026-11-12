/** Mythic template for several creatures at once: sorting the selection, and running the apply and remove. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import data from "./fixtures/npc-abilities.json";
import { MODULE_ID, PF2E } from "../src/constants.js";
import { appendLedger } from "../src/foundry/ledger.js";
import { classifyBulk, collapseNames, type BulkCandidate } from "../src/rules/npc-template.js";
import {
  applyMythicTemplateToMany,
  removeMythicTemplateFromMany,
  selectedTokenActors,
} from "../src/services/npc-template.js";

vi.mock("../src/foundry/ledger.js", () => ({ appendLedger: vi.fn(async () => ({})) }));

const notifications = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const FLAG_PATH = `flags.${MODULE_ID}.npc`;

/**
 * A stand-in actor whose `update` keeps the template flag and the traits. `inheritsFlag` is an unlinked token
 * whose world actor holds the flag: Foundry drops the deletion of a key the token's own data doesn't hold.
 */
function makeNpc(
  name: string,
  options: { uuid?: string; traits?: string[]; flag?: object; type?: string; inheritsFlag?: boolean } = {},
) {
  const traits = options.traits ?? [];
  const npc = {
    uuid: options.uuid ?? `Actor.${name}`,
    name,
    type: options.type ?? "npc",
    level: 5,
    flags: options.flag ? { [MODULE_ID]: { npc: options.flag } } : {},
    _source: { system: { traits: { value: traits } } },
    system: { traits: { value: traits } },
    saves: { fortitude: { mod: 10 }, reflex: { mod: 14 }, will: { mod: 12 } },
    skills: { stealth: { proficient: true, mod: 15 } },
    itemTypes: { spellcastingEntry: [] },
    items: new Set(["a", "b"]),
    createEmbeddedDocuments: vi.fn(async (_type: string, items: { name: string }[]) =>
      items.map((item, index) => ({ id: `${name}-${index}`, name: item.name })),
    ),
    deleteEmbeddedDocuments: vi.fn(async () => []),
    update: vi.fn(async (changes: Record<string, unknown>) => {
      const newTraits = changes["system.traits.value"];
      if (Array.isArray(newTraits)) {
        npc._source.system.traits.value = newTraits;
        npc.system.traits.value = newTraits;
      }
      if (!(FLAG_PATH in changes)) return;
      const flag = changes[FLAG_PATH];
      if (flag) npc.flags = { [MODULE_ID]: { npc: flag } };
      else if (!options.inheritsFlag) npc.flags = {};
    }),
  };
  return npc;
}

const templated = (name: string) =>
  makeNpc(name, { traits: ["mythic"], flag: { applied: true, itemIds: ["a", "b"], addedTrait: true } });

beforeEach(() => {
  vi.clearAllMocks();
  const documents = Object.entries(data as Record<string, object>).map(([id, source]) => ({
    id,
    toObject: () => source,
  }));
  const pack = {
    getDocuments: async ({ _id__in: ids }: { _id__in: string[] }) =>
      documents.filter((document) => ids.includes(document.id)),
  };
  vi.stubGlobal("game", {
    user: { isGM: true },
    i18n: { localize: (key: string) => key, format: (key: string) => key },
    packs: { get: (id: string) => (id === PF2E.npcAbilityPack ? pack : undefined) },
  });
  vi.stubGlobal("ui", { notifications });
  vi.stubGlobal("CONFIG", {});
  vi.stubGlobal("foundry", {
    data: {
      operators: { ForcedReplacement: { create: (v: unknown) => v }, ForcedDeletion: { create: () => null } },
    },
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("classifyBulk", () => {
  const c = (uuid: string, extra: Partial<BulkCandidate> = {}): BulkCandidate => ({
    uuid,
    name: uuid,
    npc: true,
    mythic: false,
    applied: false,
    ...extra,
  });

  it("sorts creatures by what can be done to them", () => {
    const groups = classifyBulk([
      c("plain"),
      c("templated", { mythic: true, applied: true }),
      c("bestiary", { mythic: true }),
      c("hero", { npc: false }),
    ]);
    expect(groups.eligible.map((x) => x.uuid)).toEqual(["plain"]);
    expect(groups.applied.map((x) => x.uuid)).toEqual(["templated"]);
    expect(groups.bestiary.map((x) => x.uuid)).toEqual(["bestiary"]);
    expect(groups.notNpc.map((x) => x.uuid)).toEqual(["hero"]);
  });

  it("counts several tokens of one linked actor once", () => {
    expect(classifyBulk([c("same"), c("same")]).eligible).toHaveLength(1);
  });
});

describe("collapseNames", () => {
  it("counts repeats and keeps first-seen order", () => {
    expect(collapseNames(["Goblin", "Ogre", "Goblin"])).toEqual(["Goblin ×2", "Ogre"]);
  });
});

describe("selectedTokenActors", () => {
  it("returns the controlled tokens' actors, ignoring tokens without one", () => {
    const actor = makeNpc("Ogre");
    vi.stubGlobal("canvas", { tokens: { controlled: [{ actor }, { actor: null }] } });
    expect(selectedTokenActors()).toEqual([actor]);
  });
});

describe("applyMythicTemplateToMany", () => {
  it("applies only to non-mythic NPCs and reports the rest as skipped", async () => {
    const plain = makeNpc("Ogre");
    const bestiary = makeNpc("Bestiary", { traits: ["mythic"] });
    const hero = makeNpc("Hero", { type: "character" });

    const result = await applyMythicTemplateToMany([plain, bestiary, hero]);

    expect(result).toEqual({ done: ["Ogre"], failed: [], skipped: ["Bestiary", "Hero"] });
    expect(plain.createEmbeddedDocuments).toHaveBeenCalledOnce();
    expect(plain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        "system.traits.value": ["mythic"],
        "system.resources.mythicPoints.value": 3,
      }),
      { diff: false },
    );
    expect(bestiary.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(hero.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("processes one creature at a time", async () => {
    let running = 0;
    let most = 0;
    vi.mocked(appendLedger).mockImplementation(async () => {
      running += 1;
      most = Math.max(most, running);
      await Promise.resolve();
      running -= 1;
      return {} as never;
    });
    await applyMythicTemplateToMany([makeNpc("A"), makeNpc("B"), makeNpc("C")]);
    expect(appendLedger).toHaveBeenCalledTimes(3);
    expect(most).toBe(1);
  });

  it("carries on after a failure and names who failed", async () => {
    const broken = makeNpc("Broken");
    broken.createEmbeddedDocuments.mockRejectedValue(new Error("nope"));
    const fine = makeNpc("Fine");

    const result = await applyMythicTemplateToMany([broken, fine]);

    expect(result).toMatchObject({ done: ["Fine"], failed: ["Broken"] });
    expect(notifications.error).toHaveBeenCalledOnce();
  });

  it("shows one summary, not one notification per creature", async () => {
    await applyMythicTemplateToMany([makeNpc("A"), makeNpc("B")]);
    expect(notifications.info).toHaveBeenCalledOnce();
  });

  it("does nothing for a non-GM", async () => {
    vi.stubGlobal("game", { user: { isGM: false }, i18n: { localize: (key: string) => key } });
    const npc = makeNpc("Ogre");
    const result = await applyMythicTemplateToMany([npc]);
    expect(result.done).toEqual([]);
    expect(npc.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(notifications.warn).toHaveBeenCalledOnce();
  });
});

describe("removeMythicTemplateFromMany", () => {
  it("removes only what the template added", async () => {
    const withTemplate = templated("Ogre");
    const plain = makeNpc("Plain");
    const bestiary = makeNpc("Bestiary", { traits: ["mythic"] });

    const result = await removeMythicTemplateFromMany([withTemplate, plain, bestiary]);

    expect(result).toEqual({ done: ["Ogre"], failed: [], skipped: ["Plain", "Bestiary"] });
    expect(withTemplate.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["a", "b"]);
    expect(withTemplate.update).toHaveBeenCalledWith(expect.objectContaining({ "system.traits.value": [] }));
    expect(bestiary.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(bestiary.update).not.toHaveBeenCalled();
  });

  it("leaves the creature ready to be made mythic again", async () => {
    const npc = templated("Ogre");

    await removeMythicTemplateFromMany([npc]);
    const again = await applyMythicTemplateToMany([npc]);

    expect(npc.update).toHaveBeenCalledTimes(2);
    expect(again).toEqual({ done: ["Ogre"], failed: [], skipped: [] });
  });

  it("overrides the flag on a token that inherits it from its world actor", async () => {
    const token = makeNpc("Chimera", {
      traits: ["mythic"],
      flag: { applied: true, itemIds: ["a", "b"], addedTrait: true },
      inheritsFlag: true,
    });

    const removed = await removeMythicTemplateFromMany([token]);

    expect(removed).toEqual({ done: ["Chimera"], failed: [], skipped: [] });
    expect(token.update).toHaveBeenLastCalledWith({ [FLAG_PATH]: { applied: false } }, { diff: false });
    expect(await applyMythicTemplateToMany([token])).toMatchObject({ done: ["Chimera"], failed: [] });
  });

  it("reports a failure when the flag can't be cleared", async () => {
    const stuck = templated("Stuck");
    stuck.update.mockImplementation(async () => undefined);

    const result = await removeMythicTemplateFromMany([stuck]);

    expect(result).toMatchObject({ done: [], failed: ["Stuck"] });
    expect(appendLedger).not.toHaveBeenCalled();
  });

  it("warns when nothing qualifies", async () => {
    await removeMythicTemplateFromMany([makeNpc("Plain")]);
    expect(notifications.warn).toHaveBeenCalledOnce();
  });
});
