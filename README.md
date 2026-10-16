# Sargas - Mythic Powers

Mythic power for the Pathfinder Second Edition system on Foundry VTT, granted by the GM **one character at a
time**. It builds on the mythic rules PF2e already ships (mythic feat slots, Mythic Points, Rewrite Fate) and
adds what the system lacks: a per-character grant, a Calling picker, a mythic feat picker, a GM Mythic
Console with Mythic Point awards and a ledger, automation prompts, mythic trials and tiers, late-start
catch-up and the mythic death rules.

The rules come from _Pathfinder War of Immortals_ (Mythic Rules, Alternate Mythic Progression, Mythic Late
Start). See [LICENSE-ORC.md](LICENSE-ORC.md).

## Visibility rules

- Only the GM grants mythic power, and always to one character at a time. There is no party-wide grant.
- The GM can **enable** or **disable** mythic power per character at any time. Disabling keeps the
  character's Calling and mythic feats in a flag and removes them from the actor (so Hero Points come back);
  enabling restores them exactly. **Revoke** removes mythic power for good, after a confirmation.
- A character that is not granted **and** enabled looks exactly like a character in a world without mythic
  rules: no mythic slots, no Mythic Points, no chat cards, no menus. Mythic feats, Callings and destinies
  can't be dropped on it.
- Players who own no enabled mythic character see no mythic, Calling or destiny entries in the PF2e
  Compendium Browser. The compendium packs themselves are left alone.
- Chat cards are whispered to the character's owners and the GM, never to other players.
- Every module menu, control and setting is GM only. Hiding mythic content from characters without an
  active grant is always on and can't be switched off.

## Requirements

- Foundry VTT **14** (verified on 14.368).
- Pathfinder Second Edition system **8.5** or later.
- PF2e's **Mythic Rules** world setting must be on (`Enabled`, or `Alternate Mythic Progression` for
  trials). The module offers to turn it on.

## Installation

In Foundry's **Add-on Modules** tab, choose **Install Module** and paste this manifest URL:

```
https://github.com/sargas79/sargas-mythic-powers/releases/latest/download/module.json
```

Then enable **Sargas - Mythic Powers** in your PF2e world.

## GM guide

### Grant, enable, disable, revoke

Right-click a character in the Actors directory:

- **Grant Mythic Power…** opens the grant dialog: source of power (shown on the sheet), progression
  (standard, late start or mythic trials), who picks the Calling (player or GM), whether to start with 3
  Mythic Points, and whether to announce it to the character's owners.
- **Disable / Enable Mythic Power** suspends or restores the power without losing any choice.
- **Revoke Mythic Power…** removes it for good after a confirmation.

Granted characters get a purple badge in the directory (grey when disabled). Only the GM sees it.

### Mythic Console

Open it from the GM-only button in the Token Controls. It lists every player character with:

- an Enable / Disable switch, the Calling, Mythic Points, tier and trials (or late-start progress), doomed
  value and open slots;
- per-character awards: **Edict +1**, **±** custom amount, **Anathema** (to 0), **+ Trial** (trials
  progression) and **Release feat** (late start);
- party actions: **Start Session** (every enabled mythic character to 3 Mythic Points, session counter +1),
  **Mythic Deed** (+3 to all) and **Mythic Kill…** (2 to the killer, 1 to every other mythic character);
- the **ledger**: every change (points, grants, toggles, trials, tiers, releases, deaths), newest first, with
  undo for point changes and mythic death;
- the **Calling sources** menu, to choose which books the Calling picker offers.

### Mythic trials and tiers (Alternate Mythic Progression)

Grant with the **Mythic trials** progression and turn on PF2e's `Alternate Mythic Progression` setting (the
module warns when it is off, because tiers do nothing without it). The character starts at tier 0 with one
trial.

- Click **+ Trial** in the console and add a note. The trial goes into the character's trial log and the
  ledger.
- Trials needed per tier: 1 for tier 0, 2 for each of tiers 1-5, 3 for each of tiers 6-9 and 4 for tier 10.
- When a tier is earned the module writes `flags.pf2e.featLimits.mythic`, so PF2e opens the matching mythic
  feat slot, and whispers "Mythic tier N: a new mythic feat slot is open" to the owners and the GM.
- At most one tier rises per session. A tier that is earned but held back rises at the next **Start
  Session**.
- The GM gets a warning when a character's tier is above half its level.

### Late start

For characters granted mythic power after level 2. The even-level slots up to the grant level are owed and
released gradually; slots gained by levelling after the grant open normally.

- Every **Start Session** releases the number of slots set in **Late start: feats released per session**
  (default 1), once per session.
- **Release feat** in the console releases one by hand.
- Locked slots show on the sheet and are blocked in the feat picker. Each release whispers "A mythic feat
  slot is open (X of Y caught up)" to the owners and the GM. Once caught up, the character progresses
  normally.

### Automation

Every automation asks the GM first and never applies on its own.

- **Mythic kill**: when a mythic NPC drops to 0 HP in combat, the GM gets a whispered card suggesting 2
  Mythic Points for the last blow and 1 for every other enabled mythic character. The GM can change the
  killer or ignore it.
- **Calling daily regain**: the first critical success each in-game day with a character's Calling actions
  offers to restore 1 Mythic Point.
- **Mythic death** (off by default): a mythic character who would reach dying 4 gains doomed 1 and
  stabilizes at 0 HP instead, with a chat card. They die only at doomed 4. The GM can undo it from the
  ledger.
- **Hero Points for non-mythic characters** (mixed play): whenever mythic characters gain Mythic Points from
  a kill or deed, each other character gains a Hero Point.

### Mythic NPCs

Mythic monster rules from _War of Immortals_ (Mythic Monster Templates and Basic Mythic Abilities).

- **Make Mythic** (GM): right-click an NPC in the Actors directory, or use the **Mythic** button on its sheet. The
  dialog walks through the ability table for the creature's level (resilience or resistance at 1, 7 and 13; Mythic
  Skill or Remove a Condition at 4; Recharge at 10; Undying Myth at 17; Reroll or Mythic Defenses at 20; Mythic
  Immunity at 23+), with the usual picks preselected. It adds the `mythic` trait, PF2e's own mythic ability items
  trimmed to your choices, and 3 Mythic Points. Mythic Resistance and Mythic Immunity apply only to Strikes (and,
  for immunity, harmful spells) from non-mythic creatures and weapons. **Remove Mythic Template** undoes it.
  Creatures that are already mythic in the bestiary are left as they are.
- **Spending NPC Mythic Points** (GM): right-click a mythic NPC's failed check and choose **Reroll (Mythic Point)**;
  Mythic Skill spends its point automatically when the toggle is on; Recharge and Remove a Condition cards get a
  **Spend Mythic Point** button. Mythic NPCs go back to full Mythic Points when a combat starts.
- **Undying Myth**: when a mythic NPC with Undying Myth and at least 1 Mythic Point drops to 0 HP, the GM gets a
  card to stand it back up with half its HP for all its points. The mythic kill prompt waits for that answer.
- **Mythic Defenses**: a critical hit against a creature with Mythic Defenses prompts the GM to reroll the attack.
- The **Mythic Console** lists the mythic NPCs in the current combat, with their points and abilities.

### Settings

| Setting                                          | Default                     | What it does                                                                       |
| ------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------- |
| Grant announcement                               | Whisper to the owners       | Who sees the card when you grant or enable mythic power (always plus the GM).      |
| Require GM approval for mythic feats             | Off                         | Players' mythic feat picks are sent to the GM to approve.                          |
| Prompt on mythic creature defeat                 | On                          | Suggests 2 / 1 Mythic Points when a mythic creature is defeated.                   |
| Calling daily regain prompts                     | On                          | Offers 1 Mythic Point on the first critical success each day with Calling actions. |
| Mythic death rules                               | Off                         | Doomed instead of dying 4; death at doomed 4.                                      |
| Hero Points for non-mythic characters            | Off                         | Mixed play: a Hero Point to each non-mythic character on mythic awards.            |
| Late start: feats released per session           | 1                           | Catch-up slots released at each Start Session (1-5).                               |
| Allowed Calling sources (console menu)           | Pathfinder War of Immortals | Source books offered in the Calling picker.                                        |
| Mythic NPCs: reset Mythic Points at combat start | On                          | Mythic NPCs in a combat go back to full Mythic Points when it starts.              |
| Mythic NPCs: Undying Myth prompt                 | On                          | Asks the GM about Undying Myth when a mythic NPC drops to 0 HP.                    |
| Mythic NPCs: Mythic Defenses prompt              | On                          | Asks the GM to reroll a critical hit against a creature with Mythic Defenses.      |

## Player guide

- **Calling**: when the GM grants you mythic power and lets you choose, the Calling picker opens. It shows
  each Calling's mythic-proficiency skills, daily regain, edicts and anathema. You can also open it from the
  Mythic banner on the Feats tab until you've picked one. Taking a Calling gives you Rewrite Fate and Mythic
  Points.
- **Sheet**: the Feats tab shows a Mythic banner (Calling, progression, Mythic Points, edicts and anathema)
  and the mythic feat slots. A badge counts open slots; locked late-start slots say when they open.
- **Feat picker**: click **Choose feat…** on an open mythic slot. The picker lists the feats you can take now
  (right level or tier, prerequisites met, one destiny, destiny only at 12) and, if you want, the ones you
  can't take with the reason. If the GM requires approval, your pick is sent to the GM.
- **Rewrite Fate** works through PF2e's own reroll menu in chat.

## API

`game.modules.get("sargas-mythic-powers").api` exposes these functions for macros and other modules. Every
function that changes state is GM only.

| Function                              | Description                                                             |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `getState(actor)`                     | The module's mythic state for the actor.                                |
| `isGranted(actor)`                    | Granted (enabled or disabled).                                          |
| `isMythicActive(actor)`               | Granted and enabled: the test for showing anything mythic.              |
| `grantMythic(actor, options)`         | Grants mythic power (`source`, `progression`, `callingChoice`, …).      |
| `enableMythic(actor)`                 | Restores suspended mythic power.                                        |
| `disableMythic(actor)`                | Suspends mythic power, keeping the choices.                             |
| `revokeMythic(actor, { confirm })`    | Removes mythic power for good.                                          |
| `openGrantDialog(actor)`              | Opens the Grant Mythic Power dialog.                                    |
| `openCallingPicker(actor)`            | Opens the Calling picker.                                               |
| `openFeatPicker(actor, slotId)`       | Opens the mythic feat picker for a slot (`mythic-4`, …).                |
| `openMythicConsole()`                 | Opens the Mythic Console.                                               |
| `changePoints(actor, kind, options)`  | Changes Mythic Points (edict, anathema, custom, …) with a ledger entry. |
| `startSession()`                      | Every enabled mythic character to 3 and the session counter +1.         |
| `awardDeed(reason?)`                  | +3 to every enabled mythic character.                                   |
| `awardKill(killer, defeatedName)`     | 2 to the killer, 1 to every other enabled mythic character.             |
| `logTrial(actor, note)`               | Logs a mythic trial and raises the tier when earned.                    |
| `releaseLateStart(actor, count?)`     | Releases late-start catch-up slots (default: the per-session setting).  |
| `openNpcTemplateDialog(actor)`        | Opens the Make Mythic dialog for an NPC.                                |
| `applyMythicTemplate(actor, choices)` | Applies the mythic monster template (empty choices = the defaults).     |
| `removeMythicTemplate(actor)`         | Removes what the template added.                                        |

## Development

```sh
npm install
npm run build        # merges lang and styles, then builds dist/sargas-mythic-powers.js
npm test             # Vitest (rules in src/rules are pure and unit tested)
npm run lint
npm run typecheck
npm run format
npm run link         # links this folder into %LOCALAPPDATA%/FoundryVTT/Data/modules
```

`npm run link -- <FoundryDataPath>` links into another Data folder. On Windows it creates a directory
junction, so no admin rights are needed.

Localization and styles are split per feature: edit `lang/parts/*.json` and `styles/parts/*.css`.
`scripts/merge-assets.mjs` (run by `npm run assets` and `npm run build`) merges them into the generated
`lang/en.json` and `styles/mythic.css`; don't edit those two files.

Manual smoke tests: [docs/testing.md](docs/testing.md).

Releases: push a tag `vX.Y.Z` matching `package.json` and a `## X.Y.Z` heading in `CHANGELOG.md`. The
release workflow builds, zips and attaches `module.json` and `sargas-mythic-powers.zip`.

## License

Code: MIT ([LICENSE](LICENSE)). Game mechanics: ORC License ([LICENSE-ORC.md](LICENSE-ORC.md)).
