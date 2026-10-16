# ORC Notice

> **TODO (maintainer):** the notice wording below was written without access to the official ORC License
> text (paizo.com and azoralaw.com were unreachable from the build environment). Before the next release,
> compare the notice paragraph and the Reserved Material / Expressly Designated Licensed Material sections
> with the official text at <https://paizo.com/orclicense>, correct any differences, add the author list from
> the credits page of _Pathfinder War of Immortals_ to the attribution, then delete this note.
> Tracked in issue #23.

This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067
and available online at various locations including <https://paizo.com/orclicense>,
<https://azoralaw.com/orclicense>, <https://gencon.com/orclicense> and others. All warranties are
disclaimed as set forth therein.

## Attribution

This product is based on the following Licensed Material:

- _Pathfinder War of Immortals_ © 2024, Paizo Inc.

## Scope of Licensed Material in this repository

The only Licensed Material reproduced in this repository is the set of game mechanics in `src/rules/`:

- `progression.ts`: the mythic feat slot levels, the Alternate Mythic Progression trial thresholds per tier,
  the one-tier-per-session guidance, the tier above half level warning and the Mythic Late Start catch-up.
- `awards.ts`: the Mythic Point maximum and the Mythic Point awards for slaying a mythic foe, a mythic deed,
  acting on an edict and violating an anathema.

The module also applies the mythic death rule (doomed instead of dying 4, death at doomed 4) and the
Calling daily regain. Calling and feat text is not copied into this repository: it is read at runtime from
the compendiums of the PF2e system.

If you use or adapt the Licensed Material in this repository, you must include this ORC Notice (or the
equivalent notice from the license) and the attribution above.

## Reserved Material

Reserved Material elements in this product include, but may not be limited to: all trademarks, registered
trademarks, proper nouns (characters, deities, locations, etc., as well as all adjectives, names, titles, and
descriptive terms derived from proper nouns), artworks, characters, dialogue, locations, organizations, plots,
storylines, and trade dress. This repository does not intentionally include any Reserved Material. The
example character names used in documentation and tests are invented.

## Expressly Designated Licensed Material

This product contains no Expressly Designated Licensed Material beyond the mechanics named above.

## Separation from the MIT-licensed code

All other files in this repository (TypeScript sources, templates, styles, tests, documentation) are
licensed under the MIT License in `LICENSE`. The ORC License applies only to the game mechanics identified
above.
