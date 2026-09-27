import { BasesAllOptions, BasesEntry, BasesPropertyId, BasesView, Menu, Notice, QueryController, TFile, setIcon } from "obsidian";
import type StarTrackerPlugin from "../main";
import { GRAY, clean, fmOf, list, openFile, str, submenu, FM } from "../util";

export const BOARD_VIEW = "star-board";
const NO_VALUE = "";

interface Card { file: TFile; entry: BasesEntry; fm: FM; value: string }

export class StarBoardView extends BasesView {
  type = BOARD_VIEW;
  plugin: StarTrackerPlugin;
  root: HTMLElement;
  timer: number | null = null;
  dragPath: string | null = null;
  hideEmptyByDefault = false;

  constructor(controller: QueryController, containerEl: HTMLElement, plugin: StarTrackerPlugin) {
    super(controller);
    this.plugin = plugin;
    this.root = containerEl.createDiv({ cls: "st-board" });
  }
  get basePath() { return this.plugin.basePathOf(this.root); }
  get m() { return this.plugin.modelFor(this.basePath); }
  get s() { return this.m.s; }

  onDataUpdated() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), 30);
  }
  onunload() { if (this.timer) window.clearTimeout(this.timer); }

  /** The property the columns are built from, e.g. "note.status". */
  columnProp(): string {
    const opt = this.config.getAsPropertyId("columnProperty");
    if (opt) return opt;
    const cfg = this.config as unknown as { groupBy?: { property?: string } };
    const fromGet = this.config.get("groupBy") as { property?: string } | string | undefined;
    const g = cfg.groupBy?.property ?? (typeof fromGet === "string" ? fromGet : fromGet?.property);
    if (g) return g.includes(".") ? g : "note." + g;
    return "note." + this.s.fields.status;
  }
  noteKey(prop: string): string | null {
    return prop.startsWith("note.") ? prop.slice(5) : null;
  }
  readValue(entry: BasesEntry, fm: FM, prop: string): unknown {
    const key = this.noteKey(prop);
    if (key) return fm[key];
    try {
      const v = entry.getValue(prop as BasesPropertyId);
      if (!v) return null;
      const s = v.toString();
      return s === "null" ? null : s;
    } catch { return null; }
  }
  display(v: unknown): string {
    return list(v).map((x) => clean(x) || str(x)).filter(Boolean).join(", ");
  }

  presetColumns(key: string | null): string[] {
    const f = this.s.fields;
    if (key === f.status) return this.s.statuses.map((x) => x.name);
    if (key === f.priority) return this.s.priorities.map((x) => x.name);
    if (key === f.type) return this.s.types.map((x) => x.name);
    return [];
  }
  columnColor(key: string | null, value: string): string {
    const custom = this.config.get("columnColors") as Record<string, string> | undefined;
    if (custom && typeof custom === "object" && custom[value]) return custom[value];
    const f = this.s.fields;
    if (key === f.status) return this.m.statusColor(value);
    if (key === f.priority) return this.m.priorityColor(value);
    if (key === f.type) return this.m.typeDef(value).color;
    return GRAY;
  }
  collapsed(): Record<string, boolean> {
    const c: unknown = this.config.get("collapsedColumns");
    return c && typeof c === "object" && !Array.isArray(c) ? { ...c } : {};
  }
  toggleCollapsed(value: string) {
    const c = this.collapsed();
    const k = value === NO_VALUE ? "(No value)" : value;
    if (c[k]) delete c[k]; else c[k] = true;
    this.config.set("collapsedColumns", c);
    this.render();
  }

  /** Subclasses narrow which entries show (the sprint view keeps only the chosen sprint). */
  includeEntry(_fm: FM): boolean { return true; }
  /** Subclasses add frontmatter to cards created from a column's + New. */
  newCardFm(_fm: FM): void {}

  render() {
    const root = this.root;
    const scroll = root.scrollLeft;
    root.empty();
    this.renderBoard(root);
    root.scrollLeft = scroll;
  }

  renderBoard(root: HTMLElement) {
    const prop = this.columnProp();
    const key = this.noteKey(prop);

    const cards: Card[] = [];
    for (const entry of (this.data && this.data.data) || []) {
      const file = entry.file;
      if (!file) continue;
      const fm = fmOf(this.app, file);
      if (!this.includeEntry(fm)) continue;
      cards.push({ file, entry, fm, value: clean(this.readValue(entry, fm, prop)) || NO_VALUE });
    }

    // columns: view option, Base Board style boardColumns, settings preset, then any other values found
    const listed = list(this.config.get("columns")).map(str);
    const legacy = list(this.config.get("boardColumns")).map(str);
    const base = listed.length ? listed : legacy.length ? legacy : this.presetColumns(key);
    const cols: string[] = [...base];
    for (const c of cards) if (!cols.includes(c.value)) {
      if (c.value === NO_VALUE) cols.unshift(NO_VALUE); else cols.push(c.value);
    }
    const he = this.config.get("hideEmptyColumns");
    const hideEmpty = he === undefined || he === null ? this.hideEmptyByDefault : he === true;
    const collapsed = this.collapsed();
    const showEpic = this.config.get("showEpic") !== false;
    const blocksIdx = this.m.blocksIndex();
    const order = this.config.getOrder().filter((p) => p !== "file.name" && p !== prop);

    const board = root.createDiv({ cls: "st-columns" });
    for (const value of cols) {
      const inCol = cards.filter((c) => c.value === value);
      if (hideEmpty && !inCol.length && value !== NO_VALUE) continue;
      if (value === NO_VALUE && !inCol.length && !base.includes(NO_VALUE)) continue;
      const isCollapsed = !!collapsed[value === NO_VALUE ? "(No value)" : value];
      const color = value === NO_VALUE ? GRAY : this.columnColor(key, value);
      const col = board.createDiv({ cls: "st-column" + (isCollapsed ? " is-collapsed" : "") });
      col.style.setProperty("--st-col", color);

      const head = col.createDiv({ cls: "st-col-head" });
      const tw = head.createDiv({ cls: "st-col-toggle", attr: { "aria-label": isCollapsed ? "Expand" : "Collapse" } });
      setIcon(tw, isCollapsed ? "chevron-right" : "chevron-down");
      tw.addEventListener("click", () => this.toggleCollapsed(value));
      head.createDiv({ cls: "st-col-dot" });
      head.createDiv({ cls: "st-col-title", text: value === NO_VALUE ? "No value" : value });
      head.createDiv({ cls: "st-col-count", text: String(inCol.length) });

      this.dropZone(col, value, key);
      if (isCollapsed) continue;

      const body = col.createDiv({ cls: "st-col-body" });
      for (const c of inCol) this.card(body, c, order, key, blocksIdx, showEpic);
      const add = col.createDiv({ cls: "st-col-add" });
      setIcon(add.createSpan(), "plus");
      add.createSpan({ text: "New" });
      add.addEventListener("click", () => void this.newCard(key, value));
    }
  }

  card(parent: HTMLElement, c: Card, order: string[], colKey: string | null, blocksIdx: Map<string, TFile[]>, showEpic: boolean) {
    const f = this.s.fields;
    const el = parent.createDiv({ cls: "st-card", attr: { draggable: "true", "data-path": c.file.path } });
    const title = el.createDiv({ cls: "st-card-title", text: c.file.basename });
    title.addEventListener("click", (ev) => openFile(this.app, c.file, ev));
    el.addEventListener("mouseover", (ev) => {
      this.app.workspace.trigger("hover-link", { event: ev, source: "bases", hoverParent: this, targetEl: el, linktext: c.file.path });
    });
    el.addEventListener("dragstart", (ev) => {
      this.dragPath = c.file.path;
      el.addClass("is-dragging");
      if (ev.dataTransfer) { ev.dataTransfer.setData("text/plain", c.file.path); ev.dataTransfer.effectAllowed = "move"; }
    });
    el.addEventListener("dragend", () => { el.removeClass("is-dragging"); this.dragPath = null; });
    el.addEventListener("contextmenu", (ev) => this.cardMenu(ev, c, colKey));

    const chips = el.createDiv({ cls: "st-chips" });
    const chip = (label: string, value: string, cls = "", color?: string) => {
      const ch = chips.createSpan({ cls: "st-chip " + cls });
      if (label) ch.createSpan({ cls: "st-chip-label", text: label });
      ch.createSpan({ cls: "st-chip-value", text: value });
      if (color) ch.style.setProperty("--st-chip", color);
      return ch;
    };
    let hasPriority = false;
    for (const p of order) {
      const key = this.noteKey(p);
      const raw = this.readValue(c.entry, c.fm, p);
      const label = this.config.getDisplayName(p as BasesPropertyId);
      if (key === f.priority) {
        hasPriority = true;
        const v = clean(raw);
        chip(label, v || "No priority", "st-prio" + (v ? "" : " is-empty"), v ? this.m.priorityColor(v) : GRAY);
        continue;
      }
      const text = this.display(raw);
      if (!text) continue;
      if (key === f.status) { chip("", text, "st-pill", this.m.statusColor(clean(raw))); continue; }
      if (key === f.points) { chip("", `${text} pts`, "st-points"); continue; }
      if (key === f.sprint) { chip(label, text, "st-sprint"); continue; }
      if (key === f.type) { const t = this.m.typeDef(text); chip("", `${t.icon} ${text}`, "st-type", t.color); continue; }
      if (key === f.blockedBy) {
        const bl = this.m.blockers(c.fm, c.file.path);
        const open = bl.filter((b) => !this.m.isDone(clean(fmOf(this.app, b)[f.status])));
        const ch = chip(label, text, "st-blocked" + (bl.length && !open.length ? " is-cleared" : ""));
        ch.title = bl.length ? (open.length ? `Waiting on: ${open.map((b) => b.basename).join(", ")}` : "All blockers done") : "";
        continue;
      }
      chip(label, text);
    }
    if (!hasPriority && colKey !== f.priority && this.config.get("alwaysShowPriority") !== false) {
      const v = clean(c.fm[f.priority]);
      chips.prepend(chip("priority", v || "No priority", "st-prio" + (v ? "" : " is-empty"), v ? this.m.priorityColor(v) : GRAY));
    }
    const blocks = blocksIdx.get(c.file.path) || [];
    if (blocks.length) {
      const ch = chip("blocks", `${blocks.length} task${blocks.length === 1 ? "" : "s"}`, "st-blocks");
      ch.title = blocks.map((b) => b.basename).join("\n");
    }
    if (showEpic) {
      const epic = this.m.findEpic(c.file);
      if (epic && epic.path !== c.file.path) {
        const ch = chip("epic", epic.basename, "st-epic");
        ch.title = epic.basename;
        ch.addEventListener("click", (ev) => { ev.stopPropagation(); openFile(this.app, epic, ev); });
      }
    }
    if (!chips.childElementCount) chips.remove();
  }

  dropZone(col: HTMLElement, value: string, key: string | null) {
    col.addEventListener("dragover", (ev) => {
      if (!this.dragPath) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      col.addClass("is-drop-target");
    });
    col.addEventListener("dragleave", (ev) => {
      if (!col.contains(ev.relatedTarget as Node)) col.removeClass("is-drop-target");
    });
    col.addEventListener("drop", (ev) => {
      ev.preventDefault();
      col.removeClass("is-drop-target");
      const path = this.dragPath || (ev.dataTransfer && ev.dataTransfer.getData("text/plain"));
      this.dragPath = null;
      const file = path && this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) void this.setValue(file, key, value);
    });
  }

  async setValue(file: TFile, key: string | null, value: string) {
    if (!key) { new Notice("Cards can only be moved when columns come from a note property."); return; }
    const cur = clean(fmOf(this.app, file)[key]) || NO_VALUE;
    if (cur === value) return;
    await this.app.fileManager.processFrontMatter(file, (fm: FM) => {
      if (value === NO_VALUE) fm[key] = null;
      else fm[key] = key === this.s.fields.points && !isNaN(Number(value)) ? Number(value) : value;
    });
  }

  cardMenu(ev: MouseEvent, c: Card, colKey: string | null) {
    ev.preventDefault();
    const f = this.s.fields;
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("Open").setIcon("file").onClick(() => openFile(this.app, c.file)));
    menu.addItem((i) => i.setTitle("Open in new tab").setIcon("file-plus").onClick(() => void this.app.workspace.getLeaf(true).openFile(c.file)));
    menu.addSeparator();
    const sub = (title: string, icon: string, key: string, values: string[]) => {
      menu.addItem((i) => {
        i.setTitle(title).setIcon(icon);
        const sm = submenu(i);
        if (!sm) { i.onClick(() => openFile(this.app, c.file)); return; }
        for (const v of values) sm.addItem((x) => x.setTitle(v).setChecked(clean(c.fm[key]) === v).onClick(() => void this.setValue(c.file, key, v)));
        sm.addItem((x) => x.setTitle("None").onClick(() => void this.setValue(c.file, key, NO_VALUE)));
      });
    };
    sub("Move to", "columns-3", f.status, this.s.statuses.map((x) => x.name));
    sub("Priority", "flag", f.priority, this.s.priorities.map((x) => x.name));
    sub("Type", "shapes", f.type, this.s.types.map((x) => x.name));
    sub("Points", "hash", f.points, this.s.pointScale.map(String));
    const sprints = this.m.sprints().filter((x) => x.state !== "closed");
    menu.addItem((i) => {
      i.setTitle("Sprint").setIcon("timer");
      const sm = submenu(i);
      if (!sm) return;
      const cur = clean(c.fm[f.sprint]);
      for (const sp of sprints) sm.addItem((x) => x.setTitle(sp.name).setChecked(cur === sp.name).onClick(() => void this.m.setSprint(c.file, sp)));
      sm.addItem((x) => x.setTitle("Backlog (no sprint)").onClick(() => void this.m.setSprint(c.file, null)));
    });
    menu.showAtMouseEvent(ev);
  }

  async newCard(key: string | null, value: string) {
    const extra = this.config.get("newItemProperties") as FM | undefined;
    await this.createFileForView(undefined, (fm: FM) => {
      this.m.newTaskFm(fm, extra && typeof extra === "object" ? { ...extra } : {});
      if (key) fm[key] = value === NO_VALUE ? null : value;
      this.newCardFm(fm);
    });
  }
}

export function boardOptions(plugin: StarTrackerPlugin) {
  return (): BasesAllOptions[] => [
    {
      type: "property", key: "columnProperty", displayName: "Columns from",
      placeholder: `note.${plugin.settings.fields.status} (default)`,
    },
    { type: "multitext", key: "columns", displayName: "Column order (blank = from settings)" },
    { type: "toggle", key: "hideEmptyColumns", displayName: "Hide empty columns", default: false },
    { type: "toggle", key: "alwaysShowPriority", displayName: "Always show priority", default: true },
    { type: "toggle", key: "showEpic", displayName: "Show epic on cards", default: true },
  ] as BasesAllOptions[];
}

