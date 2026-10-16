/**
 * OWNER: agent B. Feature "compendium-filter" (issue #11). Players with no active mythic character don't see
 * entries with the mythic, calling or destiny trait (or category calling) in the PF2e Compendium Browser.
 *
 * PF2e 8.5.1 builds each browser tab's rows in `tab.loadData()` (sets `tab.indexData`, each row has an
 * `options` Set such as "trait:mythic" or "category:calling"); `tab.init()` then feeds them to the search
 * engine. We wrap `loadData` on the tab instances (not the prototype) to drop mythic rows after load, and
 * call `browser.resetInitializedTabs()` when the user's access changes. Pack ownership is untouched.
 */
import { HOOKS, MODULE_ID } from "../constants.js";
import { userHasActiveMythic } from "../state/flags.js";
import type { Feature } from "./types.js";

/** Row options that mark mythic content. */
export const HIDDEN_OPTIONS = new Set(["trait:mythic", "trait:calling", "trait:destiny", "category:calling"]);
/** Actor tabs are left alone: they list creatures, not character options. */
const SKIPPED_TABS = new Set(["bestiary", "hazard"]);
const WRAPPED = Symbol(`${MODULE_ID}.wrapped`);

interface BrowserRow {
  options?: Iterable<string>;
}

interface BrowserTab {
  tabName?: string;
  indexData: BrowserRow[];
  isInitialized?: boolean;
  loadData: () => Promise<void>;
  [WRAPPED]?: boolean;
}

/** True when a Compendium Browser row is mythic content. */
export function isMythicRow(row: BrowserRow): boolean {
  for (const option of row?.options ?? []) if (HIDDEN_OPTIONS.has(option)) return true;
  return false;
}

/** Last access state the browser data was built for (null = not built yet). */
let builtFor: boolean | null = null;

function canSeeMythic(): boolean {
  return !!game.user?.isGM || userHasActiveMythic(game.user);
}

/** PF2e's CompendiumBrowser (typed loosely: PF2e ships no types). */
interface CompendiumBrowserLike {
  tabsArray?: BrowserTab[];
  tabs?: Record<string, BrowserTab>;
  rendered?: boolean;
  resetInitializedTabs?: () => Promise<void>;
  render?: () => Promise<unknown>;
}

function browser(): CompendiumBrowserLike | null {
  return game.pf2e?.compendiumBrowser ?? null;
}

function tabsOf(b: CompendiumBrowserLike): BrowserTab[] {
  return b.tabsArray ?? Object.values(b.tabs ?? {});
}

/** Wraps every item tab's loadData once. Returns true when at least one tab was already initialized. */
function wrapTabs(): boolean {
  const b = browser();
  if (!b) return false;
  let initialized = false;
  for (const tab of tabsOf(b)) {
    if (!tab || tab[WRAPPED] || SKIPPED_TABS.has(tab.tabName ?? "")) continue;
    if (typeof tab.loadData !== "function") continue;
    const original = tab.loadData;
    tab.loadData = async () => {
      await original.call(tab);
      builtFor = canSeeMythic();
      if (!builtFor) tab.indexData = (tab.indexData ?? []).filter((row) => !isMythicRow(row));
    };
    tab[WRAPPED] = true;
    if (tab.isInitialized) initialized = true;
  }
  return initialized;
}

async function rebuild(): Promise<void> {
  const b = browser();
  if (!b) return;
  wrapTabs();
  const now = canSeeMythic();
  if (builtFor === now) return;
  builtFor = now;
  try {
    await b.resetInitializedTabs?.();
    if (b.rendered) await b.render?.();
  } catch (error) {
    console.error(`${MODULE_ID} | compendium browser refresh failed`, error);
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Re-evaluates access shortly after a change (several actor updates often arrive together). */
function scheduleRebuild(): void {
  if (game.user?.isGM) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void rebuild();
  }, 250);
}

export const feature: Feature = {
  id: "compendium-filter",
  register() {},
  async ready() {
    if (game.user?.isGM) return;
    // Some tabs may already be initialized (prefetch); rebuild them with the filter in place.
    if (wrapTabs()) {
      builtFor = null;
      await rebuild();
    }
    // The browser exists after PF2e's own ready; wrap again in case it was created later.
    Hooks.on("renderCompendiumBrowser", () => {
      if (wrapTabs()) scheduleRebuild();
    });
    Hooks.on(HOOKS.stateChanged, scheduleRebuild);
    Hooks.on("updateActor", scheduleRebuild);
    Hooks.on("createActor", scheduleRebuild);
    Hooks.on("deleteActor", scheduleRebuild);
  },
};
