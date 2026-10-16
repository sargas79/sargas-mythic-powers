/**
 * OWNER: agent B. Calling picker window (mockup M2): grid of Callings with search and source filter, a detail
 * pane (mythic proficiency actions, daily regain, edicts, anathema) and Take / Decide later buttons.
 * Opens only for the GM or an owner of an active mythic character who may choose its Calling.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { notify, t } from "../foundry/i18n.js";
import { isMythicActive } from "../state/flags.js";
import { callingItem } from "../state/actor-mythic.js";
import { assignCalling, canChooseCalling, loadCallings, type CallingInfo } from "../services/callings.js";

let PickerClass: any = null;

/** Built lazily so the Foundry globals exist when the class is defined. */
function pickerClass(): any {
  if (PickerClass) return PickerClass;
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

  class CallingPicker extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      classes: ["smp-calling-picker"],
      tag: "div",
      window: { title: `${MODULE_ID}.title`, icon: "fa-solid fa-star", resizable: true },
      position: { width: 820, height: 620 },
      actions: {
        select: CallingPicker.#onSelect,
        take: CallingPicker.#onTake,
        later: CallingPicker.#onLater,
      },
    };

    static PARTS = {
      main: {
        template: `${TEMPLATE_PATH}/calling-picker.hbs`,
        scrollable: [".smp-cp-grid", ".smp-cp-detail"],
      },
    };

    actor: ActorPF2e;
    callings: CallingInfo[] | null = null;
    selected: string | null = null;
    query = "";
    source = "";
    busy = false;

    constructor(options: any = {}) {
      super(options);
      this.actor = options.actor;
    }

    get title(): string {
      return t("callingPicker.title", { actor: this.actor?.name ?? "" });
    }

    async _prepareContext(options: any): Promise<any> {
      const context = await super._prepareContext(options);
      this.callings ??= await loadCallings();
      const current = callingItem(this.actor);
      const sources = [...new Set(this.callings.map((c) => c.source).filter(Boolean))].sort();
      if (this.source && !sources.includes(this.source)) this.source = "";
      const selected = this.callings.find((c) => c.uuid === this.selected) ?? null;
      const replacing = !!current && game.user.isGM;
      return {
        ...context,
        query: this.query,
        source: this.source,
        sources: sources.map((s) => ({ value: s, selected: s === this.source })),
        callings: this.callings.map((c) => ({
          ...c,
          actionsShort: c.actionList.join(" · "),
          on: c.uuid === this.selected,
          hidden: !this.matches(c),
          current: current?.name === c.name,
        })),
        selected,
        current: current?.name ?? null,
        takeLabel: selected
          ? t(replacing ? "callingPicker.replace" : "callingPicker.take", { calling: selected.name })
          : t("callingPicker.take", { calling: "…" }),
        canTake: !!selected && !this.busy && current?.name !== selected.name,
      };
    }

    matches(c: CallingInfo): boolean {
      if (this.source && c.source !== this.source) return false;
      const q = this.query.trim().toLocaleLowerCase();
      if (!q) return true;
      return [c.name, c.actions, c.edicts, c.anathema].some((s) => s.toLocaleLowerCase().includes(q));
    }

    async _onRender(context: any, options: any): Promise<void> {
      await super._onRender(context, options);
      const root: HTMLElement = this.element;
      const search = root.querySelector<HTMLInputElement>("input[name=smp-cp-search]");
      search?.addEventListener("input", () => {
        this.query = search.value;
        this.applyFilter();
      });
      const select = root.querySelector<HTMLSelectElement>("select[name=smp-cp-source]");
      select?.addEventListener("change", () => {
        this.source = select.value;
        this.applyFilter();
      });
    }

    /** Filters cards in place so the search box keeps focus. */
    applyFilter(): void {
      const root: HTMLElement = this.element;
      let shown = 0;
      for (const card of root.querySelectorAll<HTMLElement>(".smp-cp-card")) {
        const c = this.callings?.find((x) => x.uuid === card.dataset.uuid);
        const visible = !!c && this.matches(c);
        card.hidden = !visible;
        if (visible) shown++;
      }
      const empty = root.querySelector<HTMLElement>(".smp-cp-empty");
      if (empty) empty.hidden = shown > 0;
    }

    static #onSelect(this: CallingPicker, _event: Event, target: HTMLElement): void {
      const uuid = target.closest<HTMLElement>("[data-uuid]")?.dataset.uuid;
      if (!uuid) return;
      this.selected = uuid;
      this.render();
    }

    static async #onTake(this: CallingPicker): Promise<void> {
      if (!this.selected || this.busy) return;
      this.busy = true;
      try {
        await assignCalling(this.actor, this.selected);
        if (callingItem(this.actor)) await this.close();
      } finally {
        this.busy = false;
        if (this.rendered) this.render();
      }
    }

    static async #onLater(this: CallingPicker): Promise<void> {
      await this.close();
    }
  }

  PickerClass = CallingPicker;
  return PickerClass;
}

/** Opens the picker for an owner or the GM of an active mythic character. */
export async function openCallingPicker(actor: ActorPF2e): Promise<void> {
  if (!actor || !isMythicActive(actor)) return;
  if (!game.user.isGM && !actor.isOwner) return;
  if (!canChooseCalling(actor)) {
    notify.warn("callingPicker.notAllowed");
    return;
  }
  const id = `${MODULE_ID}-calling-picker-${actor.id}`;
  const existing = foundry.applications.instances?.get(id);
  if (existing) {
    existing.bringToFront?.();
    return;
  }
  const Cls = pickerClass();
  await new Cls({ id, actor }).render({ force: true });
}
