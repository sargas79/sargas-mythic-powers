# Mythic NPCs: plan

Rules: _War of Immortals_ pg. 168, [Mythic Monster Templates](https://2e.aonprd.com/Rules.aspx?ID=3340) and
[Basic Mythic Abilities](https://2e.aonprd.com/Rules.aspx?ID=3341).

## What PF2e 8.5.1 already does

- An NPC with the `mythic` trait gets `system.resources.mythicPoints` with max 3 (value defaults to 3).
- Pack `pf2e.bestiary-family-ability-glossary` holds every basic mythic ability as an `action` item, named
  "(Mythic) …" with an `ItemAlteration` rule that renames it to the localized name:

  | Ability            | Id                 | Automated in PF2e                                                                        |
  | ------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
  | Mythic Resilience  | `0zvUNv8hRTdwXmhF` | yes: `AdjustDegreeOfSuccess` on fortitude, reflex and will (trim to the chosen saves)    |
  | Mythic Resistance  | `anjtXUW6krim20UM` | no                                                                                       |
  | Mythic Power       | `jNW79frpM2miwJvD` | no (description only)                                                                    |
  | Mythic Skill       | `gNxphcYARRn2bZ1i` | toggle `mythic-skill` + `FlatModifier` +4 on `skill-check` (narrow to the chosen skills) |
  | Recharge           | `Amur69xCgfyCsY34` | no                                                                                       |
  | Recharge Spell     | `HhD6EWTdYOyH6Rbr` | no                                                                                       |
  | Remove a Condition | `ta5reS33mtwBHWzX` | no                                                                                       |
  | Reroll             | `MFADnbvNMY9AQNzG` | no (PF2e's reroll menu spends Mythic Points for characters only)                         |
  | Undying Myth       | `fnwTADEGOKtTxDPu` | no                                                                                       |
  | Mythic Defenses    | `exNN1xhUYQXMRN7x` | no                                                                                       |
  | Mythic Immunity    | `CvKc38D8oaZEq0Xu` | no                                                                                       |

## Abilities by level

| Level | Ability                                                                         |
| ----- | ------------------------------------------------------------------------------- |
| 1     | Mythic Resilience (one save) **or** Mythic Resistance                           |
| 4     | Mythic Power: Mythic Skill (one skill; two at 12+) **or** Remove a Condition    |
| 7     | Mythic Resilience (one save) **or** Mythic Resistance                           |
| 10    | Mythic Power: Recharge (Recharge Spell for spellcasters)                        |
| 13    | Mythic Resilience (one save) **or** Mythic Resistance                           |
| 17    | Mythic Power: Undying Myth                                                      |
| 20    | Mythic Power: Reroll **or** Mythic Defenses                                     |
| 23+   | Mythic Immunity: Strikes **or** spells (both is allowed, intended for level 25) |

- Mythic Resilience: chosen saves treat each result one degree better. Each pick adds one save, highest saves first.
- Mythic Resistance: resistance to all Strikes from non-mythic creatures equal to half level. A second pick raises it
  to full level. Mythic weapons bypass it even if the wielder isn't mythic.
- Mythic Immunity: immune to harmful spells from non-mythic creatures, or to Strikes with non-mythic weapons and
  unarmed Strikes from non-mythic characters.

## Features

1. **Make Mythic template (GM only).** "Make Mythic…" / "Remove Mythic" in the actor directory context menu for NPCs
   and on the NPC sheet header (also works for unlinked token actors from their sheet). The dialog lists each level
   step the creature qualifies for, with the default choice preselected (resilience on the highest save; Mythic Skill
   on the highest skill; Recharge Spell when the NPC has spellcasting entries). Applying:
   - adds the `mythic` trait (remembering whether it was already there);
   - copies the glossary items, trimmed to the choices (resilience selectors, Mythic Skill selectors, names like
     "Mythic Resilience (Fortitude, Will)");
   - adds `Resistance` / `Immunity` rule elements of type `custom` with a `definition` predicate for non-mythic
     Strikes (and harmful spells), with a "Mythic Resistance" / "Mythic Immunity" label;
   - sets Mythic Points to 3;
   - stores `flags.sargas-mythic-powers.npc = { applied, level, choices, itemIds, addedTrait }` so Remove Mythic
     deletes exactly what was added.
   - NPCs that are already mythic from the bestiary (trait present, no module flag) are left alone; the dialog says so.
2. **Spending Mythic Points (GM only).**
   - Chat context option "Reroll (Mythic Point)" on failed checks by mythic NPCs that own the Reroll ability and have
     points: normal reroll (keep new), then −1 point.
   - Mythic Skill: when a mythic NPC's skill check carries the `mythic-skill` roll option, deduct 1 point and turn the
     toggle off.
   - Chat cards for Recharge, Recharge Spell and Remove a Condition get a GM "Spend Mythic Point" button. Remove a
     Condition then offers the NPC's current conditions to remove.
   - Combat start sets every mythic NPC combatant to its max Mythic Points (setting, default on).
3. **Prompts (GM only, never automatic).**
   - Undying Myth: a mythic NPC with Undying Myth and ≥ 1 point drops to 0 HP → whispered card "Undying Myth: stand up
     with N HP (spends all Mythic Points)" with Use / Let it fall. Use restores 50% max HP, removes dying/unconscious/dead
     state and sets points to 0. The mythic kill prompt waits until the GM declines Undying Myth.
   - Mythic Defenses: a critical-success attack roll against a creature with Mythic Defenses → card "Mythic Defenses:
     the attack must be rerolled" with a Reroll button (reroll, keep new).
4. **Mythic Console: Encounter section.** Mythic NPCs in the active combat with points pips (click to set) and
   their mythic abilities listed.

## Settings

`npcResetOnCombat` (default on), `undyingPrompt` (default on), `defensesPrompt` (default on).
