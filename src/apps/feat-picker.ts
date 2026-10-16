/**
 * OWNER: agent C. Mythic feat picker window (mockup M4, issue #13). Opened for one mythic slot of an actor
 * whose mythic power is active; only owners and GMs can open it. Lists the PF2e mythic feats with their
 * eligibility for that slot; filters run in the browser without re-rendering.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { notify, t } from "../foundry/i18n.js";
import { isDestinyFeat } from "../rules/eligibility.js";
import { slotLevel } from "../rules/progression.js";
import { addFeatDirectly, needsApproval, requestFeat } from "../services/feat-requests.js";
import { evaluateFeat, loadMythicFeats, noteText, snapshotFromActor } from "../services/mythic-feats.js";
import { featInSlot } from "../state/actor-mythic.js";
import { getState, isMythicActive } from "../state/flags.js";

type Status = "eligible" | "pending" | "ineligible" | "owned";
const STATUS_ORDER: Record<Status, number> = { eligible: 0, pending: 1, ineligible: 2, owned: 3 };

interface FeatRow {
  uuid: string;
  name: string;
  img: string;
  level: number;
  publication: string;
  destiny: boolean;
  status: Status;
  canAdd: boolean;
  draggable: boolean;
  isPending: boolean;
  reasons: string;
  warnings: string;
}

interface Filters {
  maxLevel: number;
  eligible: boolean;
  ineligible: boolean;
  owned: boolean;
  sources: Set<string> | null;
  search: string;
}

const api = () => foundry.applications.api;

let PickerClass: any = null;
const instances = new Map<string, any>();

function definePicker(): any {
  if (PickerClass) return PickerClass;
  const Base = api().HandlebarsApplicationMixin(api().ApplicationV2) as any;

  class FeatPicker extends Base {
    static DEFAULT_OPTIONS = {
      classes: ["smp-feat-picker-app"],
      tag: "div",
      window: { icon: "fa-solid fa-dragon", resizable: true },
      position: { width: 720, height: 640 },
      actions: {
        addFeat: FeatPicker.#onAdd,
        openFeat: FeatPicker.#onOpen,
        closePicker: FeatPicker.#onClosePicker,
      },
    };

    static PARTS = {
      body: { template: `${TEMPLATE_PATH}/feat-picker.hbs`, scrollable: [".smp-fp-list"] },
    };

    actor: ActorPF2e;
    slotId: string;
    filters: Filters;
    #hooks: [string, number][] = [];
    #renderTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(actor: ActorPF2e, slotId: string) {
      super({ id: `${MODULE_ID}-feat-picker-${actor.id}-${slotId}` });
      this.actor = actor;
      this.slotId = slotId;
      const level = slotLevel(slotId) ?? 0;
      this.filters = {
        maxLevel: level,
        eligible: true,
        ineligible: true,
        owned: false,
        sources: null,
        search: "",
      };
    }

    get title(): string {
      return t("feats.picker.title", { slot: slotLevel(this.slotId) ?? this.slotId, actor: this.actor.name });
    }

    async _prepareContext(options: any): Promise<Record<string, unknown>> {
      const context = await super._prepareContext(options);
      const level = slotLevel(this.slotId) ?? 0;
      const { feats, knownFeatNames } = await loadMythicFeats();
      const snapshot = snapshotFromActor(this.actor);
      const pending = getState(this.actor).pending;
      const slotPending = pending.find((p) => p.slotId === this.slotId) ?? null;
      const approval = needsApproval();
      const filled = !!featInSlot(this.actor, this.slotId);

      const rows: FeatRow[] = [];
      for (const feat of feats) {
        if (feat.level > level) continue;
        if (level === 12 && !isDestinyFeat(feat)) continue;
        const result = evaluateFeat(this.actor, feat, this.slotId, { snapshot, knownFeatNames });
        const isPending = pending.some((p) => p.uuid === feat.uuid);
        const status: Status = result.owned
          ? "owned"
          : isPending
            ? "pending"
            : result.eligible
              ? "eligible"
              : "ineligible";
        const canAdd = status === "eligible" && !slotPending && !filled;
        rows.push({
          uuid: feat.uuid,
          name: feat.name,
          img: feat.img,
          level: feat.level,
          publication: feat.publication,
          destiny: isDestinyFeat(feat),
          status,
          canAdd,
          draggable: canAdd && !approval,
          isPending,
          reasons: result.owned ? "" : result.reasons.map(noteText).join("; "),
          warnings: result.warnings.map(noteText).join("; "),
        });
      }
      rows.sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          b.level - a.level ||
          a.name.localeCompare(b.name),
      );

      const publications = [...new Set(feats.map((f) => f.publication).filter(Boolean))].sort();
      const sources = this.filters.sources;
      const levels: { value: number; selected: boolean }[] = [];
      for (let l = level; l >= 2; l -= 2) levels.push({ value: l, selected: l === this.filters.maxLevel });

      return {
        ...context,
        feats: rows,
        levels,
        filters: this.filters,
        sources: publications.map((p) => ({ name: p, checked: !sources || sources.has(p) })),
        slotPending,
        filled,
        approval,
        pendingText: slotPending ? t("feats.picker.slotPending", { feat: slotPending.name }) : "",
      };
    }

    _onFirstRender(context: any, options: any): void {
      super._onFirstRender?.(context, options);
      const rerender = (doc: any) => {
        const actor = doc?.documentName === "Actor" ? doc : doc?.parent;
        if (actor?.id !== this.actor.id) return;
        if (!isMythicActive(this.actor)) {
          void this.close();
          return;
        }
        if (this.#renderTimer) clearTimeout(this.#renderTimer);
        this.#renderTimer = setTimeout(() => void this.render(), 100);
      };
      for (const hook of ["createItem", "updateItem", "deleteItem", "updateActor"]) {
        this.#hooks.push([hook, Hooks.on(hook, rerender)]);
      }
    }

    _onClose(options: any): void {
      super._onClose?.(options);
      for (const [hook, id] of this.#hooks) Hooks.off(hook, id);
      this.#hooks = [];
      if (this.#renderTimer) clearTimeout(this.#renderTimer);
      instances.delete(this.id);
    }

    _onRender(context: any, options: any): void {
      super._onRender?.(context, options);
      const root: HTMLElement = this.element;
      root.querySelectorAll<HTMLElement>(".smp-fp-row[draggable='true']").forEach((row) => {
        row.addEventListener("dragstart", (event: DragEvent) => {
          event.dataTransfer?.setData("text/plain", JSON.stringify({ type: "Item", uuid: row.dataset.uuid }));
        });
      });
      root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-filter]").forEach((input) => {
        input.addEventListener("input", () => this.#readFilters());
        input.addEventListener("change", () => this.#readFilters());
      });
      this.#applyFilters();
    }

    #readFilters(): void {
      const root: HTMLElement = this.element;
      const value = (name: string) => root.querySelector<HTMLInputElement>(`[data-filter="${name}"]`);
      this.filters.maxLevel = Number(
        root.querySelector<HTMLSelectElement>("[data-filter='level']")?.value ?? this.filters.maxLevel,
      );
      this.filters.eligible = !!value("eligible")?.checked;
      this.filters.ineligible = !!value("ineligible")?.checked;
      this.filters.owned = !!value("owned")?.checked;
      this.filters.search = value("search")?.value ?? "";
      const sources = new Set<string>();
      root.querySelectorAll<HTMLInputElement>("[data-filter='source']").forEach((box) => {
        if (box.checked) sources.add(box.value);
      });
      this.filters.sources = sources;
      this.#applyFilters();
    }

    #applyFilters(): void {
      const root: HTMLElement = this.element;
      const f = this.filters;
      const search = f.search.trim().toLowerCase();
      let shown = 0;
      root.querySelectorAll<HTMLElement>(".smp-fp-row").forEach((row) => {
        const d = row.dataset;
        const status = d.status as Status;
        const statusOk =
          status === "owned"
            ? f.owned
            : status === "ineligible"
              ? f.ineligible
              : f.eligible || status === "pending";
        const visible =
          statusOk &&
          Number(d.level) <= f.maxLevel &&
          (!f.sources || f.sources.has(d.source ?? "")) &&
          (!search || (d.name ?? "").toLowerCase().includes(search));
        row.hidden = !visible;
        if (visible) shown++;
      });
      const empty = root.querySelector<HTMLElement>(".smp-fp-empty");
      if (empty) empty.hidden = shown > 0;
    }

    static async #onAdd(this: FeatPicker, event: Event, target: HTMLElement): Promise<void> {
      event.preventDefault();
      const uuid = target.closest<HTMLElement>(".smp-fp-row")?.dataset.uuid;
      if (!uuid) return;
      target.setAttribute("disabled", "");
      try {
        if (needsApproval()) {
          await requestFeat(this.actor, uuid, this.slotId);
        } else if (await addFeatDirectly(this.actor, uuid, this.slotId)) {
          await this.close();
          return;
        }
      } catch (error) {
        notify.error("feats.notify.addFailed", {}, error);
      }
      if (this.rendered) target.removeAttribute("disabled");
    }

    static async #onOpen(this: FeatPicker, event: Event, target: HTMLElement): Promise<void> {
      event.preventDefault();
      const uuid = target.closest<HTMLElement>(".smp-fp-row")?.dataset.uuid;
      const item = uuid ? await fromUuid(uuid) : null;
      item?.sheet?.render(true);
    }

    static async #onClosePicker(this: FeatPicker): Promise<void> {
      await this.close();
    }
  }

  PickerClass = FeatPicker;
  return PickerClass;
}

/** Opens the picker for one mythic slot ("mythic-N"). Owners and GMs of an actor with active mythic power. */
export async function openFeatPicker(actor: ActorPF2e, slotId: string): Promise<void> {
  if (!actor || !isMythicActive(actor)) return;
  if (!(game.user.isGM || actor.isOwner)) return;
  if (slotLevel(slotId) === null) return;
  const Picker = definePicker();
  const id = `${MODULE_ID}-feat-picker-${actor.id}-${slotId}`;
  let app = instances.get(id);
  if (!app) {
    app = new Picker(actor, slotId);
    instances.set(id, app);
  }
  await app.render({ force: true });
  app.bringToFront?.();
}
