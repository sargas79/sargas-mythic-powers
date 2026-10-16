# Manual smoke tests

Run these in the local Foundry 14.368 install with PF2e 8.5.1 before each release and at the end of each
milestone. Check every step from both a **GM** client and a **player** client (a second browser or a private
window logged in as a test user).

## Setup

1. `npm run build`, then `npm run link` (once) to link the repo into
   `%LOCALAPPDATA%/FoundryVTT/Data/modules/sargas-mythic-powers`.
2. Launch Foundry and confirm **Sargas - Mythic Powers** appears in the module list.
3. Open the `pf2-test` world and enable the module. The world needs:
   - three player characters: **A** owned by user _Player1_, **B** owned by user _Player2_, **C** owned by
     _Player1_ and left without mythic power;
   - a mythic NPC from the War of Immortals bestiary on a scene with a combat encounter.
4. Open the browser console on every client and keep it open: there must be no errors from
   `sargas-mythic-powers` during any step.

## PF2e setting check

- [ ] GM: with PF2e **Mythic Rules** set to `Disabled`, the module offers to turn it on. Players see nothing.
- [ ] GM: after turning it on, every sheet gains the PF2e mythic group, and the module hides it on A, B and C
      (none granted yet).
- [ ] Player1 and Player2: no mythic slots, no Mythic Points, no mythic menus or controls anywhere.

## Grant, enable, disable, revoke

- [ ] GM: right-click A in the Actors directory: **Grant Mythic Power…** is there. Players' context menus have
      no mythic entries.
- [ ] GM: grant A (standard progression, player picks the Calling, announce on). A gets the purple badge
      (GM only).
- [ ] Player1: receives the whispered announcement card with **Choose Calling**. Player2 receives nothing.
- [ ] Player2: B's sheet, the directory and the chat show no sign of mythic power.
- [ ] GM: **Disable** A. The Calling and mythic feats leave the sheet, Hero Points return, the badge turns
      grey. Player1 sees no mythic content on A.
- [ ] GM: **Enable** A. The Calling, feats and points come back exactly as before. Ledger shows both steps.
- [ ] GM: **Revoke** C after granting it: a confirmation appears, then all mythic state and items are gone.

## Calling picker

- [ ] Player1: the picker opens after the grant and from the sheet banner until a Calling is chosen.
- [ ] Each Calling shows skills, daily regain, edicts and anathema. Source filter follows the console's
      **Calling sources** menu.
- [ ] Taking a Calling puts it in the `mythic-calling` slot; PF2e grants Rewrite Fate, Mythic Points max 3,
      Hero Points 0.
- [ ] GM: grant B with "GM assigns" and a Calling: Player2 never sees the picker; the Calling is on B.

## Sheet and visibility

- [ ] Player1: A's Feats tab shows the Mythic banner (Calling, progression, points, edicts and anathema) and
      the open-slot badge.
- [ ] Player1: C's sheet (same owner, not granted) shows no mythic group, banner or points.
- [ ] Player1: dragging a mythic feat, Calling or destiny onto C is blocked.
- [ ] Player2 (no mythic character): the Compendium Browser shows no mythic, Calling or destiny feats.
      Player1 (owns A) does see them.

## Mythic feat picker and approval

- [ ] Player1: **Choose feat…** on an open slot lists only eligible feats; ineligible ones show the reason
      when shown.
- [ ] At slot 12 only destiny feats are offered; a second destiny is refused.
- [ ] GM: turn on **Require GM approval**. Player1's pick goes to the GM as a request; approving it adds the
      feat; rejecting it informs Player1 only.

## Mythic Console and points

- [ ] GM: the Token Controls button opens the console. Players have no such button.
- [ ] Per-character switch enables and disables the character (same as the directory menu).
- [ ] **Edict +1**, **±** custom and **Anathema** change A's points within 0-3 and add ledger lines.
- [ ] **Start Session**: every enabled mythic character goes to 3, the session number increases.
- [ ] **Mythic Deed**: +3 (capped at 3) to every enabled mythic character only.
- [ ] Ledger undo restores the previous point value.
- [ ] Player1: sees A's points change on the sheet; sees no console, ledger or GM cards.

## Automation

- [ ] Defeat the mythic NPC in combat: the GM gets a whispered card suggesting 2 for the last blow, 1 for the
      other enabled mythic characters. **Award**, **Change killer…** and **Ignore** work. Players see nothing.
- [ ] Critical success with a Calling action (first time that in-game day): a card offers +1 point to the GM
      and the owner. A second critical success the same day doesn't prompt.
      Recall Knowledge only has a DC (and an outcome) when rolled with a skill that identifies the target
      (Nature for an animal). It is a secret check: by default only the GM gets the card; roll it publicly to
      check the player's **Restore** button.
- [ ] Mythic death on: A reaching dying 4 gains doomed +1 and stabilizes at 0 HP with a chat card; ledger
      undo works. Off: PF2e's normal dying applies.
- [ ] Hero Points for non-mythic characters on: a mythic award gives C a Hero Point; the card doesn't
      mention mythic power.

## Mythic trials and tiers

- [ ] GM: set PF2e Mythic Rules to `Alternate Mythic Progression`. Grant B with **Mythic trials**: tier 0,
      1 trial.
- [ ] GM: with the PF2e setting on `Enabled` instead, **+ Trial** warns that tiers have no effect.
- [ ] GM: **+ Trial** with a note twice: B reaches tier 1 (3 trials). The `mythic-2` slot opens on B's
      sheet. Player2 and the GM get the whispered "Mythic tier 1" card; Player1 doesn't.
- [ ] Ledger shows a "trial" line with the note and a "tier" line.
- [ ] **+ Trial** twice more in the same session: tier stays 1 and the GM is told the next tier waits.
- [ ] **Start Session**: B rises to tier 2 on its own, with the card.
- [ ] A tier above half B's level warns the GM.

## Late start

- [ ] GM: grant a level 7 character with **Late start**: 3 slots owed (2, 4, 6), all locked on the sheet and
      blocked in the picker.
- [ ] **Release feat** in the console: slot 2 opens, owners and GM get "A mythic feat slot is open (1 of 3
      caught up)", ledger has a "lateStart" line.
- [ ] **Start Session**: one more slot opens (setting default 1); a second Start Session in a row opens the
      next one. Releasing when caught up shows a notice and changes nothing.
- [ ] Level the character to 8: slot 8 opens normally even while catch-up slots are still locked.

## Release install

- [ ] In a clean Foundry 14 + PF2e world, install from
      `https://github.com/sargas79/sargas-mythic-powers/releases/latest/download/module.json`; the module
      loads and `game.modules.get("sargas-mythic-powers").api` lists the API functions.
