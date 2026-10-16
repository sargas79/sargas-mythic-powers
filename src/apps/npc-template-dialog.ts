/**
 * OWNER: agent X. Make Mythic dialog for NPCs (docs/mythic-npcs.md, feature 1). GM only. One row per level
 * step the NPC qualifies for, defaults preselected, save and skill selects from the NPC's own statistics,
 * and a live summary of what will be added. Bestiary mythic NPCs get an info note; applied templates offer
 * Remove.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { esc, notify, t } from "../foundry/i18n.js";
import {
  defaultChoices,
  resolveChoices,
  savesByModifier,
  SAVES,
  skillCount,
  skillsByModifier,
  templateSteps,
  type ResolvedTemplate,
  type SaveSlug,
  type StepChoice,
  type StepId,
  type StepOption,
  type TemplateChoices,
} from "../rules/npc-template.js";
import {
  applyMythicTemplate,
  getTemplateFlag,
  isBestiaryMythic,
  isNpc,
  isTemplateApplied,
  npcLevel,
  npcSnapshot,
  removeMythicTemplate,
  saveLabel,
  skillLabel,
} from "../services/npc-template.js";

let DialogClass: any = null;

const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));

function optionLabel(option: StepOption, hasSpellcasting: boolean): string {
  if (option === "recharge" && hasSpellcasting) return t("npcTemplate.options.rechargeSpell");
  return t(`npcTemplate.options.${option}`);
}

/** Reads the current choices from the form. */
function readChoices(root: HTMLElement, level: number): TemplateChoices {
  const choices: TemplateChoices = {};
  for (const step of templateSteps(level)) {
    const checked = root.querySelector<HTMLInputElement>(`input[name="${step.id}.option"]:checked`);
    const choice: StepChoice = { option: (checked?.value ?? step.default) as StepOption };
    const save = root.querySelector<HTMLSelectElement>(`select[name="${step.id}.save"]`)?.value;
    if (save && (SAVES as readonly string[]).includes(save)) choice.save = save as SaveSlug;
    const skills = [...root.querySelectorAll<HTMLSelectElement>(`select[data-skill-step="${step.id}"]`)]
      .map((s) => s.value)
      .filter(Boolean);
    if (skills.length) choice.skills = skills;
    choices[step.id] = choice;
  }
  return choices;
}

function summaryHtml(actor: ActorPF2e, resolved: ResolvedTemplate, hasSpellcasting: boolean): string {
  const lines: string[] = [];
  for (const a of resolved.abilities) {
    switch (a.key) {
      case "power":
        lines.push(t("npcTemplate.summary.power"));
        break;
      case "resilience":
        lines.push(t("npcTemplate.summary.resilience", { saves: (a.saves ?? []).map(saveLabel).join(", ") }));
        break;
      case "resistance":
        lines.push(t("npcTemplate.summary.resistance", { value: a.value ?? 0 }));
        break;
      case "skill":
        lines.push(
          a.skills?.length
            ? t("npcTemplate.summary.skill", { skills: a.skills.map((s) => skillLabel(actor, s)).join(", ") })
            : t("npcTemplate.summary.skillAny"),
        );
        break;
      case "immunity":
        lines.push(
          t("npcTemplate.summary.immunity", {
            kinds: (a.immunity ?? []).map((k) => t(`npcTemplate.immunity.${k}`)).join(", "),
          }),
        );
        break;
      default:
        lines.push(
          optionLabel(a.key === "rechargeSpell" ? "recharge" : (a.key as StepOption), hasSpellcasting),
        );
    }
  }
  lines.push(t("npcTemplate.summary.trait"));
  lines.push(t("npcTemplate.summary.points"));
  return `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

function buildClass(): any {
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
  const Base = HandlebarsApplicationMixin(ApplicationV2);

  return class NpcTemplateDialogApp extends Base {
    actor: ActorPF2e;

    constructor(actor: ActorPF2e, options: Record<string, unknown> = {}) {
      super(options);
      this.actor = actor;
    }

    static DEFAULT_OPTIONS = {
      tag: "form",
      classes: ["smp-npct-dialog"],
      window: { icon: "fa-solid fa-dragon", contentClasses: ["standard-form"] },
      position: { width: 480, height: "auto" },
      form: { handler: NpcTemplateDialogApp.#onSubmit, closeOnSubmit: false, submitOnChange: false },
      actions: { remove: NpcTemplateDialogApp.#onRemove },
    };

    static PARTS = {
      form: { template: `${TEMPLATE_PATH}/npc-template-dialog.hbs` },
      footer: { template: `${TEMPLATE_PATH}/npc-template-dialog-footer.hbs` },
    };

    get title(): string {
      return t("npcTemplate.dialog.title", { name: this.actor.name });
    }

    async _prepareContext(): Promise<Record<string, unknown>> {
      const actor = this.actor;
      const level = npcLevel(actor);
      const snapshot = npcSnapshot(actor);
      const applied = isTemplateApplied(actor);
      const bestiary = isBestiaryMythic(actor);
      const defaults = defaultChoices(level, snapshot);
      const saveOrder = savesByModifier(snapshot.saves);
      const skillOrder = skillsByModifier(snapshot.skills);

      const steps = templateSteps(level).map((step) => {
        const choice = defaults[step.id];
        const single = step.options.length === 1;
        const saves = saveOrder.map((s) => ({
          value: s,
          label: `${saveLabel(s)} ${signed(snapshot.saves[s])}`,
          selected: s === choice?.save,
        }));
        const skillSelects =
          step.id === "l4" && skillOrder.length
            ? Array.from({ length: Math.min(skillCount(level), skillOrder.length) }, (_, i) => ({
                step: step.id,
                index: i,
                options: skillOrder.map((s) => ({
                  value: s,
                  label: `${skillLabel(actor, s)} ${signed(snapshot.skills[s] ?? 0)}`,
                  selected: s === choice?.skills?.[i],
                })),
              }))
            : [];
        return {
          id: step.id,
          label: t(`npcTemplate.steps.${step.id}`, { level: step.level }),
          single,
          singleLabel: single ? optionLabel(step.options[0] as StepOption, snapshot.hasSpellcasting) : "",
          options: step.options.map((o) => ({
            value: o,
            label: optionLabel(o, snapshot.hasSpellcasting),
            checked: o === (choice?.option ?? step.default),
          })),
          hasSave: step.kind === "defense",
          saves,
          skillSelects,
        };
      });

      const flag = getTemplateFlag(actor);
      const appliedItems = applied
        ? (flag?.itemIds ?? []).map((id) => actor.items?.get(id)?.name).filter(Boolean)
        : [];

      return {
        actorName: actor.name,
        level,
        applied,
        bestiary,
        canApply: !applied && !bestiary && isNpc(actor),
        hasSteps: steps.length > 0,
        steps,
        appliedItems,
        appliedNote: t("npcTemplate.dialog.appliedNote", { name: actor.name, level: flag?.level ?? level }),
        bestiaryNote: t("npcTemplate.dialog.bestiaryNote", { name: actor.name }),
        intro: t("npcTemplate.dialog.intro", { name: actor.name, level }),
      };
    }

    _onRender(context: unknown, options: unknown): void {
      super._onRender?.(context, options);
      const root = this.element as HTMLElement;
      const level = npcLevel(this.actor);
      const snapshot = npcSnapshot(this.actor);
      const sync = () => {
        const choices = readChoices(root, level);
        for (const [id, choice] of Object.entries(choices) as [StepId, StepChoice][]) {
          const save = root.querySelector<HTMLElement>(`[data-save-for="${id}"]`);
          if (save) save.hidden = choice.option !== "resilience";
          const skills = root.querySelector<HTMLElement>(`[data-skills-for="${id}"]`);
          if (skills) skills.hidden = choice.option !== "skill";
        }
        const summary = root.querySelector<HTMLElement>(".smp-npct-summary-list");
        if (summary) {
          summary.innerHTML = summaryHtml(
            this.actor,
            resolveChoices(level, choices, snapshot),
            snapshot.hasSpellcasting,
          );
        }
      };
      root.querySelectorAll("input, select").forEach((el) => el.addEventListener("change", sync));
      sync();
    }

    static async #onSubmit(this: any, _event: Event, form: HTMLFormElement): Promise<void> {
      if (!isNpc(this.actor) || isTemplateApplied(this.actor) || isBestiaryMythic(this.actor)) return;
      const choices = readChoices(form, npcLevel(this.actor));
      const ok = await applyMythicTemplate(this.actor, choices);
      if (ok) await this.close();
    }

    static async #onRemove(this: any): Promise<void> {
      const ok = await confirmRemove(this.actor);
      if (!ok) return;
      if (await removeMythicTemplate(this.actor)) await this.close();
    }
  };
}

/** Asks the GM to confirm removing the template. */
export async function confirmRemove(actor: ActorPF2e): Promise<boolean> {
  const result = await foundry.applications.api.DialogV2.confirm({
    window: { title: t("npcTemplate.remove.title", { name: actor.name }), icon: "fa-solid fa-dragon" },
    content: `<p>${esc(t("npcTemplate.remove.content", { name: actor.name }))}</p>`,
    rejectClose: false,
  });
  return result === true;
}

/** GM only. Opens the Make Mythic dialog for an NPC (one window per actor). */
export async function openNpcTemplateDialog(actor: ActorPF2e): Promise<void> {
  if (!game.user?.isGM) {
    notify.warn("errors.gmOnly");
    return;
  }
  if (!isNpc(actor)) {
    notify.warn("npcTemplate.errors.notNpc");
    return;
  }
  DialogClass ??= buildClass();
  const id = `${MODULE_ID}-npct-${String(actor.uuid).replace(/[^\w-]/g, "-")}`;
  const existing = foundry.applications.instances?.get(id);
  if (existing) {
    existing.render({ force: true });
    existing.bringToFront?.();
    return;
  }
  await new DialogClass(actor, { id }).render({ force: true });
}
