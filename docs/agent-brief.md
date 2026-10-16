# Agent brief: Sargas Mythic Powers

You are one of six agents implementing a Foundry VTT **v14** (14.368) module for the **PF2e 8.5.1** system,
all working **at the same time in the same folder**:
`E:\sargas-mythic-powers\.claude\worktrees\foundry-pf2e-mythic-powers-0a6827`.

## Ground rules (product)

- Mythic power is granted **per character by the GM only**. The GM can **enable or disable** it per character
  at any time. A player whose character is not granted **and** enabled must see **no sign of mythic power**:
  no slots, points, chat cards, menus, or compendium entries.
- `isMythicActive(actor)` in `src/state/flags.ts` is the single test for "show mythic stuff".
- Don't replace the PF2e character sheet. Add to it with render hooks only. Never patch PF2e prototypes.
- Plan with mockups: `docs/plan.html` (sections 2, 4, 5). GitHub issues #1–#24 in sargas79/sargas-mythic-powers
  describe each feature (`gh issue view <n> --repo sargas79/sargas-mythic-powers`). Read the issues you own.

## Shared core (already written: read, don't edit)

`src/constants.ts`, `src/foundry/{i18n,settings,socket,ledger,session}.ts`, `src/state/{flags,actor-mythic}.ts`,
`src/rules/{progression,awards}.ts`, `src/features/{types,index}.ts`, `src/main.ts`, `src/api.ts`,
`src/types/foundry.d.ts` (globals typed `any`). If you need a core change, **don't make it**. Work around
it in your own files and describe the needed change in your final report.

Contract stubs under `src/services/*` and `src/apps/*`: each has an OWNER comment. Implement the ones you own
**keeping the exported signatures** (you may add exports). Call other agents' contracts freely; they will exist.

## File ownership (strict)

Edit only files you own, plus new files you create with your prefix:

- `lang/parts/<letter>-<name>.json`: your localization keys, nested under `"sargas-mythic-powers"`. Use your own
  sub-namespace (for example `"grant"` or `"console"`) so keys never collide. `lang/en.json` is generated, so don't edit it.
- `styles/parts/<letter>-<name>.css`: your CSS. Prefix every class `smp-`. Use the tokens in `styles/parts/00-core.css`.
- `templates/<name>.hbs`: your Handlebars templates. Path at runtime: `modules/sargas-mythic-powers/templates/<name>.hbs`.
- `tests/<name>.test.ts`: your unit tests (Vitest, Node). Put pure logic in `src/rules/<name>.ts` (no Foundry
  globals) so it can be tested.
- Don't edit `package.json`, configs, `module.json`, or another agent's files. **Don't commit or run git
  commands that change state.** Don't run `npm run build` or `npm install`.

## Checks before you finish

- `npx tsc --noEmit`, `npx vitest run tests/<yours>`, `npx eslint <your files>`, `npx prettier --write <your files>`.
  Other agents' in-progress files may show errors. Ignore errors outside your files.
- Code style: TypeScript strict, ES modules with `.js` import suffixes, short doc comment at the top of each
  file, `t()` for every user-visible string, `esc()` for any interpolated HTML, no `console.log`.

## Foundry v14 references (local, unminified)

- Client source: `E:\Foundry Virtual Tabletop\resources\app\client\` (`applications/api/application.mjs`,
  `handlebars-application.mjs`, `dialog.mjs`, `applications/sidebar/tabs/actor-directory.mjs`, …).
- Use `foundry.applications.api.ApplicationV2` + `HandlebarsApplicationMixin`, `foundry.applications.api.DialogV2`,
  `foundry.applications.handlebars.renderTemplate`. v14 context-menu hook for the actor directory:
  `getActorContextOptions` (check the source). Scene controls: `getSceneControlButtons` with the object API
  (see `/e/sargas-encounter-builder/src/foundry/launcher.ts` for a working example from the same author).
- Render hooks in v14 pass an `HTMLElement` (ApplicationV2) or jQuery (AppV1). Handle both.

## PF2e 8.5.1 references

- Bundled source: `C:\Users\diego\AppData\Local\FoundryVTT\Data\systems\pf2e\pf2e.mjs` (unminified, 6 MB).
  Use grep with line numbers and read around the hits.
- Facts already verified:
  - World setting `game.settings.get("pf2e","mythic")`: `"disabled" | "enabled" | "variant-tiers"`. When not disabled,
    every character gets feat group `mythic` with slots `mythic-calling` (filter category `calling`) and
    `mythic-2`…`mythic-20` (12 = destiny, filter trait `destiny`). Tier mode: slot `mythic-<2n>` is tier n, and
    the limit is in `actor.flags.pf2e.featLimits.mythic`.
  - A character is mythic in PF2e's eyes iff `setting !== "disabled"` and it owns a feat with
    `category === "calling"`. Then `system.resources.mythicPoints.max = 3` and `heroPoints.max = 0`.
  - Insert a feat into a slot: `await actor.feats.insertFeat(item, { groupId: "mythic", slotId: "mythic-4" })`
    (the item can be a compendium item). Slotted feats have `system.location === slotId`.
  - Callings: 18 items in pack `pf2e.classfeatures` (category `calling`, traits `calling,mythic`; most have a
    `GrantItem` rule for their action, Rewrite Fate is granted by PF2e logic). Each description has
    `<strong>Edicts</strong> …` and `<strong>Anathema</strong> …` paragraphs. Publication title is in
    `system.publication.title` ("Pathfinder War of Immortals", "Pathfinder Revenge of the Runelords Player's
    Guide", "Pathfinder Society Scenario #6-09: The Power of Legends").
  - Mythic feats: 221 feats in `pf2e.feats-srd` with trait `mythic` (category `class`), 13 destiny dedications
    (traits `destiny,mythic`, level 12). Prerequisites in `system.prerequisites.value[].value` (strings such as
    "Hunter's Calling", "a mature animal companion or an advanced construct companion").
  - Rewrite Fate reroll is native (`pf2e.reroll` hook, resource slug `mythic-points`).
- Pack copies for offline inspection (LevelDB):
  `C:\Users\diego\AppData\Local\Temp\claude\E--sargas-mythic-powers--claude-worktrees-foundry-pf2e-mythic-powers-0a6827\61733601-00ae-49c1-94e6-e29680deecb2\scratchpad\p\{feats,class-features,actions}`.
  Read one with Node: `require("E:/Foundry Virtual Tabletop/resources/app/node_modules/classic-level")`,
  `new ClassicLevel(path, { valueEncoding: "json" })`, iterate keys starting with `!items!`. Don't write to
  the live Foundry Data folder. Write scratch scripts in that scratchpad folder, not in the repo.

## Final report (keep it short)

Files created or changed; what works; what you couldn't verify without a running Foundry; any core change
you need (exact diff); any assumption about another agent's contract.
