# Changelog

## 0.2.0

- Mythic NPCs: a Make Mythic template for any NPC following the War of Immortals ability table, with Mythic
  Resistance and Immunity automated against non-mythic Strikes; Remove Mythic Template reverts it.
- NPC Mythic Points: Reroll (Mythic Point) chat option, automatic Mythic Skill spend, Spend buttons on Recharge
  and Remove a Condition cards, and a reset at combat start.
- GM prompts for Undying Myth (the mythic kill prompt waits for it) and Mythic Defenses.
- Mythic Console: Encounter section for mythic NPCs in the current combat.
- A GM with the game open in two tabs (or two browsers) no longer gets every GM action twice. The GM's
  clients elect one of them to run socket requests and the GM-only automation (feat requests, daily regain
  and mythic kill prompts, first-Calling points). When that tab closes, another takes over within about
  three seconds.

## 0.1.1

Fixes from a two-client live test (GM + player).

- Calling daily regain: checks rolled against a DC instead of a target statistic (Recall Knowledge against
  a creature) now use the roller's target, so the card names the creature and Sage's or Hunter's Calling
  no longer asks the GM to confirm the target is an enemy.
- Mythic death: the Mythic Console ledger offers Undo on mythic death entries, not only on points
  entries. Undo from the console or the chat card restores the character once and updates both.
- Mythic death undo no longer leaves a second Unconscious (and Blinded) condition when dying comes back.
- Mythic feat requests resolved from the Mythic Console no longer leave live Approve / Reject buttons on
  the GM chat card.
- The grant card's **Choose Calling** button disappears once the character has a Calling.

## 0.1.0

First release.

- Per-character mythic power: the GM grants, enables, disables and revokes it from the Actors directory.
  Disabling keeps the Calling and mythic feats so enabling restores them.
- Characters without an active grant show no sign of mythic power: the mythic feat group is hidden,
  mythic feats can't be dropped on them, and players with no mythic character see no mythic entries in the
  Compendium Browser.
- Grant dialog with source of power, progression (standard, late start, mythic trials), Calling choice
  (player or GM), starting points and an owners-only announcement.
- Calling picker with mythic-proficiency skills, daily regain, edicts and anathema, filtered by source book.
- Mythic banner and slot states on the PF2e character sheet.
- Mythic feat picker that shows only the feats a character can take, with reasons for the rest, and an
  optional GM approval queue.
- GM Mythic Console: per-character switch, points, tier and trials, awards (edict, anathema, custom, mythic
  deed, mythic kill), Start Session and a ledger with undo.
- Automation prompts: mythic kill award, Calling daily regain, optional mythic death rules, optional Hero
  Points for non-mythic characters in mixed play.
- Mythic trials and tiers (Alternate Mythic Progression): trial log, tier thresholds, at most one tier per
  session, held-back tiers applied at the next Start Session, warning above half level.
- Late start catch-up: owed slots released per session (setting) or by hand from the console.
- Public API at `game.modules.get("sargas-mythic-powers").api`.
