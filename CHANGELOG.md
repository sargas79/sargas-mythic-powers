# Changelog

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
