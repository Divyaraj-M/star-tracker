import { App, TFile } from "obsidian";
import type { StarSettings } from "./settings";

export const DAY = 86400000;
export const GRAY = "#9CA3AF";
const SVGNS = "http://www.w3.org/2000/svg";

export function clean(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) v = v[0];
  const s = String(v).replace(/^\[\[|\]\]$/g, "").replace(/\|.*$/, "").replace(/^@/, "").trim();
  if (!s || s === "null") return null;
  return s;
}
export function list(v: any): any[] {
  if (v === null || v === undefined || v === "") return [];
  return (Array.isArray(v) ? v : [v]).filter((x) => x !== null && x !== undefined && x !== "");
}
export function linkName(v: any): string | null {
  if (!v) return null;
  if (Array.isArray(v)) v = v[0];
  const s = String(v).replace(/^\[\[|\]\]$/g, "").replace(/\|.*$/, "").trim();
  return s || null;
}
export function parseDate(v: any): Date | null {
  if (!v) return null;
  const d = new Date(String(v).slice(0, 10) + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}
export function isoDay(d: number | Date): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export function startOfWeek(d: Date, monday = true): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = monday ? (x.getDay() + 6) % 7 : x.getDay();
  x.setDate(x.getDate() - day);
  return x;
}
export function fmtDay(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
export function svg(tag: string, attrs: Record<string, any>, parent?: Element): SVGElement {
  const el = document.createElementNS(SVGNS, tag) as SVGElement;
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(el);
  return el;
}
export function countBy<T>(items: T[], fn: (t: T) => string | null): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = fn(it) || "Unassigned";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
export function fmOf(app: App, file: TFile): Record<string, any> {
  return (app.metadataCache.getFileCache(file) || ({} as any)).frontmatter || {};
}
export function openFile(app: App, file: TFile, ev?: MouseEvent) {
  app.workspace.getLeaf(!!(ev && (ev.ctrlKey || ev.metaKey))).openFile(file);
}

/** Settings-aware helpers shared by all views. */
export class Model {
  constructor(public app: App, public s: StarSettings) {}

  statusColor(name: string | null): string {
    const st = this.s.statuses.find((x) => x.name === name);
    return st ? st.color : GRAY;
  }
  priorityColor(name: string | null): string {
    const p = this.s.priorities.find((x) => x.name === name);
    return p ? p.color : GRAY;
  }
  stageOf(status: string | null): string | null {
    const st = this.s.statuses.find((x) => x.name === status);
    return st ? st.stage : null;
  }
  stageIndex(status: string | null): number {
    const stage = this.stageOf(status);
    return stage ? this.s.stages.findIndex((x) => x.name === stage) : -1;
  }
  statusesIn(stage: string): string[] {
    return this.s.statuses.filter((x) => x.stage === stage).map((x) => x.name);
  }
  isHandover(status: string | null): boolean {
    const st = this.s.statuses.find((x) => x.name === status);
    return !!(st && st.handover);
  }
  isDone(status: string | null): boolean {
    return status === this.s.doneStatus;
  }
  isTask(fm: Record<string, any>): boolean {
    const tag = this.s.taskTag.replace(/^#/, "").trim();
    if (!tag) return true;
    return list(fm.tags).some((t) => String(t).replace(/^#/, "") === tag);
  }
  typeDef(name: string | null) {
    const t = this.s.types.find((x) => x.name.toLowerCase() === String(name || "").toLowerCase());
    return t || this.s.types.find((x) => x.name === "Task") || this.s.types[this.s.types.length - 1] || { name: "Task", color: GRAY, icon: "•", child: "" };
  }
  epicType(): string {
    return (this.s.types[0] && this.s.types[0].name) || "Epic";
  }
  isEpic(fm: Record<string, any>): boolean {
    return String(fm[this.s.fields.type] || "").toLowerCase() === this.epicType().toLowerCase();
  }
  /** Walk parent links (up to 6 hops) to the top-level epic. */
  findEpic(file: TFile): TFile | null {
    let cur: TFile | null = file;
    const seen = new Set<string>();
    for (let i = 0; i < 6 && cur && !seen.has(cur.path); i++) {
      seen.add(cur.path);
      const fm = fmOf(this.app, cur);
      if (this.isEpic(fm)) return cur;
      const name = linkName(fm[this.s.fields.parent]);
      if (!name) return null;
      cur = this.app.metadataCache.getFirstLinkpathDest(name, cur.path);
    }
    return null;
  }
  blockers(fm: Record<string, any>, from: string): TFile[] {
    const out: TFile[] = [];
    for (const r of list(fm[this.s.fields.blockedBy])) {
      const name = linkName(r);
      if (!name) continue;
      const f = this.app.metadataCache.getFirstLinkpathDest(name, from);
      if (f) out.push(f);
    }
    return out;
  }
  /** blocker path -> open tasks it blocks */
  blocksIndex(): Map<string, TFile[]> {
    const idx = new Map<string, TFile[]>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(file) || ({} as any)).frontmatter;
      if (!fm || !fm[this.s.fields.blockedBy] || this.isDone(clean(fm[this.s.fields.status]))) continue;
      for (const b of this.blockers(fm, file.path)) {
        if (this.isDone(clean(fmOf(this.app, b)[this.s.fields.status]))) continue;
        if (!idx.has(b.path)) idx.set(b.path, []);
        idx.get(b.path).push(file);
      }
    }
    return idx;
  }
  /** Default frontmatter for a new task note. */
  newTaskFm(fm: Record<string, any>, extra: Record<string, any> = {}) {
    const f = this.s.fields;
    const tag = this.s.taskTag.replace(/^#/, "").trim();
    if (tag) fm.tags = [tag];
    fm[f.type] = extra.type || "Task";
    fm[f.status] = this.s.newStatus || (this.s.statuses[0] && this.s.statuses[0].name) || "";
    fm[f.priority] = null;
    fm[f.parent] = null;
    fm[f.start] = null;
    fm[f.end] = null;
    fm[f.blockedBy] = [];
    fm[f.opened] = isoDay(Date.now());
    if (this.s.defaultOwner) fm[f.owner] = this.s.defaultOwner;
    for (const r of this.s.roleFields) if (r.field) fm[r.field] = null;
    fm[f.points] = null;
    fm[f.sprint] = null;
    Object.assign(fm, extra);
  }

  // ---------------- sprints ----------------
  isSprint(fm: Record<string, any>): boolean {
    const tag = this.s.sprintTag.replace(/^#/, "").trim();
    return !!tag && list(fm.tags).some((t) => String(t).replace(/^#/, "") === tag);
  }
  sprintFromFile(file: TFile): Sprint | null {
    const fm = fmOf(this.app, file);
    if (!this.isSprint(fm)) return null;
    const f = this.s.fields;
    const num = (v: any) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
    const st = String(fm.state || "planned").toLowerCase();
    return {
      file, name: file.basename,
      start: parseDate(fm[f.start]), end: parseDate(fm[f.end]),
      state: (st === "active" || st === "closed" ? st : "planned") as Sprint["state"],
      goal: fm.goal ? String(fm.goal) : "",
      capacity: num(fm.capacity),
      committedPoints: num(fm.committed_points), completedPoints: num(fm.completed_points),
      committedTasks: num(fm.committed_tasks), completedTasks: num(fm.completed_tasks),
      closedOn: parseDate(fm.completed_on),
    };
  }
  /** All sprint notes, oldest first. */
  sprints(): Sprint[] {
    const out: Sprint[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const sp = this.sprintFromFile(file);
      if (sp) out.push(sp);
    }
    const key = (x: Sprint) => (x.start ? x.start.getTime() : x.end ? x.end.getTime() : 9e15);
    return out.sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
  activeSprint(all = this.sprints()): Sprint | null {
    const act = all.find((x) => x.state === "active");
    if (act) return act;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return all.find((x) => x.state !== "closed" && x.start && x.end && x.start <= today && today <= x.end) || null;
  }
  /** Sprint the task points to, as a file path, or null. */
  sprintPathOf(fm: Record<string, any>, from: string): string | null {
    const name = linkName(fm[this.s.fields.sprint]);
    if (!name) return null;
    const f = this.app.metadataCache.getFirstLinkpathDest(name, from);
    return f ? f.path : null;
  }
  async setSprint(file: TFile, sprint: Sprint | null) {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[this.s.fields.sprint] = sprint ? `[[${sprint.file.basename}]]` : null;
    });
  }
  pointsOf(fm: Record<string, any>): number {
    const v = Number(fm[this.s.fields.points]);
    return isNaN(v) ? 0 : v;
  }
  /** Date the task reached the done status (last move in the log, else the closed date). */
  doneDate(fm: Record<string, any>): Date | null {
    if (!this.isDone(clean(fm[this.s.fields.status]))) return null;
    const moves = parseLog(fm[this.s.fields.statusLog]).filter((m) => this.isDone(m.to));
    if (moves.length) return moves[moves.length - 1].date;
    return parseDate(fm[this.s.fields.closed]);
  }
}

export interface Sprint {
  file: TFile; name: string; start: Date | null; end: Date | null;
  state: "planned" | "active" | "closed"; goal: string; capacity: number | null;
  committedPoints: number | null; completedPoints: number | null;
  committedTasks: number | null; completedTasks: number | null; closedOn: Date | null;
}

export interface LogMove { date: Date; from: string; to: string }
export function parseLog(raw: any): LogMove[] {
  const out: LogMove[] = [];
  for (const line of list(raw)) {
    const m = String(line).match(/^(\d{4}-\d{2}-\d{2})\s*\|\s*(.*?)\s*(?:→|->)\s*(.*)$/);
    if (m) out.push({ date: parseDate(m[1]), from: m[2].trim(), to: m[3].trim() });
  }
  return out;
}
