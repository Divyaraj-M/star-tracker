import { BasesPropertyId, Plugin, TFile, TFolder } from "obsidian";
import { StarSettings, mergeSettings } from "./settings";
import { StarSettingTab } from "./settingsTab";
import { BackfillModal, CreateTrackerModal } from "./setup";
import { StatusTracker } from "./tracker";
import { Model, fmOf } from "./util";
import { BOARD_VIEW } from "./views/board";
import { KanbanView } from "./kanban/kanban-view";
import { decorateCard } from "./kanban/decorate";
import { updateBaseFolderReferences } from "./kanban/folder-rename";
import { DASHBOARD_VIEW, StarDashboardView } from "./views/dashboard";
import { WEEKLY_VIEW, StarWeeklyView } from "./views/weekly";
import { TIMELINE_VIEW, StarTimelineView } from "./views/timeline";
import { SPRINT_VIEW, StarSprintView, createSprint, sprintOptions } from "./views/sprint";
import { TrackerIndex, TrackerInfo, TrackerPickerModal } from "./trackers";

export default class StarTrackerPlugin extends Plugin {
  settings: StarSettings;
  model: Model;
  tracker: StatusTracker;
  views = new Set<{ onDataUpdated(): void }>();
  trackers: TrackerIndex;
  ribbonEl: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();
    this.model = new Model(this.app, this.settings);
    this.tracker = new StatusTracker(this);

    const track = <T extends { onDataUpdated(): void; register(cb: () => void): void }>(v: T): T => {
      this.views.add(v);
      v.register(() => this.views.delete(v));
      return v;
    };
    this.registerBasesView(BOARD_VIEW, {
      name: "Star board",
      icon: "lucide-square-kanban",
      factory: (controller, el) => track(new KanbanView(controller, el, this)),
      options: () => KanbanView.getViewOptions(),
    });
    this.registerBasesView(DASHBOARD_VIEW, {
      name: "Star dashboard",
      icon: "lucide-layout-dashboard",
      factory: (controller, el) => track(new StarDashboardView(controller, el, this)),
      options: () => [],
    });
    this.registerBasesView(WEEKLY_VIEW, {
      name: "Star weekly",
      icon: "lucide-calendar-range",
      factory: (controller, el) => track(new StarWeeklyView(controller, el, this)),
      options: () => [],
    });
    this.registerBasesView(TIMELINE_VIEW, {
      name: "Star timeline",
      icon: "lucide-gantt-chart",
      factory: (controller, el) => track(new StarTimelineView(controller, el, this)),
      options: () => [],
    });

    this.registerBasesView(SPRINT_VIEW, {
      name: "Star sprint",
      icon: "lucide-timer",
      factory: (controller, el) => track(new StarSprintView(controller, el, this)),
      options: sprintOptions(this),
    });

    this.addSettingTab(new StarSettingTab(this.app, this));
    this.trackers = new TrackerIndex(this.app);
    this.ribbonEl = this.addRibbonIcon("lucide-square-kanban", "Open tracker", () => void this.openTracker());
    this.refreshRibbon();
    this.addCommand({ id: "open-tracker", name: "Open a tracker", callback: () => void this.openTracker() });
    this.addCommand({ id: "create-tracker", name: "Create a tracker", callback: () => this.openCreateTracker() });
    this.addCommand({ id: "add-missing-fields", name: "Add missing fields to task notes", callback: () => new BackfillModal(this.app, this).open() });
    this.addCommand({ id: "new-sprint", name: "Create the next sprint", callback: async () => {
      const file = await createSprint(this);
      await this.app.workspace.getLeaf(true).openFile(file);
    } });

    this.app.workspace.onLayoutReady(() => {
      this.tracker.seed();
      void this.trackers.scan();
      const rescan = (file: { path: string }) => { if (file.path.endsWith(".base")) void this.trackers.scan(); };
      this.registerEvent(this.app.vault.on("create", rescan));
      this.registerEvent(this.app.vault.on("modify", rescan));
      this.registerEvent(this.app.vault.on("delete", rescan));
      this.registerEvent(this.app.vault.on("rename", rescan));
      this.registerEvent(this.app.metadataCache.on("changed", (file) => {
        this.tracker.onChanged(file);
        // sprint notes are outside most bases, so refresh sprint-aware views ourselves
        if (this.model.isSprint(fmOf(this.app, file))) for (const v of this.views) v.onDataUpdated();
      }));
      this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
        this.tracker.onRename(file, oldPath);
        if (file instanceof TFolder) this.queueFolderRename(oldPath, file.path);
      }));
      this.registerEvent(this.app.vault.on("delete", (file) => this.tracker.onDelete(file)));
    });
  }

  // ---------------- trackers ----------------
  trackerBases(): TrackerInfo[] { return this.trackers ? this.trackers.list : []; }
  openCreateTracker() { new CreateTrackerModal(this.app, this).open(); }
  /** One tracker: open it. Several: show the picker. None: offer to create one. */
  async openTracker() {
    await this.trackers.scan();
    const list = this.trackers.list;
    if (!list.length) { this.openCreateTracker(); return; }
    if (list.length === 1) { await this.app.workspace.getLeaf(false).openFile(list[0].file); return; }
    new TrackerPickerModal(this.app, this, list).open();
  }
  refreshRibbon() {
    if (this.ribbonEl) this.ribbonEl.toggle(this.settings.showRibbon);
  }

  // ---------------- board support (used by the forked Base Board view) ----------------
  getColumnConfig(baseId: string): { columns: string[] } | null {
    return this.settings.columnConfigs[baseId] ?? null;
  }
  async saveColumnConfig(baseId: string, config: { columns: string[] }) {
    this.settings.columnConfigs[baseId] = config;
    await this.saveData(this.settings);
  }
  presetColumns(groupBy: string | null): string[] {
    const f = this.settings.fields;
    if (groupBy === f.status) return this.settings.statuses.map((x) => x.name);
    if (groupBy === f.priority) return this.settings.priorities.map((x) => x.name);
    if (groupBy === f.type) return this.settings.types.map((x) => x.name);
    return [];
  }
  /**
   * Properties shown as chips on board cards. A view's own property list wins, unless
   * it only has the file name or the "use card fields everywhere" setting is on.
   */
  cardProperties(order: BasesPropertyId[]): BasesPropertyId[] {
    const s = this.settings;
    const own = order.filter((p) => p !== "file.name");
    if (own.length && !s.cardFieldsOverride) return order;
    const fields = s.cardFields.map((k) => k.trim()).filter(Boolean).map((k) => (k.includes(".") ? k : `note.${k}`) as BasesPropertyId);
    return ["file.name", ...fields];
  }
  defaultColumnColor(groupBy: string | null, value: string): string | null {
    const f = this.settings.fields;
    if (groupBy === f.status) return this.settings.statuses.find((x) => x.name === value)?.color ?? null;
    if (groupBy === f.priority) return this.settings.priorities.find((x) => x.name === value)?.color ?? null;
    if (groupBy === f.type) return this.settings.types.find((x) => x.name === value)?.color ?? null;
    return null;
  }
  private blocksCache: { at: number; idx: Map<string, TFile[]> } | null = null;
  blocksIndex(): Map<string, TFile[]> {
    const now = Date.now();
    if (!this.blocksCache || now - this.blocksCache.at > 400) this.blocksCache = { at: now, idx: this.model.blocksIndex() };
    return this.blocksCache.idx;
  }
  decorateCard(cardEl: HTMLElement, props: HTMLElement, file: TFile, view: KanbanView) {
    try { decorateCard(this, cardEl, props, file, view.getGroupByProperty()); } catch (e) { console.error("Star Tracker: card decoration failed", e); }
  }

  private pendingRenames: { oldPath: string; newPath: string }[] = [];
  private renameTimer: number | null = null;
  queueFolderRename(oldPath: string, newPath: string) {
    if (oldPath === newPath) return;
    this.pendingRenames.push({ oldPath, newPath });
    if (this.renameTimer !== null) window.clearTimeout(this.renameTimer);
    this.renameTimer = window.setTimeout(async () => {
      this.renameTimer = null;
      const renames = this.pendingRenames;
      this.pendingRenames = [];
      for (const base of this.app.vault.getFiles().filter((x) => x.extension === "base")) {
        try {
          let content = await this.app.vault.read(base);
          let changed = false;
          for (const r of renames) {
            const u = updateBaseFolderReferences(content, r.oldPath, r.newPath);
            if (u !== null) { content = u; changed = true; }
          }
          if (changed) await this.app.vault.modify(base, content);
        } catch (e) { console.error("Star Tracker: folder reference update failed", e); }
      }
    }, 250);
  }

  onunload() {
    if (this.renameTimer !== null) window.clearTimeout(this.renameTimer);
  }

  async loadSettings() {
    const saved: unknown = await this.loadData();
    this.settings = mergeSettings(saved);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.model) this.model.s = this.settings;
    for (const v of this.views) { try { v.onDataUpdated(); } catch (e) { console.error(e); } }
  }
}

