import { BasesView, TFile, QueryController } from "obsidian";
import type StarTrackerPlugin from "../main";
import { DAY, clean, fmOf, fmtDay, linkName, openFile, parseDate, startOfWeek, str, FM } from "../util";

export const TIMELINE_VIEW = "star-timeline";

const ZOOMS: Record<string, { px: number; unit: string }> = {
  Weeks: { px: 18, unit: "week" },
  Months: { px: 5, unit: "month" },
  Quarters: { px: 1.8, unit: "quarter" },
};

interface Item {
  file: TFile; path: string; title: string; type: string; id: string; status: string; owner: string | null;
  start: Date | null; end: Date | null; opened: Date | null; due: Date | null; closed: Date | null;
  parentName: string | null; children: Item[]; s?: Date | null; e?: Date | null; derived?: boolean;
}

export class StarTimelineView extends BasesView {
  type = TIMELINE_VIEW;
  plugin: StarTrackerPlugin;
  rootEl: HTMLElement;
  zoom = "Months";
  hideDone = true;
  collapsed = new Set<string>();
  scrollToToday = true;
  timer: number | null = null;

  constructor(controller: QueryController, scrollEl: HTMLElement, plugin: StarTrackerPlugin) {
    super(controller);
    this.plugin = plugin;
    this.rootEl = scrollEl.createDiv({ cls: "stl-root" });
  }
  get basePath() { return this.plugin.basePathOf(this.rootEl); }
  get m() { return this.plugin.modelFor(this.basePath); }
  get s() { return this.m.s; }
  onDataUpdated() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), 60);
  }
  onunload() { if (this.timer) window.clearTimeout(this.timer); }

  typeOrder(): string[] { return this.s.types.map((t) => t.name); }

  collect() {
    const f = this.s.fields;
    const items = new Map<string, Item>();
    for (const entry of (this.data && this.data.data) || []) {
      const file = entry.file;
      if (!file) continue;
      const fm = fmOf(this.app, file);
      const type = this.m.typeDef(clean(fm[f.type])).name;
      items.set(file.path, {
        file, path: file.path, title: file.basename, type,
        id: str(fm.task_id),
        status: clean(fm[f.status]) || "No status",
        owner: clean(fm[f.owner]),
        start: parseDate(fm[f.start]), end: parseDate(fm[f.end]),
        opened: parseDate(fm[f.opened]), due: parseDate(fm[f.due]), closed: parseDate(fm[f.closed]),
        parentName: linkName(fm[f.parent]),
        children: [],
      });
    }
    const roots: Item[] = [];
    for (const it of items.values()) {
      let parent: Item = null;
      if (it.parentName) {
        const pf = this.app.metadataCache.getFirstLinkpathDest(it.parentName, it.path);
        if (pf && items.has(pf.path) && pf.path !== it.path) parent = items.get(pf.path);
      }
      if (parent) parent.children.push(it); else roots.push(it);
    }
    const order = this.typeOrder();
    const sortFn = (a: Item, b: Item) => (order.indexOf(a.type) - order.indexOf(b.type)) || (a.id || a.title).localeCompare(b.id || b.title, undefined, { numeric: true });
    const sortTree = (l: Item[]) => { l.sort(sortFn); l.forEach((x) => sortTree(x.children)); };
    sortTree(roots);
    const span = (it: Item): { s: Date | null; e: Date | null } => {
      let s = it.start, e = it.end;
      for (const c of it.children) {
        const cs = span(c);
        if (!it.start && cs.s && (!s || cs.s < s)) s = cs.s;
        if (!it.end && cs.e && (!e || cs.e > e)) e = cs.e;
      }
      if (s && !e) e = it.due || it.closed || s;
      if (!s && e) s = it.opened || e;
      it.s = s; it.e = e && s && e < s ? s : e;
      it.derived = !it.start && !!s;
      return { s: it.s, e: it.e };
    };
    roots.forEach(span);
    return roots;
  }

  render() {
    const root = this.rootEl;
    root.empty();
    const S = this.s, m = this.m;
    const epicType = m.epicType();
    const roots = this.collect();
    const visible = (it: Item): boolean => !(this.hideDone && m.isDone(it.status) && !it.children.some(visible));
    const rows: { it: Item; depth: number }[] = [];
    const walk = (l: Item[], depth: number) => {
      for (const it of l) {
        if (!visible(it)) continue;
        rows.push({ it, depth });
        if (it.children.length && !this.collapsed.has(it.path)) walk(it.children, depth + 1);
      }
    };
    const epics = roots.filter((r) => r.type === epicType);
    const loose = roots.filter((r) => r.type !== epicType);
    walk(epics, 0);
    const looseStart = rows.length;
    if (!this.collapsed.has("__loose")) walk(loose, 1);

    // toolbar
    const bar = root.createDiv({ cls: "stl-toolbar" });
    bar.createEl("button", { text: `+ ${epicType}`, cls: "mod-cta" }).addEventListener("click", () => void this.createItem(epicType, null));
    const hide = bar.createEl("label", { cls: "stl-toggle" });
    const cb = hide.createEl("input", { type: "checkbox" });
    cb.checked = this.hideDone;
    hide.createSpan({ text: `Hide ${S.doneStatus.toLowerCase()}` });
    cb.addEventListener("change", () => { this.hideDone = cb.checked; this.render(); });
    bar.createDiv({ cls: "stl-spacer" });
    const legend = bar.createDiv({ cls: "stl-legend" });
    for (const t of S.types) legend.createSpan({ cls: "stl-type", text: `${t.icon} ${t.name}` }).style.setProperty("--tc", t.color);
    const zooms = bar.createDiv({ cls: "stl-zoom" });
    for (const z of ["Today", ...Object.keys(ZOOMS)]) {
      const b = zooms.createEl("button", { text: z });
      if (z === this.zoom) b.addClass("is-active");
      b.addEventListener("click", () => { if (z !== "Today") this.zoom = z; this.scrollToToday = true; this.render(); });
    }

    // time range
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let min = new Date(today), max = new Date(today);
    for (const { it } of rows) {
      if (it.s && it.s < min) min = new Date(it.s);
      if (it.e && it.e > max) max = new Date(it.e);
    }
    min = new Date(min.getFullYear(), min.getMonth() - 1, 1);
    max = new Date(max.getFullYear(), max.getMonth() + 3, 1);
    const pxDay = ZOOMS[this.zoom].px;
    const x = (d: Date) => Math.round(((d.getTime() - min.getTime()) / DAY) * pxDay);

    const wrap = root.createDiv({ cls: "stl-wrap" });
    const left = wrap.createDiv({ cls: "stl-left" });
    const right = wrap.createDiv({ cls: "stl-right" });
    const canvas = right.createDiv({ cls: "stl-canvas" });
    canvas.style.width = x(max) + "px";

    const lh = left.createDiv({ cls: "stl-row stl-head" });
    lh.createDiv({ cls: "stl-cell stl-work", text: "Work" });
    lh.createDiv({ cls: "stl-cell stl-status", text: "Status" });
    lh.createDiv({ cls: "stl-cell stl-owner", text: "Owner" });
    const rh = canvas.createDiv({ cls: "stl-row stl-head stl-scale" });
    const unit = ZOOMS[this.zoom].unit;
    let cur = unit === "week" ? startOfWeek(min, S.weekStartsMonday) : new Date(min.getFullYear(), unit === "quarter" ? Math.floor(min.getMonth() / 3) * 3 : min.getMonth(), 1);
    while (cur < max) {
      const next = new Date(cur);
      if (unit === "week") next.setDate(next.getDate() + 7);
      else if (unit === "month") next.setMonth(next.getMonth() + 1);
      else next.setMonth(next.getMonth() + 3);
      const label = unit === "week" ? fmtDay(cur)
        : unit === "month" ? cur.toLocaleDateString(undefined, { month: "long", year: cur.getMonth() === 0 ? "numeric" : undefined })
        : `Q${Math.floor(cur.getMonth() / 3) + 1} ${cur.getFullYear()}`;
      const c = rh.createDiv({ cls: "stl-tick", text: label });
      c.style.left = Math.max(0, x(cur)) + "px";
      c.style.width = (x(next) - Math.max(0, x(cur))) + "px";
      cur = next;
    }

    const rowEl = (it: Item, depth: number) => {
      const td = m.typeDef(it.type);
      const isEpic = it.type === epicType;
      const r = left.createDiv({ cls: "stl-row" + (isEpic ? " stl-epic" : "") });
      const w = r.createDiv({ cls: "stl-cell stl-work" });
      w.style.paddingLeft = (8 + depth * 18) + "px";
      const tw = w.createSpan({ cls: "stl-twisty" });
      if (it.children.length) {
        tw.setText(this.collapsed.has(it.path) ? "▸" : "▾");
        tw.addEventListener("click", () => { this.collapsed.has(it.path) ? this.collapsed.delete(it.path) : this.collapsed.add(it.path); this.render(); });
      }
      const ic = w.createSpan({ cls: "stl-icon", text: td.icon });
      ic.style.color = td.color; ic.title = it.type;
      if (it.id) w.createSpan({ cls: "stl-id", text: it.id });
      const shown = it.id && it.title.startsWith(it.id) ? it.title.slice(it.id.length).trim() : it.title;
      const a = w.createEl("a", { cls: "stl-title", text: shown || it.title, href: "#" });
      a.addEventListener("click", (e) => { e.preventDefault(); openFile(this.app, it.file, e); });
      if (td.child) {
        const add = w.createSpan({ cls: "stl-add", text: "+" });
        add.title = `Add ${td.child} under this ${it.type}`;
        add.addEventListener("click", () => void this.createItem(td.child, it));
      }
      r.createDiv({ cls: "stl-cell stl-status" }).createSpan({ cls: "std-pill", text: it.status }).style.setProperty("--pill", m.statusColor(it.status));
      r.createDiv({ cls: "stl-cell stl-owner", text: it.owner || "" });

      const rr = canvas.createDiv({ cls: "stl-row" + (isEpic ? " stl-epic" : "") });
      if (it.s && it.e) {
        const b = rr.createDiv({ cls: "stl-bar" + (it.derived ? " stl-derived" : "") + (m.isDone(it.status) ? " stl-done" : "") });
        b.style.left = x(it.s) + "px";
        b.style.width = Math.max(8, x(it.e) - x(it.s) + pxDay) + "px";
        b.style.setProperty("--tc", td.color);
        b.title = `${it.title}\n${fmtDay(it.s)} – ${fmtDay(it.e)}${it.derived ? " (from children)" : ""}`;
        if (isEpic && it.children.length) {
          const all: Item[] = [];
          const gather = (n: Item) => n.children.forEach((c) => { all.push(c); gather(c); });
          gather(it);
          const d = all.filter((c) => m.isDone(c.status)).length;
          b.createDiv({ cls: "stl-progress" }).style.width = Math.round((d / all.length) * 100) + "%";
          b.title += `\n${d}/${all.length} ${S.doneStatus.toLowerCase()}`;
        }
      } else if (it.opened) {
        const d = rr.createDiv({ cls: "stl-dot" });
        d.style.left = x(it.opened) + "px";
        d.style.setProperty("--tc", td.color);
        d.title = `${it.title}\nNo ${S.fields.start}/${S.fields.end} set. Opened ${fmtDay(it.opened)}`;
      }
    };

    rows.forEach(({ it, depth }, i) => {
      if (i === looseStart && loose.length) this.looseHeader(left, canvas, loose.length, epicType);
      rowEl(it, depth);
    });
    if (looseStart === rows.length && loose.length) this.looseHeader(left, canvas, loose.length, epicType);
    if (!rows.length && !loose.length) left.createDiv({ cls: "std-muted stl-empty", text: `No tasks. Click + ${epicType} to start.` });

    const t = canvas.createDiv({ cls: "stl-today" });
    t.style.left = x(today) + "px";
    t.title = "Today";

    right.addEventListener("scroll", () => { left.scrollTop = right.scrollTop; });
    left.addEventListener("wheel", (e) => { right.scrollTop += e.deltaY; right.scrollLeft += e.deltaX; e.preventDefault(); }, { passive: false });
    if (this.scrollToToday) {
      window.requestAnimationFrame(() => { right.scrollLeft = Math.max(0, x(today) - right.clientWidth / 3); });
      this.scrollToToday = false;
    }
  }

  looseHeader(left: HTMLElement, canvas: HTMLElement, n: number, epicType: string) {
    const r = left.createDiv({ cls: "stl-row stl-group" });
    const w = r.createDiv({ cls: "stl-cell stl-work" });
    const tw = w.createSpan({ cls: "stl-twisty", text: this.collapsed.has("__loose") ? "▸" : "▾" });
    tw.addEventListener("click", () => { this.collapsed.has("__loose") ? this.collapsed.delete("__loose") : this.collapsed.add("__loose"); this.render(); });
    w.createSpan({ text: `Not under an ${epicType.toLowerCase()} (${n})` });
    r.createDiv({ cls: "stl-cell stl-status" });
    r.createDiv({ cls: "stl-cell stl-owner" });
    canvas.createDiv({ cls: "stl-row stl-group" });
  }

  async createItem(type: string, parent: Item | null) {
    const f = this.s.fields;
    await this.createFileForView(`New ${type.toLowerCase()}`, (fm: FM) => {
      this.m.newTaskFm(fm, { [f.type]: type });
      if (parent) fm[f.parent] = `[[${parent.file.basename}]]`;
    });
  }
}
