/**
 * Grant Mythic Power dialog (mockup M1). GM only. Collects the source of power, progression mode, who picks
 * the Calling (with the Calling list when the GM assigns it), starting points and the announcement choice,
 * then calls grantMythic.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { notify, t } from "../foundry/i18n.js";
import { getPf2eMythicMode } from "../foundry/settings.js";
import { owedFeats } from "../rules/suspend.js";
import type { Progression } from "../rules/progression.js";
import { loadCallings, type CallingInfo } from "../services/callings.js";
import { announcementsEnabled, grantMythic } from "../services/mythic-service.js";

let DialogClass: any = null;

function buildClass(): any {
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
  const Base = HandlebarsApplicationMixin(ApplicationV2);

  return class GrantDialogApp extends Base {
    actor: ActorPF2e;
    callings: CallingInfo[] | null = null;

    constructor(actor: ActorPF2e, options: Record<string, unknown> = {}) {
      super(options);
      this.actor = actor;
    }

    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-grant`,
      tag: "form",
      classes: ["smp-grant-dialog"],
      window: { icon: "fa-solid fa-star", contentClasses: ["standard-form"] },
      position: { width: 460, height: "auto" },
      form: { handler: GrantDialogApp.#onSubmit, closeOnSubmit: false, submitOnChange: false },
    };

    static PARTS = {
      form: { template: `${TEMPLATE_PATH}/grant-dialog.hbs` },
    };

    get title(): string {
      return t("grant.dialog.title", { name: this.actor.name });
    }

    async _prepareContext(): Promise<Record<string, unknown>> {
      if (this.callings === null) {
        try {
          this.callings = await loadCallings();
        } catch (error) {
          console.error(`${MODULE_ID} |`, error);
          this.callings = [];
        }
      }
      const level = Number(this.actor.level ?? 1);
      const name = this.actor.name;
      const tiersOn = getPf2eMythicMode() === "variant-tiers";
      const progression = (p: Progression, hint: string) => ({
        value: p,
        label: t(`grant.progression.${p}.label`),
        hint,
        checked: p === "standard",
      });
      return {
        actorName: name,
        progressions: [
          progression(
            "standard",
            t("grant.progression.standard.hint", { name, level, count: owedFeats("standard", level) }),
          ),
          progression(
            "lateStart",
            t("grant.progression.lateStart.hint", { name, level, count: owedFeats("lateStart", level) }),
          ),
          progression(
            "trials",
            t(tiersOn ? "grant.progression.trials.hint" : "grant.progression.trials.hintNoTiers"),
          ),
        ],
        callings: (this.callings ?? []).map((c) => ({ uuid: c.uuid, name: c.name, source: c.source })),
        hasCallings: (this.callings ?? []).length > 0,
        announce: announcementsEnabled(),
        announceLabel: t("grant.dialog.announce", { name }),
        sourcePlaceholder: t("grant.dialog.sourcePlaceholder"),
      };
    }

    _onRender(context: unknown, options: unknown): void {
      super._onRender?.(context, options);
      const root = this.element as HTMLElement;
      const sync = () => {
        const gm = (root.querySelector('input[name="callingChoice"]:checked') as HTMLInputElement | null)
          ?.value;
        const select = root.querySelector(".smp-grant-calling-select") as HTMLElement | null;
        if (select) select.hidden = gm !== "gm";
      };
      root
        .querySelectorAll('input[name="callingChoice"]')
        .forEach((el) => el.addEventListener("change", sync));
      sync();
    }

    static async #onSubmit(this: any, _event: Event, _form: HTMLFormElement, formData: any): Promise<void> {
      const data = formData.object as Record<string, unknown>;
      const callingChoice = data.callingChoice === "gm" ? "gm" : "player";
      const callingUuid = typeof data.callingUuid === "string" && data.callingUuid ? data.callingUuid : null;
      if (callingChoice === "gm" && !callingUuid) {
        notify.warn("grant.errors.pickCalling");
        return;
      }
      const progression = (["standard", "lateStart", "trials"] as const).includes(data.progression as any)
        ? (data.progression as Progression)
        : "standard";
      await grantMythic(this.actor, {
        source: String(data.source ?? "").trim(),
        progression,
        callingChoice,
        callingUuid,
        startWithFullPoints: !!data.startWithFullPoints,
        announce: !!data.announce,
      });
      await this.close();
    }
  };
}

export const GrantDialog = {
  async open(actor: ActorPF2e): Promise<void> {
    DialogClass ??= buildClass();
    const existing = foundry.applications.instances?.get(`${MODULE_ID}-grant-${actor.id}`);
    if (existing) {
      existing.render({ force: true });
      existing.bringToFront?.();
      return;
    }
    await new DialogClass(actor, { id: `${MODULE_ID}-grant-${actor.id}` }).render({ force: true });
  },
};
