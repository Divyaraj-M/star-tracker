import { App, Modal, TFile } from "obsidian";
import type StarTrackerPlugin from "../main";
import { fmOf, parseDate, parseLog } from "../util";
import { ActivityEvent, monthKey } from "./log";
import { renderEvent } from "./view";

const MAX_MONTHS = 36;

/** Every path a note has had, following rename events back from its current path. */
function pathsOf(plugin: StarTrackerPlugin, file: TFile): Set<string> {
  const renames = plugin.activity.events(0, Infinity).filter((e) => e.k === "rename" && e.op);
  const paths = new Set([file.path]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of renames) if (paths.has(r.p) && r.op && !paths.has(r.op)) { paths.add(r.op); grew = true; }
  }
  return paths;
}

/**
 * The full history of one task, newest first: everything the activity log has for the note,
 * plus status moves from its status log and its opened date, so tasks older than the log
 * still show their past.
 */
export async function taskHistory(plugin: StarTrackerPlugin, file: TFile): Promise<ActivityEvent[]> {
  const m = plugin.tracker.modelOf(fmOf(plugin.app, file)) ?? plugin.model;
  const f = m.s.fields;
  const fm = fmOf(plugin.app, file);
  const opened = parseDate(fm[f.opened]);
  const since = Math.min(file.stat.ctime || Date.now(), opened?.getTime() ?? Date.now());
  const months: string[] = [];
  const d = new Date(since);
  d.setDate(1);
  while (d.getTime() <= Date.now() && months.length < MAX_MONTHS) { months.push(monthKey(d.getTime())); d.setMonth(d.getMonth() + 1); }
  const now = monthKey(Date.now());
  if (!months.includes(now)) months.push(now);
  await plugin.activity.loadMonths(months);

  const paths = pathsOf(plugin, file);
  const logged = plugin.activity.events(0, Infinity).filter((e) => paths.has(e.p) || (e.op !== undefined && paths.has(e.op)));
  const out = [...logged];

  // status moves recorded in the note itself, unless the activity log has the same move that day
  const day = (t: number) => new Date(t).toDateString();
  const killed = plugin.settings.activity.killedStatuses.map((x) => x.toLowerCase());
  parseLog(fm[f.statusLog]).forEach((mv, i) => {
    const t = mv.date.getTime();
    if (logged.some((e) => e.to === mv.to && e.from === mv.from && day(e.t) === day(t))) return;
    const k = mv.to === m.s.doneStatus ? "task-done" : killed.includes(mv.to.toLowerCase()) ? "task-killed" : "status";
    out.push({ id: `log-${i}`, t, k, p: file.path, from: mv.from, to: mv.to, dayOnly: true });
  });
  if (opened && !logged.some((e) => e.k === "create" || e.k === "capture")) {
    out.push({ id: "opened", t: opened.getTime(), k: "create", p: file.path, dayOnly: true });
  }
  return out.sort((a, b) => b.t - a.t);
}

/** Renders a task's history into an element. */
export async function renderTaskActivity(el: HTMLElement, plugin: StarTrackerPlugin, file: TFile) {
  el.empty();
  el.addClass("sta-root", "sta-task");
  const list = el.createDiv({ cls: "sta-day-events" });
  const events = await taskHistory(plugin, file);
  list.empty();
  if (!events.length) {
    list.createDiv({ cls: "sta-empty", text: "No activity recorded for this task yet. Edits, status changes and ticked checkboxes show up here from now on." });
    return;
  }
  for (const ev of events) renderEvent(list, ev, plugin, { date: true, hideTitle: true });
}

/** A popup with one task's activity. */
export class TaskActivityModal extends Modal {
  private off: (() => void) | null = null;
  constructor(app: App, private plugin: StarTrackerPlugin, private file: TFile) { super(app); }
  onOpen() {
    this.setTitle(`Activity: ${this.file.basename}`);
    this.modalEl.addClass("sta-modal");
    const body = this.contentEl.createDiv();
    const draw = () => void renderTaskActivity(body, this.plugin, this.file);
    draw();
    this.off = this.plugin.activity.onChange(draw);
  }
  onClose() { this.off?.(); this.contentEl.empty(); }
}
