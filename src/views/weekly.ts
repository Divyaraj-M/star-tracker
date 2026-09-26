import { BasesView, Notice, TFile, QueryController } from "obsidian";
import type StarTrackerPlugin from "../main";
import { DAY, LogMove, clean, fmOf, fmtDay, openFile, parseDate, parseLog, startOfWeek, str } from "../util";

export const WEEKLY_VIEW = "star-weekly";

interface WTask {
  file: TFile; title: string; status: string; owner: string | null; waiting: string | null;
  bucket: string | null; source: string | null; next: string; opened: Date | null; closed: Date | null; due: Date | null;
  log: LogMove[]; move?: LogMove;
}

export class StarWeeklyView extends BasesView {
  type = WEEKLY_VIEW;
  plugin: StarTrackerPlugin;
  rootEl: HTMLElement;
  weekStart: Date;
  timer: number | null = null;

  constructor(controller: QueryController, scrollEl: HTMLElement, plugin: StarTrackerPlugin) {
    super(controller);
    this.plugin = plugin;
    this.rootEl = scrollEl.createDiv({ cls: "std-root" });
    this.weekStart = startOfWeek(new Date(), plugin.settings.weekStartsMonday);
  }
  get m() { return this.plugin.model; }
  get s() { return this.plugin.settings; }
  onDataUpdated() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.render(), 60);
  }
  onunload() { if (this.timer) window.clearTimeout(this.timer); }

  collect(): WTask[] {
    const f = this.s.fields;
    const out: WTask[] = [];
    for (const entry of (this.data && this.data.data) || []) {
      const file = entry.file;
      if (!file) continue;
      const fm = fmOf(this.app, file);
      out.push({
        file, title: file.basename,
        status: clean(fm[f.status]) || "No status",
        owner: clean(fm[f.owner]), waiting: clean(fm[f.waitingOn]),
        bucket: clean(fm[f.bucket]), source: clean(fm[f.source]),
        next: str(fm[f.nextAction]),
        opened: parseDate(fm[f.opened]), closed: parseDate(fm[f.closed]), due: parseDate(fm[f.due]),
        log: parseLog(fm[f.statusLog]),
      });
    }
    return out;
  }

  /** Stages that count as "work" (every stage except the one holding the done status). */
  workStages(): string[] {
    const doneStage = this.m.stageOf(this.s.doneStatus);
    return this.s.stages.map((x) => x.name).filter((n) => n !== doneStage);
  }

  render() {
    const root = this.rootEl;
    root.empty();
    const S = this.s, m = this.m;
    const tasks = this.collect();
    const ws = this.weekStart, we = new Date(ws); we.setDate(we.getDate() + 7);
    const inWeek = (d: Date | null) => !!d && d >= ws && d < we;
    const nextWs = new Date(we), nextWe = new Date(we); nextWe.setDate(nextWe.getDate() + 6);
    const lastDay = new Date(we); lastDay.setDate(lastDay.getDate() - 1);
    const stages = this.workStages();

    // done per stage: a move this week out of the stage into a later stage (or done)
    const doneBy = new Map<string, WTask[]>(stages.map((s) => [s, []]));
    for (const t of tasks) {
      const moves = t.log.filter((mv) => inWeek(mv.date));
      let hit = false;
      for (const st of stages) {
        const from = m.statusesIn(st);
        const mv = moves.filter((x) => from.includes(x.from) && x.from !== x.to && !m.isHandover(x.from) &&
          (m.isDone(x.to) || m.stageIndex(x.to) > m.stageIndex(x.from) || (m.isHandover(x.to) && m.stageOf(x.to) === st))).pop();
        if (mv) { doneBy.get(st).push({ ...t, move: mv }); hit = true; }
      }
      if (hit) continue;
      if (m.isDone(t.status) && inWeek(t.closed) && !t.log.length && stages.length) {
        doneBy.get(stages[stages.length - 1]).push({ ...t, move: { date: t.closed, from: "", to: t.status } });
      }
    }
    const nextWeek = tasks.filter((t) => S.nextWeekBucket && t.bucket === S.nextWeekBucket && !m.isDone(t.status));
    const internal = S.internalSources.map((x) => x.toLowerCase());
    const channels = tasks.filter((t) => inWeek(t.opened) && ((S.channelBucket && t.bucket === S.channelBucket) || (t.source && internal.length && !internal.includes(t.source.toLowerCase()))));

    // header
    const head = root.createDiv({ cls: "stw-head" });
    const title = head.createDiv();
    title.createDiv({ cls: "stw-week", text: `Week of ${fmtDay(ws)} – ${fmtDay(lastDay)} ${lastDay.getFullYear()}` });
    const isThis = ws.getTime() === startOfWeek(new Date(), S.weekStartsMonday).getTime();
    title.createDiv({ cls: "std-muted", text: isThis ? "This week" : "Past or future week" });
    const nav = head.createDiv({ cls: "stw-nav" });
    const btn = (label: string, fn: () => void) => { const b = nav.createEl("button", { text: label }); b.addEventListener("click", fn); return b; };
    btn("← Prev", () => { this.weekStart = new Date(ws.getTime() - 7 * DAY); this.render(); });
    btn("This week", () => { this.weekStart = startOfWeek(new Date(), S.weekStartsMonday); this.render(); });
    btn("Next →", () => { this.weekStart = new Date(ws.getTime() + 7 * DAY); this.render(); });
    const copyBtn = btn("Copy weekly update", () => {
      void this.copySummary(ws, lastDay, doneBy, nextWeek, channels, nextWs, nextWe).then((ok) => {
        if (!ok) return;
        copyBtn.setText("Copied ✓");
        window.setTimeout(() => copyBtn.setText("Copy weekly update"), 2000);
      });
    });
    copyBtn.addClass("mod-cta");

    // KPIs
    const kpis = root.createDiv({ cls: "std-kpis" });
    const kpi = (label: string, value: number, sub?: string, tone?: string) => {
      const el = kpis.createDiv({ cls: "std-kpi" + (tone ? " std-" + tone : "") });
      el.createDiv({ cls: "std-kpi-value", text: String(value) });
      el.createDiv({ cls: "std-kpi-label", text: label });
      if (sub) el.createDiv({ cls: "std-kpi-sub", text: sub });
    };
    for (const st of stages) kpi(`Done - ${st}`, doneBy.get(st).length, "handed over or moved on");
    kpi("Next week", nextWeek.length, `${S.fields.bucket}: ${S.nextWeekBucket}`);
    kpi("New from channels", channels.length, "opened this week");
    if (S.attentionStatus) kpi(S.attentionStatus, tasks.filter((t) => t.status === S.attentionStatus).length, "right now", "bad");

    const moveCols = ["task", "move", "owner", "date"];
    const grid = root.createDiv({ cls: "std-grid std-two" });
    for (const st of stages) {
      const rows = doneBy.get(st);
      this.block(grid, `Done this week - ${st}`, rows, moveCols, `Nothing moved out of ${st} this week.`);
    }
    this.block(root, `To take up next week (${fmtDay(nextWs)} – ${fmtDay(nextWe)})`,
      nextWeek.sort((a, b) => (a.due?.getTime() ?? 9e15) - (b.due?.getTime() ?? 9e15)),
      ["task", "status", "waiting", "due", "next"], `No tasks have ${S.fields.bucket}: ${S.nextWeekBucket}. Set it on a task to plan it here.`);
    this.block(root, "New from the channels", channels.sort((a, b) => (b.opened?.getTime() ?? 0) - (a.opened?.getTime() ?? 0)),
      ["task", "status", "source", "opened", "next"], "Nothing new came in through the channels this week.");
    root.createDiv({ cls: "std-muted stw-note", text: `Done is read from each task's ${S.fields.statusLog}, which Star Tracker writes whenever a status changes. Tasks with no log fall back to their ${S.fields.closed} date.` });
  }

  block(parent: HTMLElement, title: string, rows: WTask[], cols: string[], empty: string) {
    const c = parent.createDiv({ cls: "std-card" });
    c.createDiv({ cls: "std-card-title", text: `${title} (${rows.length})` });
    if (!rows.length) { c.createDiv({ cls: "std-muted", text: empty }); return; }
    this.table(c, rows, cols);
  }

  table(el: HTMLElement, rows: WTask[], cols: string[]) {
    const labels: Record<string, string> = { task: "Task", move: "Moved", owner: "Owner", date: "When", status: "Status", waiting: "Waiting on", due: "Due", next: "Next action", source: "Source", opened: "Opened" };
    const table = el.createEl("table", { cls: "std-table" });
    const hr = table.createEl("thead").createEl("tr");
    for (const c of cols) hr.createEl("th", { text: labels[c] });
    const tb = table.createEl("tbody");
    for (const t of rows) {
      const tr = tb.createEl("tr");
      for (const c of cols) {
        const td = tr.createEl("td", { cls: ["date", "due", "opened", "owner", "waiting", "status"].includes(c) ? "stw-nowrap" : "" });
        if (c === "task") {
          const a = td.createEl("a", { cls: "std-link", text: t.title, href: "#" });
          a.addEventListener("click", (e) => { e.preventDefault(); openFile(this.app, t.file, e); });
        } else if (c === "status" || c === "move") {
          const to = c === "move" ? t.move.to : t.status;
          if (c === "move" && t.move.from) td.createSpan({ cls: "std-muted", text: `${t.move.from} → ` });
          td.createSpan({ cls: "std-pill", text: to }).style.setProperty("--pill", this.m.statusColor(to));
        } else if (c === "owner") td.setText(t.owner || "");
        else if (c === "waiting") td.setText(t.waiting || "");
        else if (c === "source") td.setText(t.source || (t.bucket === this.s.channelBucket ? "channel" : ""));
        else if (c === "date") td.setText(t.move.date ? fmtDay(t.move.date) : "");
        else if (c === "due") td.setText(t.due ? fmtDay(t.due) : "");
        else if (c === "opened") td.setText(t.opened ? fmtDay(t.opened) : "");
        else if (c === "next") td.setText(t.next);
      }
    }
  }

  async copySummary(ws: Date, lastDay: Date, doneBy: Map<string, WTask[]>, nextWeek: WTask[], channels: WTask[], nextWs: Date, nextWe: Date) {
    const who = (t: WTask) => {
      const bits: string[] = [];
      if (t.owner) bits.push(`owner ${t.owner}`);
      if (t.waiting && t.waiting !== t.owner) bits.push(`waiting on ${t.waiting}`);
      return bits.length ? ` (${bits.join(", ")})` : "";
    };
    const doneLine = (t: WTask) => `• ${t.title} → ${t.move.to}${who(t)}`;
    const planLine = (t: WTask) => `• ${t.title} [${t.status}]${t.due ? ` due ${fmtDay(t.due)}` : ""}${who(t)}${t.next ? `\n    ↳ Next: ${t.next}` : ""}`;
    const chanLine = (t: WTask) => `• ${t.title} [${t.status}]${t.source ? ` from ${t.source}` : ""}${who(t)}`;
    const block = (h: string, rows: WTask[], fn: (t: WTask) => string) => [`*${h} (${rows.length})*`, ...(rows.length ? rows.map(fn) : ["• None"]), ""];
    const text = [
      `*Weekly update: ${fmtDay(ws)} – ${fmtDay(lastDay)}*`, "",
      ...[...doneBy.entries()].flatMap(([st, rows]) => block(`What is done - ${st}`, rows, doneLine)),
      ...block(`To take up next week (${fmtDay(nextWs)} – ${fmtDay(nextWe)})`, nextWeek, planLine),
      ...block("New from the channels", channels, chanLine),
    ].join("\n").trim();
    try {
      await navigator.clipboard.writeText(text);
      new Notice("Weekly update copied.");
      return true;
    } catch {
      new Notice("Could not copy to clipboard.");
      return false;
    }
  }
}
