import { BasesView, TFile, QueryController } from "obsidian";
import type StarTrackerPlugin from "../main";
import { renderBurndown, renderVelocity, sprintTasks } from "./sprint";
import { DAY, GRAY, clean, countBy, fmOf, fmtDay, list, openFile, parseDate, startOfWeek, svg } from "../util";

export const DASHBOARD_VIEW = "star-dashboard";

interface Task {
  file: TFile; title: string; status: string; owner: string | null; waiting: string | null; area: string | null;
  type: string | null; opened: Date | null; closed: Date | null; due: Date | null; priority: string;
  isEpic: boolean; roles: Record<string, string | null>; start: Date | null; end: Date | null;
  blockedBy: unknown[]; related: string[]; mtime: number;
}

export class StarDashboardView extends BasesView {
  type = DASHBOARD_VIEW;
  plugin: StarTrackerPlugin;
  rootEl: HTMLElement;
  timer: number | null = null;

  constructor(controller: QueryController, scrollEl: HTMLElement, plugin: StarTrackerPlugin) {
    super(controller);
    this.plugin = plugin;
    this.rootEl = scrollEl.createDiv({ cls: "std-root" });
  }
  get m() { return this.plugin.model; }
  get s() { return this.plugin.settings; }
  onDataUpdated() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), 60);
  }
  onunload() { if (this.timer) window.clearTimeout(this.timer); }

  collect(): Task[] {
    const f = this.s.fields;
    const out: Task[] = [];
    for (const entry of (this.data && this.data.data) || []) {
      const file = entry.file;
      if (!file) continue;
      const fm = fmOf(this.app, file);
      const roles: Record<string, string | null> = {};
      for (const r of this.s.roleFields) roles[r.field] = clean(fm[r.field]);
      out.push({
        file, title: file.basename,
        status: clean(fm[f.status]) || "No status",
        owner: clean(fm[f.owner]), waiting: clean(fm[f.waitingOn]), area: clean(fm[f.area]), type: clean(fm[f.type]),
        opened: parseDate(fm[f.opened]), closed: parseDate(fm[f.closed]), due: parseDate(fm[f.due]),
        priority: clean(fm[f.priority]) || "No priority",
        isEpic: this.m.isEpic(fm), roles,
        start: parseDate(fm[f.start]), end: parseDate(fm[f.end]),
        blockedBy: list(fm[f.blockedBy]),
        related: [...new Set(list(fm[f.related]).map(clean).filter(Boolean))] as string[],
        mtime: file.stat ? file.stat.mtime : 0,
      });
    }
    return out;
  }

  render() {
    const root = this.rootEl;
    root.empty();
    const tasks = this.collect();
    if (!tasks.length) { root.createDiv({ cls: "std-empty", text: "No tasks match this view's filters." }); return; }
    const S = this.s, m = this.m;
    const done = (t: Task) => m.isDone(t.status);
    const now = Date.now(), week = now - 7 * DAY;
    const open = tasks.filter((t) => !done(t));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rel = S.relatedLabel || "Related";

    const kpis = root.createDiv({ cls: "std-kpis" });
    const kpi = (label: string, value: number, sub?: string, tone?: string) => {
      const el = kpis.createDiv({ cls: "std-kpi" + (tone ? " std-" + tone : "") });
      el.createDiv({ cls: "std-kpi-value", text: String(value) });
      el.createDiv({ cls: "std-kpi-label", text: label });
      if (sub) el.createDiv({ cls: "std-kpi-sub", text: sub });
    };
    kpi("Open", open.length, `${tasks.length} total`);
    kpi(S.doneStatus || "Done", tasks.length - open.length, `${tasks.filter((t) => done(t) && t.closed && t.closed.getTime() >= week).length} in last 7 days`);
    kpi("Created, last 7 days", tasks.filter((t) => t.opened && t.opened.getTime() >= week).length);
    kpi("Moved, last 7 days", tasks.filter((t) => t.mtime >= week).length, "notes edited");
    const top = S.priorities[0];
    if (top) kpi(top.name, open.filter((t) => t.priority === top.name).length, "open tasks", "bad");
    if (S.attentionStatus) kpi(S.attentionStatus, open.filter((t) => t.status === S.attentionStatus).length, undefined, "bad");
    kpi("Blocked by a task", open.filter((t) => t.blockedBy.length).length, `open, ${S.fields.blockedBy} set`, "warn");
    kpi("Open epics", tasks.filter((t) => t.isEpic && !done(t)).length, `type ${m.epicType()}`);
    kpi(`Tied to a ${rel.toLowerCase()}`, open.filter((t) => t.related.length).length, "open tasks");
    kpi("Overdue", open.filter((t) => t.due && t.due < today).length, "open, past due date", "warn");

    let grid: HTMLElement = null;
    const section = (cls: string) => { grid = root.createDiv({ cls: "std-grid " + cls }); };
    const card = (title: string) => {
      const c = grid.createDiv({ cls: "std-card" });
      c.createDiv({ cls: "std-card-title", text: title });
      return c.createDiv({ cls: "std-card-body" });
    };

    // status + priority donuts
    const order = S.statuses.map((x) => x.name);
    const statusCounts = new Map<string, number>();
    for (const t of tasks) statusCounts.set(t.status, (statusCounts.get(t.status) || 0) + 1);
    const statusRows: [string, number][] = [
      ...order.filter((s) => statusCounts.has(s)).map((s) => [s, statusCounts.get(s)] as [string, number]),
      ...[...statusCounts.entries()].filter(([s]) => !order.includes(s)),
    ];
    section("std-two");
    this.donut(card("Status"), statusRows, (s) => m.statusColor(s), tasks.length);
    const pOrder = [...S.priorities.map((p) => p.name), "No priority"];
    const pc = new Map<string, number>();
    for (const t of open) pc.set(t.priority, (pc.get(t.priority) || 0) + 1);
    const prRows: [string, number][] = [
      ...pOrder.filter((p) => pc.has(p)).map((p) => [p, pc.get(p)] as [string, number]),
      ...[...pc.entries()].filter(([p]) => !pOrder.includes(p)),
    ];
    this.donut(card("Open tasks by priority"), prRows, (p) => (p === "No priority" ? "#4B5563" : m.priorityColor(p)), open.length, "open");

    // stages
    section("std-one");
    const stageBody = card("By stage");
    this.bars(stageBody, S.stages.map((st) => [st.name, tasks.filter((t) => m.stageOf(t.status) === st.name).length] as [string, number]),
      (l) => (S.stages.find((s) => s.name === l) || { color: GRAY }).color);
    const brk = stageBody.createDiv({ cls: "std-breakdown" });
    const doneStage = m.stageOf(S.doneStatus);
    for (const st of S.stages) {
      if (st.name === doneStage) continue;
      const row = brk.createDiv({ cls: "std-breakdown-row" });
      row.createDiv({ cls: "std-breakdown-stage", text: st.name });
      const parts = row.createDiv({ cls: "std-breakdown-parts" });
      for (const name of m.statusesIn(st.name)) {
        const chip = parts.createSpan({ cls: "std-pill", text: `${name} ${statusCounts.get(name) || 0}` });
        chip.style.setProperty("--pill", m.statusColor(name));
      }
    }

    // sprint
    const sprints = m.sprints();
    const active = m.activeSprint(sprints);
    const files = tasks.map((t) => t.file);
    if (active || sprints.some((x) => x.state === "closed")) {
      section("std-two");
      if (active) {
        const st = sprintTasks(m, files, active);
        const pts = st.reduce((a, t) => a + t.points, 0), donePts = st.filter((t) => t.done).reduce((a, t) => a + t.points, 0);
        let left = "";
        if (active.end) { const d = Math.round((new Date(active.end).setHours(0, 0, 0, 0) - today.getTime()) / DAY); left = d >= 0 ? ` · ${d} days left` : ` · ${-d} days over`; }
        const b = card(`${active.name}: ${donePts}/${pts} pts, ${st.filter((t) => t.done).length}/${st.length} tasks${left}`);
        renderBurndown(b, m, active, st);
      } else card("No active sprint").createDiv({ cls: "std-muted", text: "Start a sprint from the Sprint view." });
      renderVelocity(card("Velocity"), m, sprints, files);
    }

    // open epics
    const epicRows = tasks.filter((t) => t.isEpic && !done(t)).map((e) => ({ e, kids: [] as Task[] }));
    const byPath = new Map(epicRows.map((r) => [r.e.file.path, r]));
    let noEpicOpen = 0;
    for (const t of tasks) {
      if (t.isEpic) continue;
      const ep = m.findEpic(t.file);
      if (ep && byPath.has(ep.path)) byPath.get(ep.path).kids.push(t);
      else if (!ep && !done(t)) noEpicOpen++;
    }
    section("std-one");
    const eb = card(`Open epics (${epicRows.length})`);
    if (!epicRows.length) eb.createDiv({ cls: "std-muted", text: `No open epics. Add one from the Timeline view with + ${m.epicType()}.` });
    else {
      const table = eb.createEl("table", { cls: "std-table" });
      const hr = table.createEl("thead").createEl("tr");
      for (const h of ["Epic", "Status", "Dates", "Progress", "Open", S.attentionStatus, "Owner"].filter(Boolean)) hr.createEl("th", { text: h });
      const tb = table.createEl("tbody");
      epicRows.sort((a, b) => (a.e.end?.getTime() ?? 9e15) - (b.e.end?.getTime() ?? 9e15));
      for (const { e, kids } of epicRows) {
        const tr = tb.createEl("tr");
        const a = tr.createEl("td").createEl("a", { cls: "std-link", text: e.title, href: "#" });
        a.addEventListener("click", (ev) => { ev.preventDefault(); openFile(this.app, e.file, ev); });
        const st = tr.createEl("td").createSpan({ cls: "std-pill", text: e.status });
        st.style.setProperty("--pill", m.statusColor(e.status));
        const late = e.end && e.end < today;
        tr.createEl("td", { cls: "stw-nowrap" + (late ? " std-late" : ""), text: e.start || e.end ? `${e.start ? fmtDay(e.start) : "?"} – ${e.end ? fmtDay(e.end) : "?"}${late ? " · late" : ""}` : "No dates" });
        const d = kids.filter(done).length;
        const pcell = tr.createEl("td");
        const bar = pcell.createDiv({ cls: "std-epic-progress" });
        bar.createDiv({ cls: "std-epic-progress-fill" }).style.width = kids.length ? Math.round((d / kids.length) * 100) + "%" : "0%";
        pcell.createSpan({ cls: "std-muted", text: kids.length ? ` ${d}/${kids.length} ${S.doneStatus.toLowerCase()}` : " no children" });
        tr.createEl("td", { text: String(kids.length - d) });
        if (S.attentionStatus) tr.createEl("td", { text: String(kids.filter((k) => k.status === S.attentionStatus).length) });
        tr.createEl("td", { text: e.owner || "" });
      }
    }
    eb.createDiv({ cls: "std-muted std-epic-note", text: `${noEpicOpen} open task${noEpicOpen === 1 ? " is" : "s are"} not under any epic.` });

    section("std-one");
    this.weekly(card(`Created vs ${S.doneStatus.toLowerCase()}, last 8 weeks`), tasks, done);

    // people
    section("std-two");
    this.bars(card("Open tasks by owner"), countBy(open, (t) => t.owner));
    this.bars(card("Open tasks waiting on"), countBy(open, (t) => t.waiting));
    this.bars(card("Open tasks by area"), countBy(open, (t) => t.area));
    this.bars(card("Open tasks by type"), countBy(open, (t) => t.type), (l) => m.typeDef(l).color);
    for (const r of S.roleFields) {
      if (!r.field) continue;
      this.bars(card(`${r.label} (open tasks)`), countBy(open.filter((t) => t.roles[r.field]), (t) => t.roles[r.field]));
    }

    // related records
    const relMap = new Map<string, { open: number; done: number; moved: number }>();
    for (const t of tasks) for (const d of t.related) {
      const r = relMap.get(d) || { open: 0, done: 0, moved: 0 };
      if (done(t)) r.done++; else r.open++;
      if (t.mtime >= week) r.moved++;
      relMap.set(d, r);
    }
    const linked = tasks.filter((t) => t.related.length);
    section("std-one");
    const relBody = card(`Tasks by ${rel.toLowerCase()}`);
    const ins = relBody.createDiv({ cls: "std-insight" });
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
    ins.createDiv({ text: `${linked.length} of ${tasks.length} tasks (${pct(linked.length, tasks.length)}%) are linked to ${relMap.size} ${rel.toLowerCase()}${relMap.size === 1 ? "" : "s"}.` });
    ins.createDiv({ text: `${linked.filter((t) => t.mtime >= week).length} of those ${linked.length} moved in the last 7 days. ${linked.filter(done).length} are ${S.doneStatus.toLowerCase()}.` });
    ins.createDiv({ text: `${tasks.length - linked.length} tasks are not linked to any ${rel.toLowerCase()}.` });
    this.relBars(relBody, [...relMap.entries()].sort((a, b) => (b[1].open + b[1].done) - (a[1].open + a[1].done)));

    const recentAll = tasks.filter((t) => t.mtime >= week);
    const recent = recentAll.sort((a, b) => b.mtime - a.mtime).slice(0, 15);
    this.table(card(`Recently moved (${recentAll.length} in last 7 days, newest 15 shown)`), recent);
  }

  donut(el: HTMLElement, rows: [string, number][], colorFn: (l: string) => string, total: number, centerLabel?: string) {
    const wrap = el.createDiv({ cls: "std-donut" });
    const s = svg("svg", { viewBox: "0 0 120 120", class: "std-donut-svg" }, wrap);
    const r = 46, c = 2 * Math.PI * r;
    let offset = 0;
    svg("circle", { cx: 60, cy: 60, r, fill: "none", stroke: "var(--background-modifier-border)", "stroke-width": 18 }, s);
    for (const [label, n] of rows) {
      const len = total ? (n / total) * c : 0;
      const arc = svg("circle", {
        cx: 60, cy: 60, r, fill: "none", stroke: colorFn(label), "stroke-width": 18,
        "stroke-dasharray": `${Math.max(len - 1, 0.5)} ${c}`, "stroke-dashoffset": -offset, transform: "rotate(-90 60 60)",
      }, s);
      svg("title", {}, arc).textContent = `${label}: ${n} (${total ? Math.round((n / total) * 100) : 0}%)`;
      offset += len;
    }
    svg("text", { x: 60, y: 58, "text-anchor": "middle", class: "std-donut-num" }, s).textContent = String(total);
    svg("text", { x: 60, y: 74, "text-anchor": "middle", class: "std-donut-lbl" }, s).textContent = centerLabel || "tasks";
    const legend = wrap.createDiv({ cls: "std-legend" });
    for (const [label, n] of rows) {
      const row = legend.createDiv({ cls: "std-legend-row" });
      row.createSpan({ cls: "std-swatch" }).style.background = colorFn(label);
      row.createSpan({ cls: "std-legend-label", text: label });
      row.createSpan({ cls: "std-legend-num", text: `${n} · ${total ? Math.round((n / total) * 100) : 0}%` });
    }
  }

  bars(el: HTMLElement, rows: [string, number][], colorFn?: (l: string) => string) {
    if (!rows.length) { el.createDiv({ cls: "std-muted", text: "Nothing here." }); return; }
    const max = Math.max(...rows.map((r) => r[1]), 1);
    const listEl = el.createDiv({ cls: "std-bars" });
    for (const [label, n] of rows.slice(0, 12)) {
      const row = listEl.createDiv({ cls: "std-bar-row" });
      row.createDiv({ cls: "std-bar-label", text: label });
      const fill = row.createDiv({ cls: "std-bar-track" }).createDiv({ cls: "std-bar-fill" });
      fill.style.width = `${(n / max) * 100}%`;
      const col = colorFn && colorFn(label);
      if (col) fill.style.background = col;
      row.createDiv({ cls: "std-bar-num", text: String(n) });
    }
    if (rows.length > 12) el.createDiv({ cls: "std-muted", text: `+ ${rows.length - 12} more` });
  }

  relBars(el: HTMLElement, rows: [string, { open: number; done: number; moved: number }][]) {
    const S = this.s;
    if (!rows.length) { el.createDiv({ cls: "std-muted", text: `No tasks are linked to a ${S.relatedLabel.toLowerCase()}. Set ${S.fields.related} on a task.` }); return; }
    const max = Math.max(...rows.map(([, r]) => r.open + r.done));
    const listEl = el.createDiv({ cls: "std-bars" });
    for (const [name, r] of rows) {
      const row = listEl.createDiv({ cls: "std-bar-row std-deal-row" });
      const a = row.createDiv({ cls: "std-bar-label" }).createEl("a", { cls: "std-link", text: name, href: "#" });
      a.addEventListener("click", (e) => { e.preventDefault(); void this.app.workspace.openLinkText(name, "", e.ctrlKey || e.metaKey); });
      const track = row.createDiv({ cls: "std-bar-track std-stack" });
      const o = track.createDiv({ cls: "std-bar-fill std-deal-open" });
      o.style.width = `${(r.open / max) * 100}%`; o.title = `${name}: ${r.open} open`;
      const sh = track.createDiv({ cls: "std-bar-fill std-deal-shipped" });
      sh.style.width = `${(r.done / max) * 100}%`; sh.title = `${name}: ${r.done} ${S.doneStatus.toLowerCase()}`;
      const n = r.open + r.done;
      row.createDiv({ cls: "std-bar-num", text: `${n} task${n === 1 ? "" : "s"} · ${r.open} open · ${r.done} ${S.doneStatus.toLowerCase()} · ${r.moved} moved (7d)` });
    }
    const legend = el.createDiv({ cls: "std-legend std-legend-inline" });
    for (const [cls, text] of [["std-sw-open", "Open"], ["std-sw-shipped", S.doneStatus]]) {
      const row = legend.createDiv({ cls: "std-legend-row" });
      row.createSpan({ cls: "std-swatch " + cls });
      row.createSpan({ cls: "std-legend-label", text });
    }
  }

  weekly(el: HTMLElement, tasks: Task[], done: (t: Task) => boolean) {
    const thisWeek = startOfWeek(new Date(), this.s.weekStartsMonday);
    const weeks: Date[] = [];
    for (let i = 7; i >= 0; i--) { const w = new Date(thisWeek); w.setDate(w.getDate() - 7 * i); weeks.push(w); }
    const idx = (d: Date | null) => d ? weeks.findIndex((x) => x.getTime() === startOfWeek(d, this.s.weekStartsMonday).getTime()) : -1;
    const created = weeks.map(() => 0), shipped = weeks.map(() => 0);
    for (const t of tasks) {
      const a = idx(t.opened); if (a >= 0) created[a]++;
      if (done(t)) { const b = idx(t.closed); if (b >= 0) shipped[b]++; }
    }
    const max = Math.max(1, ...created, ...shipped);
    const W = 1000, H = 220, padL = 28, padB = 26, padT = 20;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "std-weekly" }, el);
    const plotH = H - padB - padT, slot = (W - padL) / weeks.length, bw = Math.min(22, slot / 3);
    for (let g = 0; g <= 4; g++) {
      const y = padT + plotH - (g / 4) * plotH;
      svg("line", { x1: padL, x2: W, y1: y, y2: y, class: "std-grid-line" }, s);
      svg("text", { x: padL - 6, y: y + 4, "text-anchor": "end", class: "std-axis" }, s).textContent = String(Math.round((g / 4) * max));
    }
    weeks.forEach((w, i) => {
      const x0 = padL + i * slot + slot / 2;
      const bar = (val: number, dx: number, cls: string, label: string) => {
        const h = (val / max) * plotH;
        const rect = svg("rect", { x: x0 + dx, y: padT + plotH - h, width: bw, height: Math.max(h, 0), rx: 3, class: cls }, s);
        svg("title", {}, rect).textContent = `${label}, week of ${fmtDay(w)}: ${val}`;
        if (val) svg("text", { x: x0 + dx + bw / 2, y: padT + plotH - h - 4, "text-anchor": "middle", class: "std-val" }, s).textContent = String(val);
      };
      bar(created[i], -bw - 2, "std-created", "Created");
      bar(shipped[i], 2, "std-shipped", this.s.doneStatus);
      svg("text", { x: x0, y: H - 8, "text-anchor": "middle", class: "std-axis" }, s).textContent = fmtDay(w);
    });
    const legend = el.createDiv({ cls: "std-legend std-legend-inline" });
    for (const [cls, text] of [["std-sw-created", "Created (opened)"], ["std-sw-shipped", `${this.s.doneStatus} (closed)`]]) {
      const row = legend.createDiv({ cls: "std-legend-row" });
      row.createSpan({ cls: "std-swatch " + cls });
      row.createSpan({ cls: "std-legend-label", text });
    }
  }

  table(el: HTMLElement, rows: Task[]) {
    if (!rows.length) { el.createDiv({ cls: "std-muted", text: "No task notes edited in the last 7 days." }); return; }
    const table = el.createEl("table", { cls: "std-table" });
    const head = table.createEl("thead").createEl("tr");
    for (const h of ["Task", "Status", "Owner", "Waiting on", "Edited"]) head.createEl("th", { text: h });
    const tb = table.createEl("tbody");
    for (const t of rows) {
      const tr = tb.createEl("tr");
      const a = tr.createEl("td").createEl("a", { cls: "std-link", text: t.title, href: "#" });
      a.addEventListener("click", (e) => { e.preventDefault(); openFile(this.app, t.file, e); });
      tr.createEl("td").createSpan({ cls: "std-pill", text: t.status }).style.setProperty("--pill", this.m.statusColor(t.status));
      tr.createEl("td", { text: t.owner || "" });
      tr.createEl("td", { text: t.waiting || "" });
      tr.createEl("td", { text: new Date(t.mtime).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) });
    }
  }
}
