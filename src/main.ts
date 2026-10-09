import { BasesPropertyId, FileView, MarkdownView, Plugin, TFile, TFolder } from "obsidian";
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
import { ActivityLog, monthKey } from "./activity/log";
import { TaskActivityModal } from "./activity/task";
import { ACTIVITY_PANE, ACTIVITY_VIEW, ActivityPane, StarActivityView } from "./activity/view";

export default class StarTrackerPlugin extends Plugin {
  settings: StarSettings;
  model: Model;
  tracker: StatusTracker;
  views = new Set<{ onDataUpdated(): void }>();
  trackers: TrackerIndex;
  activity: ActivityLog;
  ribbonEl: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();
    this.model = new Model(this.app, this.settings);
    this.tracker = new StatusTracker(this);
    this.activity = new ActivityLog(this);

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

    this.registerBasesView(ACTIVITY_VIEW, {
      name: "Star activity",
      icon: "lucide-history",
      factory: (controller, el) => track(new StarActivityView(controller, el, this)),
      options: () => StarActivityView.options(),
    });
    this.registerView(ACTIVITY_PANE, (leaf) => new ActivityPane(leaf, this));

    this.addSettingTab(new StarSettingTab(this.app, this));
    this.trackers = new TrackerIndex(this.app);
    this.ribbonEl = this.addRibbonIcon("lucide-square-kanban", "Open tracker", () => void this.openTracker());
    this.refreshRibbon();
    this.addCommand({ id: "open-tracker", name: "Open a tracker", callback: () => void this.openTracker() });
    this.addCommand({ id: "create-tracker", name: "Create a tracker", callback: () => this.openCreateTracker() });
    this.addCommand({ id: "add-missing-fields", name: "Add missing fields to task notes", callback: () => new BackfillModal(this.app, this).open() });
    this.addCommand({ id: "open-activity", name: "Open activity timeline", callback: () => void this.openActivity() });
    this.addCommand({ id: "task-activity", name: "Show activity for this note", checkCallback: (checking) => {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== "md") return false;
      if (!checking) new TaskActivityModal(this.app, this, file).open();
      return true;
    } });
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

      // activity timeline
      const log = this.activity;
      void log.loadMonths([monthKey(Date.now())]);
      this.registerEvent(this.app.vault.on("create", (f) => void log.onCreate(f)));
      this.registerEvent(this.app.vault.on("modify", (f) => void log.onModify(f)));
      this.registerEvent(this.app.vault.on("rename", (f, old) => log.onRename(f, old)));
      this.registerEvent(this.app.vault.on("delete", (f) => log.onDelete(f)));
      this.registerEvent(this.app.workspace.on("file-open", (f) => void log.onOpen(f)));
      this.registerEvent(this.app.workspace.on("file-menu", (menu, f) => {
        if (!(f instanceof TFile) || f.extension !== "md") return;
        menu.addItem((i) => i.setTitle("Show activity").setIcon("lucide-history").onClick(() => new TaskActivityModal(this.app, this, f).open()));
      }));
      void log.onOpen(this.app.workspace.getActiveFile());

      // activity button in each note's header, next to the edit / reading toggle
      this.addNoteButtons();
      this.registerEvent(this.app.workspace.on("layout-change", () => this.addNoteButtons()));
      this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.addNoteButtons()));
    });
  }

  // ---------------- per-tracker settings ----------------
  private models = new Map<string, Model>();
  /** Settings for a tracker (its .base path). Trackers without their own settings use the main ones. */
  settingsFor(path: string | null): StarSettings {
    const p = path ? this.settings.profiles[path] : undefined;
    return p ? { ...this.settings, ...p } : this.settings;
  }
  modelFor(path: string | null): Model {
    const key = path && this.settings.profiles[path] ? path : "";
    let m = this.models.get(key);
    if (!m) { m = new Model(this.app, this.settingsFor(key || null)); this.models.set(key, m); }
    return m;
  }
  /** Every set of task settings in use: the main one plus each tracker's own. */
  allModels(): Model[] {
    return [this.model, ...Object.keys(this.settings.profiles).map((p) => this.modelFor(p))];
  }
  /** The .base file a view element lives in: an open base tab, or a base embedded in a note. */
  basePathOf(el: HTMLElement): string | null {
    const embed = el.closest<HTMLElement>(".internal-embed");
    const src = embed?.getAttribute("src");
    if (src) {
      const host = el.closest<HTMLElement>(".workspace-leaf");
      let from = "";
      this.app.workspace.iterateAllLeaves((leaf) => {
        if (host && leaf.view.containerEl.parentElement === host && leaf.view instanceof FileView && leaf.view.file) from = leaf.view.file.path;
      });
      const f = this.app.metadataCache.getFirstLinkpathDest(src.split("#")[0], from);
      if (f && f.extension === "base") return f.path;
    }
    let found: string | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (found || !(leaf.view instanceof FileView)) return;
      const file = leaf.view.file;
      if (file && file.extension === "base" && leaf.view.containerEl.contains(el)) found = file.path;
    });
    return found;
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
  presetColumns(groupBy: string | null, view?: KanbanView): string[] {
    const s = this.settingsFor(view ? this.basePathOf(view.containerEl) : null);
    const f = s.fields;
    if (groupBy === f.status) return s.statuses.map((x) => x.name);
    if (groupBy === f.priority) return s.priorities.map((x) => x.name);
    if (groupBy === f.type) return s.types.map((x) => x.name);
    return [];
  }
  /**
   * Properties shown as chips on board cards. A view's own property list wins, unless
   * it only has the file name or the "use card fields everywhere" setting is on.
   */
  cardProperties(order: BasesPropertyId[], view?: KanbanView): BasesPropertyId[] {
    const s = this.settingsFor(view ? this.basePathOf(view.containerEl) : null);
    const own = order.filter((p) => p !== "file.name");
    if (own.length && !s.cardFieldsOverride) return order;
    const fields = s.cardFields.map((k) => k.trim()).filter(Boolean).map((k) => (k.includes(".") ? k : `note.${k}`) as BasesPropertyId);
    return ["file.name", ...fields];
  }
  defaultColumnColor(groupBy: string | null, value: string, view?: KanbanView): string | null {
    const s = this.settingsFor(view ? this.basePathOf(view.containerEl) : null);
    const f = s.fields;
    if (groupBy === f.status) return s.statuses.find((x) => x.name === value)?.color ?? null;
    if (groupBy === f.priority) return s.priorities.find((x) => x.name === value)?.color ?? null;
    if (groupBy === f.type) return s.types.find((x) => x.name === value)?.color ?? null;
    return null;
  }
  private blocksCache = new Map<Model, { at: number; idx: Map<string, TFile[]> }>();
  blocksIndex(m: Model = this.model): Map<string, TFile[]> {
    const now = Date.now();
    let c = this.blocksCache.get(m);
    if (!c || now - c.at > 400) { c = { at: now, idx: m.blocksIndex() }; this.blocksCache.set(m, c); }
    return c.idx;
  }
  decorateCard(cardEl: HTMLElement, props: HTMLElement, file: TFile, view: KanbanView) {
    try {
      const m = this.modelFor(this.basePathOf(view.containerEl));
      decorateCard(this, m, cardEl, props, file, view.getGroupByProperty());
    } catch (e) { console.error("Star Tracker: card decoration failed", e); }
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

  private noteButtons = new Map<MarkdownView, HTMLElement>();
  /** Adds (or removes, per the setting) the activity button in every open note's header. */
  addNoteButtons() {
    const on = this.settings.activity.noteButton;
    for (const [view, el] of this.noteButtons) {
      if (!on || !view.containerEl.isConnected) { el.remove(); this.noteButtons.delete(view); }
    }
    if (!on) return;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || this.noteButtons.has(view)) continue;
      const el = view.addAction("lucide-history", "Show activity for this note", () => {
        if (view.file) new TaskActivityModal(this.app, this, view.file).open();
      });
      el.addClass("sta-note-action");
      this.noteButtons.set(view, el);
    }
  }

  async openActivity() {
    const existing = this.app.workspace.getLeavesOfType(ACTIVITY_PANE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf(true);
    if (!existing) await leaf.setViewState({ type: ACTIVITY_PANE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  onunload() {
    void this.activity?.flush();
    for (const el of this.noteButtons.values()) el.remove();
    this.noteButtons.clear();
    if (this.renameTimer !== null) window.clearTimeout(this.renameTimer);
  }

  async loadSettings() {
    const saved: unknown = await this.loadData();
    this.settings = mergeSettings(saved);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.model) this.model.s = this.settings;
    this.models.clear();
    if (this.model) this.models.set("", this.model);
    for (const v of this.views) { try { v.onDataUpdated(); } catch (e) { console.error(e); } }
  }
}

