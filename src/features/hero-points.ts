/**
 * OWNER: agent D. Feature "hero-points" (mixed play, issue #17). When the `heroPointsMixed` setting is on,
 * every mythic deed or kill award also gives +1 Hero Point to each player-owned character without active
 * mythic power. The card whispered to the owners is neutral: it never mentions mythic power.
 */
import { TEMPLATE_PATH } from "../constants.js";
import { t } from "../foundry/i18n.js";
import { appendLedger } from "../foundry/ledger.js";
import { heroPointsAfter, MAX_HERO_POINTS } from "../rules/console.js";
import { isCharacter, isMythicActive } from "../state/flags.js";
import type { Feature } from "./types.js";

/** Non-GM users who own the actor. */
export function playerOwners(actor: ActorPF2e): UserDoc[] {
  return (game.users?.contents ?? []).filter(
    (u: UserDoc) => !u.isGM && actor?.testUserPermission?.(u, "OWNER"),
  );
}

/** Player-owned characters without active mythic power. */
export function heroPointCandidates(): ActorPF2e[] {
  return (game.actors?.contents ?? []).filter(
    (a: ActorPF2e) => isCharacter(a) && a.hasPlayerOwner && !isMythicActive(a),
  );
}

/** GM only. +1 Hero Point (max 3) to each candidate, with a neutral whisper to that character's owners. */
export async function awardHeroPoints(): Promise<void> {
  if (!game.user?.isGM) return;
  for (const actor of heroPointCandidates()) {
    const hp = actor.system?.resources?.heroPoints;
    const next = heroPointsAfter(Number(hp?.value ?? 0), Number(hp?.max ?? MAX_HERO_POINTS));
    if (next === null) continue;
    await actor.update({ "system.resources.heroPoints.value": next });
    const owners = playerOwners(actor);
    if (owners.length > 0) {
      const content = await foundry.applications.handlebars.renderTemplate(
        `${TEMPLATE_PATH}/points-card.hbs`,
        {
          title: t("console.heroPoint.title"),
          body: t("console.heroPoint.body"),
          value: next,
          max: MAX_HERO_POINTS,
          valueLabel: t("console.heroPoint.value", { value: next, max: MAX_HERO_POINTS }),
        },
      );
      await ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: owners.map((u: UserDoc) => u.id),
      });
    }
    await appendLedger({
      kind: "heroPoint",
      actorUuid: actor.uuid ?? null,
      actorName: actor.name ?? null,
      message: t("console.ledger.heroPoint", { name: actor.name, value: next, max: MAX_HERO_POINTS }),
    });
  }
}

export const feature: Feature = {
  id: "hero-points",
  register() {},
};
