import { Notice, Plugin, TFile, TFolder } from "obsidian";
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

export default class StarTrackerPlugin extends Plugin {
  settings: StarSettings;
  model: Model;
  tracker: StatusTracker;
  views = new Set<{ onDataUpdated(): void }>();

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
    this.addCommand({ id: "create-tracker", name: "Create a tracker", callback: () => new CreateTrackerModal(this.app, this).open() });
    this.addCommand({ id: "add-missing-fields", name: "Add missing fields to task notes", callback: () => new BackfillModal(this.app, this).open() });
    this.addCommand({ id: "new-sprint", name: "Create the next sprint", callback: async () => {
      const file = await createSprint(this);
      await this.app.workspace.getLeaf(true).openFile(file);
    } });

    this.app.workspace.onLayoutReady(() => {
      this.tracker.seed();
      if (this.firstRun) void this.detectTaskTag();
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

  firstRun = false;
  async loadSettings() {
    const saved: unknown = await this.loadData();
    this.firstRun = !saved;
    this.settings = mergeSettings(saved);
  }

  /** On first run, take the task tag from the bases already in the vault (file.hasTag("x") filters). */
  async detectTaskTag() {
    const counts = new Map<string, number>();
    for (const f of this.app.vault.getFiles().filter((x) => x.extension === "base")) {
      try {
        const text = await this.app.vault.cachedRead(f);
        for (const m of text.matchAll(/file\.hasTag\(\s*["']#?([^"']+)["']\s*\)/g)) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
      } catch { /* ignore unreadable files */ }
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[0] !== this.settings.taskTag) {
      this.settings.taskTag = best[0];
      new Notice(`Star Tracker: using #${best[0]} as the task tag, found in your bases. You can change it in settings.`);
    }
    await this.saveSettings();
    this.tracker.seed();
  }
  async saveSettings() {
    await this.saveData(this.settings);
    if (this.model) this.model.s = this.settings;
    for (const v of this.views) { try { v.onDataUpdated(); } catch (e) { console.error(e); } }
  }
}

