import { App, Menu, Modal, Notice, Setting, TFile, normalizePath, QueryController, BasesAllOptions } from "obsidian";
import type StarTrackerPlugin from "../main";
import { DAY, GRAY, Model, Sprint, clean, fmOf, fmtDay, isoDay, openFile, svg, FM } from "../util";
import { StarBoardView } from "./board";

export const SPRINT_VIEW = "star-sprint";
type Tab = "board" | "planning" | "report";

interface STask { file: TFile; fm: FM; status: string; points: number; done: boolean; doneOn: Date | null }

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
function dayOnly(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function daysBetween(a: Date, b: Date) { return Math.round((dayOnly(b).getTime() - dayOnly(a).getTime()) / DAY); }

/** Tasks (from the given files) that belong to a sprint. */
export function sprintTasks(m: Model, files: TFile[], sprint: Sprint): STask[] {
  const out: STask[] = [];
  for (const file of files) {
    const fm = fmOf(m.app, file);
    if (m.sprintPathOf(fm, file.path) !== sprint.file.path) continue;
    const status = clean(fm[m.s.fields.status]) || "";
    out.push({ file, fm, status, points: m.pointsOf(fm), done: m.isDone(status), doneOn: m.doneDate(fm) });
  }
  return out;
}

/** Burndown line chart: ideal vs remaining, in points (or tasks when nothing is estimated). */
export function renderBurndown(el: HTMLElement, m: Model, sprint: Sprint, tasks: STask[]) {
  if (!sprint.start || !sprint.end) { el.createDiv({ cls: "std-muted", text: `Set ${m.s.fields.start} and ${m.s.fields.end} on the sprint note to see the burndown.` }); return; }
  const usePoints = tasks.some((t) => t.points > 0);
  const val = (t: STask) => (usePoints ? t.points : 1);
  const total = tasks.reduce((a, t) => a + val(t), 0);
  const start = dayOnly(sprint.start), end = dayOnly(sprint.end);
  const n = Math.max(1, daysBetween(start, end));
  const today = dayOnly(new Date());
  const lastDay = sprint.state === "closed" && sprint.closedOn ? dayOnly(sprint.closedOn) : today;
  const upto = Math.min(n, daysBetween(start, lastDay));
  const remaining: number[] = [];
  for (let i = 0; i <= upto && i <= n; i++) {
    const d = new Date(start.getTime() + i * DAY);
    const doneBy = tasks.filter((t) => t.done && t.doneOn && dayOnly(t.doneOn) <= d).reduce((a, t) => a + val(t), 0);
    remaining.push(total - doneBy);
  }
  const W = 1000, H = 240, padL = 36, padR = 12, padT = 16, padB = 28;
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "st-burndown" }, el);
  const max = Math.max(4, Math.ceil(total / 4) * 4);
  const X = (i: number) => padL + (i / n) * (W - padL - padR);
  const Y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  for (let g = 0; g <= 4; g++) {
    const v = (g / 4) * max;
    svg("line", { x1: padL, x2: W - padR, y1: Y(v), y2: Y(v), class: "std-grid-line" }, s);
    svg("text", { x: padL - 6, y: Y(v) + 4, "text-anchor": "end", class: "std-axis" }, s).textContent = String(Math.round(v));
  }
  const step = Math.max(1, Math.ceil(n / 10));
  for (let i = 0; i <= n; i += step) {
    svg("text", { x: X(i), y: H - 8, "text-anchor": "middle", class: "std-axis" }, s).textContent = fmtDay(new Date(start.getTime() + i * DAY));
  }
  svg("line", { x1: X(0), y1: Y(total), x2: X(n), y2: Y(0), class: "st-ideal" }, s);
  if (remaining.length) {
    const pts = remaining.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
    svg("polyline", { points: pts, class: "st-actual" }, s);
    remaining.forEach((v, i) => {
      const c = svg("circle", { cx: X(i), cy: Y(v), r: 3.5, class: "st-actual-dot" }, s);
      svg("title", {}, c).textContent = `${fmtDay(new Date(start.getTime() + i * DAY))}: ${v} ${usePoints ? "pts" : "tasks"} left`;
    });
  }
  const ti = daysBetween(start, today);
  if (ti >= 0 && ti <= n && sprint.state !== "closed") svg("line", { x1: X(ti), x2: X(ti), y1: padT, y2: H - padB, class: "st-today-line" }, s);
  const legend = el.createDiv({ cls: "std-legend std-legend-inline" });
  for (const [cls, text] of [["st-sw-ideal", "Ideal"], ["st-sw-actual", `Remaining (${usePoints ? "points" : "tasks"})`]]) {
    const row = legend.createDiv({ cls: "std-legend-row" });
    row.createSpan({ cls: "std-swatch " + cls });
    row.createSpan({ cls: "std-legend-label", text });
  }
}

/** Velocity: committed vs completed for the last closed sprints. */
export function renderVelocity(el: HTMLElement, m: Model, all: Sprint[], files: TFile[]) {
  const closed = all.filter((x) => x.state === "closed").slice(-6);
  if (!closed.length) { el.createDiv({ cls: "std-muted", text: "Complete a sprint to see velocity." }); return; }
  const rows = closed.map((sp) => {
    const tasks = sprintTasks(m, files, sp);
    const completed = sp.completedPoints ?? tasks.filter((t) => t.done).reduce((a, t) => a + t.points, 0);
    const committed = sp.committedPoints ?? tasks.reduce((a, t) => a + t.points, 0);
    return { name: sp.name, committed, completed };
  });
  const max = Math.max(4, Math.ceil(Math.max(...rows.map((r) => Math.max(r.committed, r.completed))) / 4) * 4);
  const W = 1000, H = 220, padL = 36, padB = 28, padT = 20;
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "std-weekly" }, el);
  const plotH = H - padB - padT, slot = (W - padL) / rows.length, bw = Math.min(28, slot / 3);
  for (let g = 0; g <= 4; g++) {
    const y = padT + plotH - (g / 4) * plotH;
    svg("line", { x1: padL, x2: W, y1: y, y2: y, class: "std-grid-line" }, s);
    svg("text", { x: padL - 6, y: y + 4, "text-anchor": "end", class: "std-axis" }, s).textContent = String(Math.round((g / 4) * max));
  }
  rows.forEach((r, i) => {
    const x0 = padL + i * slot + slot / 2;
    const bar = (v: number, dx: number, cls: string, label: string) => {
      const h = (v / max) * plotH;
      const rect = svg("rect", { x: x0 + dx, y: padT + plotH - h, width: bw, height: Math.max(0, h), rx: 3, class: cls }, s);
      svg("title", {}, rect).textContent = `${r.name} ${label}: ${v} pts`;
      if (v) svg("text", { x: x0 + dx + bw / 2, y: padT + plotH - h - 4, "text-anchor": "middle", class: "std-val" }, s).textContent = String(v);
    };
    bar(r.committed, -bw - 2, "st-committed", "committed");
    bar(r.completed, 2, "std-shipped", "completed");
    svg("text", { x: x0, y: H - 8, "text-anchor": "middle", class: "std-axis" }, s).textContent = r.name;
  });
  const avg = Math.round((rows.reduce((a, r) => a + r.completed, 0) / rows.length) * 10) / 10;
  const legend = el.createDiv({ cls: "std-legend std-legend-inline" });
  for (const [cls, text] of [["st-sw-committed", "Committed"], ["std-sw-shipped", "Completed"]]) {
    const row = legend.createDiv({ cls: "std-legend-row" });
    row.createSpan({ cls: "std-swatch " + cls });
    row.createSpan({ cls: "std-legend-label", text });
  }
  legend.createDiv({ cls: "std-legend-row std-muted", text: `Average velocity: ${avg} pts over ${rows.length} sprint${rows.length === 1 ? "" : "s"}` });
}

async function ensureFolder(app: App, path: string) {
  if (!path) return;
  let cur = "";
  for (const p of normalizePath(path).split("/")) {
    cur = cur ? `${cur}/${p}` : p;
    if (!app.vault.getAbstractFileByPath(cur)) await app.vault.createFolder(cur);
  }
}

/** Create the next sprint note after the last one. */
export async function createSprint(plugin: StarTrackerPlugin, model?: Model): Promise<TFile> {
  const m = model ?? plugin.model, s = m.s, f = s.fields;
  const all = m.sprints();
  const nums = all.map((x) => Number((x.name.match(/(\d+)\s*$/) || [])[1])).filter((x) => !isNaN(x));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  const last = all.filter((x) => x.end).pop();
  const today = dayOnly(new Date());
  let start = last && last.end ? new Date(dayOnly(last.end).getTime() + DAY) : today;
  if (start < today && !(last && last.state !== "closed")) start = today;
  const end = new Date(start.getTime() + (Math.max(1, s.sprintLengthDays) - 1) * DAY);
  const folder = normalizePath(s.sprintFolder || "").replace(/^\/$/, "");
  await ensureFolder(plugin.app, folder);
  let path = normalizePath(`${folder ? folder + "/" : ""}Sprint ${n}.md`);
  let k = 2;
  while (plugin.app.vault.getAbstractFileByPath(path)) path = normalizePath(`${folder ? folder + "/" : ""}Sprint ${n} (${k++}).md`);
  const file = await plugin.app.vault.create(path, "## Goal\n\n## Notes\n\n## Retro\n- Went well:\n- Could be better:\n");
  await plugin.app.fileManager.processFrontMatter(file, (fm: FM) => {
    fm.tags = [s.sprintTag || "sprint"];
    fm.state = "planned";
    fm[f.start] = isoDay(start);
    fm[f.end] = isoDay(end);
    fm.goal = "";
    fm.capacity = s.defaultCapacity || null;
  });
  return file;
}

export async function startSprint(plugin: StarTrackerPlugin, sp: Sprint, files: TFile[], model?: Model) {
  const m = model ?? plugin.model, f = m.s.fields;
  const other = m.sprints().find((x) => x.state === "active" && x.file.path !== sp.file.path);
  if (other) { new Notice(`${other.name} is still active. Complete it first.`); return; }
  const tasks = sprintTasks(m, files, sp);
  const today = dayOnly(new Date());
  await plugin.app.fileManager.processFrontMatter(sp.file, (fm: FM) => {
    fm.state = "active";
    const start = sp.start || today;
    if (!fm[f.start]) fm[f.start] = isoDay(start);
    if (!fm[f.end]) fm[f.end] = isoDay(new Date(dayOnly(start).getTime() + (m.s.sprintLengthDays - 1) * DAY));
    fm.committed_points = tasks.reduce((a, t) => a + t.points, 0);
    fm.committed_tasks = tasks.length;
  });
  new Notice(`${sp.name} started with ${tasks.length} tasks.`);
}

export class CompleteSprintModal extends Modal {
  target = "__backlog";
  constructor(app: App, private plugin: StarTrackerPlugin, private sprint: Sprint, private files: TFile[], private onDone: (next: TFile | null) => void, private model?: Model) { super(app); }
  get m(): Model { return this.model ?? this.plugin.model; }
  onOpen() {
    const m = this.m;
    const tasks = sprintTasks(m, this.files, this.sprint);
    const done = tasks.filter((t) => t.done), open = tasks.filter((t) => !t.done);
    const pts = (l: STask[]) => l.reduce((a, t) => a + t.points, 0);
    const { contentEl } = this;
    this.setTitle(`Complete ${this.sprint.name}`);
    contentEl.createEl("p", { text: `${done.length} done (${pts(done)} pts). ${open.length} not done (${pts(open)} pts).` });
    const next = m.sprints().filter((x) => x.state === "planned" && x.file.path !== this.sprint.file.path);
    if (open.length) {
      new Setting(contentEl).setName("Move unfinished tasks to").addDropdown((d) => {
        for (const sp of next) d.addOption(sp.file.path, sp.name);
        d.addOption("__new", "A new sprint");
        d.addOption("__backlog", "Backlog (no sprint)");
        this.target = next.length ? next[0].file.path : "__new";
        d.setValue(this.target).onChange((v) => (this.target = v));
      });
      const ul = contentEl.createEl("ul", { cls: "st-complete-list" });
      for (const t of open.slice(0, 12)) ul.createEl("li", { text: `${t.file.basename}${t.points ? ` (${t.points} pts)` : ""}` });
      if (open.length > 12) ul.createEl("li", { text: `+ ${open.length - 12} more` });
    }
    new Setting(contentEl).addButton((b) => b.setButtonText("Complete sprint").setCta().onClick(async () => {
      b.setDisabled(true);
      await this.complete(tasks, done, open);
    }));
  }
  async complete(tasks: STask[], done: STask[], open: STask[]) {
    const m = this.m;
    let nextFile: TFile | null = null;
    if (open.length) {
      if (this.target === "__new") nextFile = await createSprint(this.plugin, m);
      else if (this.target !== "__backlog") { const tf = this.app.vault.getAbstractFileByPath(this.target); nextFile = tf instanceof TFile ? tf : null; }
      const nextSp = nextFile ? { file: nextFile } as Sprint : null;
      for (const t of open) await m.setSprint(t.file, nextSp);
    }
    await this.app.fileManager.processFrontMatter(this.sprint.file, (fm: FM) => {
      fm.state = "closed";
      fm.completed_on = isoDay(Date.now());
      fm.completed_points = done.reduce((a, t) => a + t.points, 0);
      fm.completed_tasks = done.length;
      if (fm.committed_points === undefined || fm.committed_points === null) fm.committed_points = tasks.reduce((a, t) => a + t.points, 0);
      if (fm.committed_tasks === undefined || fm.committed_tasks === null) fm.committed_tasks = tasks.length;
      fm.carried_over = open.map((t) => `[[${t.file.basename}]]`);
    });
    new Notice(`${this.sprint.name} completed.`);
    this.close();
    this.onDone(nextFile);
  }
  onClose() { this.contentEl.empty(); }
}

export class StarSprintView extends StarBoardView {
  type = SPRINT_VIEW;
  selected: string | null = null;
  search = "";
  planDrag: string | null = null;

  constructor(controller: QueryController, containerEl: HTMLElement, plugin: StarTrackerPlugin) {
    super(controller, containerEl, plugin);
    this.root.removeClass("st-board");
    this.root.addClass("st-sprint");
    this.hideEmptyByDefault = true;
  }

  get tab(): Tab {
    const t = this.config.get("sprintTab");
    return t === "planning" || t === "report" ? t : "board";
  }
  taskFiles(): TFile[] {
    return (this.data?.data ?? []).map((e) => e.file).filter((f): f is TFile => f instanceof TFile);
  }
  current(all: Sprint[]): Sprint | null {
    if (this.selected) { const s = all.find((x) => x.file.path === this.selected); if (s) return s; }
    return this.m.activeSprint(all) || all.find((x) => x.state === "planned") || all[all.length - 1] || null;
  }
  cur: Sprint | null = null;
  includeEntry(fm: FM): boolean {
    return !!this.cur && this.m.sprintPathOf(fm, "") === this.cur.file.path;
  }
  newCardFm(fm: FM) {
    if (this.cur) fm[this.s.fields.sprint] = `[[${this.cur.file.basename}]]`;
  }

  render() {
    const root = this.root;
    const keepScroll = root.querySelector(".st-sprint-body");
    const sx = keepScroll ? keepScroll.scrollLeft : 0;
    root.empty();
    const all = this.m.sprints();
    const sp = this.current(all);
    this.cur = sp;
    this.header(root, all, sp);
    if (!sp) {
      const e = root.createDiv({ cls: "st-sprint-empty" });
      e.createDiv({ text: "No sprints yet." });
      e.createEl("button", { text: "Create the first sprint", cls: "mod-cta" }).addEventListener("click", () => void this.newSprint());
      return;
    }
    const body = root.createDiv({ cls: "st-sprint-body st-tab-" + this.tab });
    if (this.tab === "board") { this.renderBoard(body); body.scrollLeft = sx; }
    else if (this.tab === "planning") this.planning(body, sp);
    else this.report(body, sp, all);
  }

  header(root: HTMLElement, all: Sprint[], sp: Sprint | null) {
    const head = root.createDiv({ cls: "st-sprint-head" });
    const left = head.createDiv({ cls: "st-sprint-title" });
    if (all.length) {
      const sel = left.createEl("select", { cls: "dropdown" });
      for (const x of all) {
        const o = sel.createEl("option", { text: `${x.name}${x.state === "active" ? " (active)" : x.state === "closed" ? " (closed)" : ""}` });
        o.value = x.file.path;
      }
      if (sp) sel.value = sp.file.path;
      sel.addEventListener("change", () => { this.selected = sel.value; this.render(); });
    }
    if (sp) {
      left.createSpan({ cls: "st-state st-state-" + sp.state, text: sp.state });
      const tasks = sprintTasks(this.m, this.taskFiles(), sp);
      const pts = tasks.reduce((a, t) => a + t.points, 0);
      const donePts = tasks.filter((t) => t.done).reduce((a, t) => a + t.points, 0);
      const meta = head.createDiv({ cls: "st-sprint-meta" });
      const today = dayOnly(new Date());
      let when = "No dates";
      if (sp.start && sp.end) {
        when = `${fmtDay(sp.start)} – ${fmtDay(sp.end)}`;
        if (sp.state !== "closed") {
          const left2 = daysBetween(today, sp.end);
          when += left2 >= 0 ? ` · ${left2} day${left2 === 1 ? "" : "s"} left` : ` · ${-left2} day${left2 === -1 ? "" : "s"} over`;
        }
      }
      meta.createSpan({ text: when });
      meta.createSpan({ text: `${tasks.filter((t) => t.done).length}/${tasks.length} tasks done` });
      meta.createSpan({ text: `${donePts}/${pts} pts${sp.capacity ? ` · capacity ${sp.capacity}` : ""}` });
      if (sp.goal) head.createDiv({ cls: "st-sprint-goal", text: `Goal: ${sp.goal}` });
    }
    const actions = head.createDiv({ cls: "st-sprint-actions" });
    const tabs = actions.createDiv({ cls: "st-tabs" });
    for (const [id, label] of [["board", "Board"], ["planning", "Planning"], ["report", "Report"]] as [Tab, string][]) {
      const b = tabs.createEl("button", { text: label });
      if (this.tab === id) b.addClass("is-active");
      b.addEventListener("click", () => { this.config.set("sprintTab", id); this.render(); });
    }
    if (sp && sp.state === "planned") actions.createEl("button", { text: "Start sprint", cls: "mod-cta" }).addEventListener("click", () => void startSprint(this.plugin, sp, this.taskFiles(), this.m));
    if (sp && sp.state === "active") actions.createEl("button", { text: "Complete sprint", cls: "mod-cta" }).addEventListener("click", () =>
      new CompleteSprintModal(this.app, this.plugin, sp, this.taskFiles(), (next) => { if (next) this.selected = next.path; }, this.m).open());
    actions.createEl("button", { text: "New sprint" }).addEventListener("click", () => void this.newSprint());
    if (sp) actions.createEl("button", { text: "Open note" }).addEventListener("click", (e) => openFile(this.app, sp.file, e));
  }

  async newSprint() {
    const file = await createSprint(this.plugin, this.m);
    this.selected = file.path;
    window.setTimeout(() => this.render(), 150);
  }

  // ---------------- planning ----------------
  planning(body: HTMLElement, sp: Sprint) {
    const m = this.m, f = this.s.fields;
    const sprints = m.sprints();
    const closed = new Set(sprints.filter((x) => x.state === "closed").map((x) => x.file.path));
    const inSprint: STask[] = [], backlog: STask[] = [];
    for (const file of this.taskFiles()) {
      const fm = fmOf(this.app, file);
      if (m.isEpic(fm)) continue;
      const status = clean(fm[f.status]) || "";
      const t: STask = { file, fm, status, points: m.pointsOf(fm), done: m.isDone(status), doneOn: null };
      const path = m.sprintPathOf(fm, file.path);
      if (path === sp.file.path) inSprint.push(t);
      else if (!t.done && (!path || closed.has(path))) backlog.push(t);
    }
    const pIdx = (t: STask) => { const i = this.s.priorities.findIndex((p) => p.name === clean(t.fm[f.priority])); return i < 0 ? 99 : i; };
    const sortFn = (a: STask, b: STask) => pIdx(a) - pIdx(b) || a.file.basename.localeCompare(b.file.basename, undefined, { numeric: true });
    backlog.sort(sortFn); inSprint.sort(sortFn);

    const grid = body.createDiv({ cls: "st-plan" });
    // backlog pane
    const bl = grid.createDiv({ cls: "st-plan-pane" });
    const bh = bl.createDiv({ cls: "st-plan-head" });
    bh.createDiv({ cls: "st-plan-title", text: `Backlog (${backlog.length})` });
    const input = bh.createEl("input", { type: "search", cls: "st-plan-search", attr: { placeholder: "Filter backlog" } });
    input.value = this.search;
    const q = this.search.toLowerCase();
    const shown = q ? backlog.filter((t) => t.file.basename.toLowerCase().includes(q)) : backlog;
    const blList = bl.createDiv({ cls: "st-plan-list" });
    for (const t of shown) this.planRow(blList, t, sp, false);
    if (!shown.length) blList.createDiv({ cls: "std-muted st-plan-empty", text: q ? "No backlog task matches." : "Backlog is empty." });
    input.addEventListener("input", () => {
      this.search = input.value;
      const pos = input.selectionStart;
      this.render();
      const again = this.root.querySelector<HTMLInputElement>(".st-plan-search");
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    });
    this.planDrop(bl, null);

    // sprint pane
    const sprintPane = grid.createDiv({ cls: "st-plan-pane st-plan-sprint" });
    const sh = sprintPane.createDiv({ cls: "st-plan-head" });
    const pts = inSprint.reduce((a, t) => a + t.points, 0);
    sh.createDiv({ cls: "st-plan-title", text: `${sp.name} (${inSprint.length})` });
    const cap = sp.capacity || 0;
    const capEl = sh.createDiv({ cls: "st-capacity" + (cap && pts > cap ? " is-over" : "") });
    capEl.createSpan({ text: cap ? `${pts} / ${cap} pts` : `${pts} pts` });
    if (cap) capEl.createDiv({ cls: "st-capacity-track" }).createDiv({ cls: "st-capacity-fill" }).style.width = Math.min(100, Math.round((pts / cap) * 100)) + "%";
    const unestimated = inSprint.filter((t) => !t.points).length;
    if (unestimated) sh.createDiv({ cls: "std-muted", text: `${unestimated} task${unestimated === 1 ? " has" : "s have"} no points` });
    const spList = sprintPane.createDiv({ cls: "st-plan-list" });
    for (const t of inSprint) this.planRow(spList, t, sp, true);
    if (!inSprint.length) spList.createDiv({ cls: "std-muted st-plan-empty", text: "Drag tasks here from the backlog." });
    this.planDrop(sprintPane, sp);
  }

  planRow(parent: HTMLElement, t: STask, sp: Sprint, inSprint: boolean) {
    const m = this.m, f = this.s.fields;
    const row = parent.createDiv({ cls: "st-plan-row", attr: { draggable: "true" } });
    row.addEventListener("dragstart", (ev) => { this.planDrag = t.file.path; row.addClass("is-dragging"); if (ev.dataTransfer) ev.dataTransfer.setData("text/plain", t.file.path); });
    row.addEventListener("dragend", () => { this.planDrag = null; row.removeClass("is-dragging"); });
    const td = m.typeDef(clean(t.fm[f.type]));
    const ic = row.createSpan({ cls: "st-plan-icon", text: td.icon });
    ic.style.color = td.color; ic.title = td.name;
    const a = row.createEl("a", { cls: "st-plan-name", text: t.file.basename, href: "#" });
    a.addEventListener("click", (e) => { e.preventDefault(); openFile(this.app, t.file, e); });
    const pr = clean(t.fm[f.priority]);
    if (pr) { const c = row.createSpan({ cls: "st-chip st-prio", text: pr }); c.style.setProperty("--st-chip", m.priorityColor(pr)); }
    const st = row.createSpan({ cls: "st-chip st-pill", text: t.status || "No status" });
    st.style.setProperty("--st-chip", m.statusColor(t.status));
    const ptsEl = row.createSpan({ cls: "st-chip st-points" + (t.points ? "" : " is-empty"), text: t.points ? `${t.points} pts` : "– pts" });
    ptsEl.title = "Set points";
    ptsEl.addEventListener("click", (ev) => {
      const menu = new Menu();
      for (const p of this.s.pointScale) menu.addItem((i) => i.setTitle(String(p)).setChecked(t.points === p).onClick(() => this.setPoints(t.file, p)));
      menu.addItem((i) => i.setTitle("Clear").onClick(() => this.setPoints(t.file, null)));
      menu.showAtMouseEvent(ev);
    });
    const mv = row.createEl("button", { cls: "st-plan-move clickable-icon", text: inSprint ? "←" : "→" });
    mv.title = inSprint ? "Move to backlog" : `Add to ${sp.name}`;
    mv.addEventListener("click", () => void m.setSprint(t.file, inSprint ? null : sp));
  }

  async setPoints(file: TFile, p: number | null) {
    await this.app.fileManager.processFrontMatter(file, (fm: FM) => { fm[this.s.fields.points] = p; });
  }

  planDrop(pane: HTMLElement, sp: Sprint | null) {
    pane.addEventListener("dragover", (ev) => { if (!this.planDrag) return; ev.preventDefault(); pane.addClass("is-drop-target"); });
    pane.addEventListener("dragleave", (ev) => { if (!pane.contains(ev.relatedTarget as Node)) pane.removeClass("is-drop-target"); });
    pane.addEventListener("drop", (ev) => {
      ev.preventDefault();
      pane.removeClass("is-drop-target");
      const path = this.planDrag;
      this.planDrag = null;
      const file = path && this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return;
      const cur = this.m.sprintPathOf(fmOf(this.app, file), file.path);
      if ((sp ? sp.file.path : null) === cur) return;
      void this.m.setSprint(file, sp);
    });
  }

  // ---------------- report ----------------
  report(body: HTMLElement, sp: Sprint, all: Sprint[]) {
    const files = this.taskFiles();
    const tasks = sprintTasks(this.m, files, sp);
    const done = tasks.filter((t) => t.done), open = tasks.filter((t) => !t.done);
    const pts = (l: STask[]) => l.reduce((a, t) => a + t.points, 0);
    const kpis = body.createDiv({ cls: "std-kpis" });
    const kpi = (label: string, value: string | number, sub?: string, tone?: string) => {
      const el = kpis.createDiv({ cls: "std-kpi" + (tone ? " std-" + tone : "") });
      el.createDiv({ cls: "std-kpi-value", text: String(value) });
      el.createDiv({ cls: "std-kpi-label", text: label });
      if (sub) el.createDiv({ cls: "std-kpi-sub", text: sub });
    };
    const committed = sp.committedPoints ?? pts(tasks);
    kpi("Committed", committed, `${plural(sp.committedTasks ?? tasks.length, "task")} at start`);
    kpi("Completed", pts(done), plural(done.length, "task"));
    kpi("Remaining", pts(open), plural(open.length, "task"), open.length && sp.state === "closed" ? "warn" : undefined);
    const added = sp.committedTasks !== null ? tasks.length - sp.committedTasks : 0;
    kpi("Scope change", added > 0 ? `+${added}` : String(added), "tasks since start");
    if (sp.capacity) kpi("Capacity", sp.capacity, pts(tasks) > sp.capacity ? "over capacity" : "points", pts(tasks) > sp.capacity ? "bad" : undefined);
    const c1 = body.createDiv({ cls: "std-card" });
    c1.createDiv({ cls: "std-card-title", text: `Burndown · ${sp.name}` });
    renderBurndown(c1, this.m, sp, tasks);
    const c2 = body.createDiv({ cls: "std-card" });
    c2.createDiv({ cls: "std-card-title", text: "Velocity" });
    renderVelocity(c2, this.m, all, files);
    if (open.length) {
      const c3 = body.createDiv({ cls: "std-card" });
      c3.createDiv({ cls: "std-card-title", text: `Not done (${open.length})` });
      const table = c3.createEl("table", { cls: "std-table" });
      const hr = table.createEl("thead").createEl("tr");
      for (const h of ["Task", "Status", "Points", "Owner"]) hr.createEl("th", { text: h });
      const tb = table.createEl("tbody");
      for (const t of open) {
        const tr = tb.createEl("tr");
        const a = tr.createEl("td").createEl("a", { cls: "std-link", text: t.file.basename, href: "#" });
        a.addEventListener("click", (e) => { e.preventDefault(); openFile(this.app, t.file, e); });
        tr.createEl("td").createSpan({ cls: "std-pill", text: t.status }).style.setProperty("--pill", this.m.statusColor(t.status) || GRAY);
        tr.createEl("td", { text: t.points ? String(t.points) : "" });
        tr.createEl("td", { text: clean(t.fm[this.s.fields.owner]) || "" });
      }
    }
  }
}

export function sprintOptions(_plugin: StarTrackerPlugin) {
  return (): BasesAllOptions[] => [
    { type: "toggle", key: "hideEmptyColumns", displayName: "Hide empty columns", default: true },
    { type: "toggle", key: "showEpic", displayName: "Show epic on cards", default: true },
  ] as BasesAllOptions[];
}
