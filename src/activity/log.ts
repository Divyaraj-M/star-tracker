import { TAbstractFile, TFile, normalizePath } from "obsidian";
import type StarTrackerPlugin from "../main";
import type { FM } from "../util";
import { str } from "../util";
import { checkboxChanges, excerpt, lineDiff, onlyKeysChanged } from "./text";

export type EventKind = "create" | "edit" | "rename" | "delete" | "capture" | "task-done" | "task-killed" | "status";
export type Category = "notes" | "tasks" | "captures" | "files";

/** One line in the activity log. Short keys keep the log files small. */
export interface ActivityEvent {
  id: string;
  /** Start time (ms). */
  t: number;
  /** Last time an edit session was touched (ms). */
  e?: number;
  k: EventKind;
  /** File path when the event happened. */
  p: string;
  /** Old path, for renames. */
  op?: string;
  /** Title: the checkbox text for checkbox tasks, else empty (the file name is used). */
  ti?: string;
  /** Capture source label. */
  src?: string;
  /** Preview text. */
  pv?: string;
  /** Changed lines in an edit session. */
  n?: number;
  /** Status change. */
  from?: string;
  to?: string;
  /** Why a task was killed. */
  r?: string;
  /** Only the date is known (from a task's status log), not the time. */
  dayOnly?: boolean;
}

export function categoryOf(ev: ActivityEvent): Category {
  if (ev.k === "capture") return "captures";
  if (ev.k === "task-done" || ev.k === "task-killed" || ev.k === "status") return "tasks";
  return /\.md$/i.test(ev.p) || /\.md$/i.test(ev.op ?? "") ? "notes" : "files";
}

export function monthKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Parse a JSONL log file. Later lines with the same id replace earlier ones (edit sessions are rewritten as they grow). */
export function parseLog(text: string, into: Map<string, ActivityEvent>) {
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line) as ActivityEvent;
      if (ev && ev.id && typeof ev.t === "number" && ev.k && ev.p) into.set(ev.id, ev);
    } catch { /* half-written line, skip */ }
  }
}

interface Session { ev: ActivityEvent; base: string | null }

const SNAPSHOT_LIMIT = 300;
const SNAPSHOT_MAX_CHARS = 400_000;

/**
 * Records what happens in the vault from the moment the plugin is on:
 * notes created, edited (grouped into sessions), renamed, deleted, captures landing
 * in capture folders, checkboxes ticked or cancelled, and Star task status changes.
 * Each device writes its own monthly JSONL file so synced vaults never conflict.
 */
export class ActivityLog {
  /** This device's events per month, newest data. */
  own = new Map<string, Map<string, ActivityEvent>>();
  /** Other devices' events per month, read from their files. */
  others = new Map<string, Map<string, ActivityEvent>>();
  private loaded = new Set<string>();
  private sessions = new Map<string, Session>();
  private created = new Map<string, ActivityEvent>();
  private snapshots = new Map<string, string>();
  private queue = new Map<string, ActivityEvent>();
  private flushTimer: number | null = null;
  private listeners = new Set<() => void>();
  private notifyTimer: number | null = null;
  readonly device: string;

  constructor(private plugin: StarTrackerPlugin) {
    let id = "";
    try { id = str(plugin.app.loadLocalStorage("star-activity-device")); } catch { /* older app */ }
    if (!id) {
      id = Math.random().toString(36).slice(2, 8);
      try { plugin.app.saveLocalStorage("star-activity-device", id); } catch { /* older app */ }
    }
    this.device = id;
  }
  get app() { return this.plugin.app; }
  get s() { return this.plugin.settings.activity; }

  /** Folder the log files live in. */
  get dir(): string {
    const custom = this.s.storageFolder.trim();
    return normalizePath(custom || `${this.plugin.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`}/activity`);
  }
  fileFor(month: string) { return `${this.dir}/${month}.${this.device}.jsonl`; }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private notify() {
    if (this.notifyTimer !== null) return;
    this.notifyTimer = window.setTimeout(() => {
      this.notifyTimer = null;
      for (const cb of this.listeners) { try { cb(); } catch (e) { console.error("Star Tracker: activity view update failed", e); } }
    }, 150);
  }

  // ---------------- reading ----------------

  /** Load the log files for these months (yyyy-mm). Other devices' files are re-read when `fresh` is set. */
  async loadMonths(months: string[], fresh = false) {
    const adapter = this.app.vault.adapter;
    let names: string[] = [];
    try {
      if (await adapter.exists(this.dir)) names = (await adapter.list(this.dir)).files;
    } catch (e) { console.error("Star Tracker: could not list activity log", e); }
    for (const month of months) {
      if (this.loaded.has(month) && !fresh) continue;
      const other = new Map<string, ActivityEvent>();
      for (const path of names) {
        const name = path.split("/").pop() ?? "";
        const m = name.match(/^(\d{4}-\d{2})\.([\w-]+)\.jsonl$/);
        if (!m || m[1] !== month) continue;
        const mine = m[2] === this.device;
        if (mine && this.loaded.has(month)) continue;
        try {
          const text = await adapter.read(path);
          if (mine) {
            const map = new Map<string, ActivityEvent>();
            parseLog(text, map);
            // events recorded before the file was read win over what the file says
            for (const [id, ev] of this.own.get(month) ?? []) map.set(id, ev);
            this.own.set(month, map);
          } else parseLog(text, other);
        } catch (e) { console.error("Star Tracker: could not read activity log", path, e); }
      }
      this.others.set(month, other);
      this.loaded.add(month);
    }
  }

  /** Every event between two times, oldest first. */
  events(from: number, to: number): ActivityEvent[] {
    const out: ActivityEvent[] = [];
    for (const src of [this.own, this.others]) {
      for (const [, map] of src) for (const ev of map.values()) if (ev.t >= from && ev.t < to) out.push(ev);
    }
    return out.sort((a, b) => a.t - b.t);
  }

  /** Current path of a file that may have been renamed since the event. */
  resolve(path: string): TFile | null {
    const renames = this.events(0, Infinity).filter((e) => e.k === "rename" && e.op);
    let p = path;
    for (let i = 0; i < 20; i++) {
      const f = this.app.vault.getAbstractFileByPath(p);
      if (f instanceof TFile) return f;
      const next = renames.find((e) => e.op === p && e.p !== p);
      if (!next) return null;
      p = next.p;
    }
    return null;
  }

  // ---------------- writing ----------------

  private record(ev: ActivityEvent) {
    const month = monthKey(ev.t);
    let map = this.own.get(month);
    if (!map) { map = new Map(); this.own.set(month, map); }
    map.set(ev.id, ev);
    this.queue.set(ev.id, ev);
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
    this.flushTimer = window.setTimeout(() => void this.flush(), 2000);
    this.notify();
  }
  private newEvent(k: EventKind, p: string, extra: Partial<ActivityEvent> = {}): ActivityEvent {
    const t = Date.now();
    return { id: `${t.toString(36)}${Math.random().toString(36).slice(2, 6)}`, t, k, p, ...extra };
  }

  async flush() {
    if (this.flushTimer !== null) { window.clearTimeout(this.flushTimer); this.flushTimer = null; }
    if (!this.queue.size) return;
    const batch = [...this.queue.values()];
    this.queue.clear();
    const byMonth = new Map<string, string[]>();
    for (const ev of batch) {
      const m = monthKey(ev.t);
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m)?.push(JSON.stringify(ev));
    }
    const adapter = this.app.vault.adapter;
    try {
      if (!(await adapter.exists(this.dir))) await adapter.mkdir(this.dir);
      for (const [m, lines] of byMonth) {
        const path = this.fileFor(m);
        const text = lines.join("\n") + "\n";
        if (await adapter.exists(path)) await adapter.append(path, text);
        else await adapter.write(path, text);
      }
    } catch (e) {
      console.error("Star Tracker: could not write activity log", e);
      for (const ev of batch) if (!this.queue.has(ev.id)) this.queue.set(ev.id, ev);
    }
  }

  // ---------------- what counts ----------------

  excluded(path: string): boolean {
    if (!this.s.enabled) return true;
    const dir = this.dir + "/";
    if (path.startsWith(dir) || path.startsWith(this.app.vault.configDir + "/")) return true;
    return this.s.excludeFolders.some((f) => { const x = f.trim().replace(/\/$/, ""); return x && (path === x || path.startsWith(x + "/")); });
  }
  captureSource(path: string): string | null {
    for (const c of this.s.captureFolders) {
      const x = c.folder.trim().replace(/\/$/, "");
      if (x && path.startsWith(x + "/")) return c.label.trim() || x.split("/").pop() || x;
    }
    return null;
  }
  private windowMs() { return Math.max(1, this.s.mergeMinutes) * 60_000; }
  private remember(path: string, text: string) {
    if (text.length > SNAPSHOT_MAX_CHARS) { this.snapshots.delete(path); return; }
    this.snapshots.delete(path);
    this.snapshots.set(path, text);
    while (this.snapshots.size > SNAPSHOT_LIMIT) this.snapshots.delete(this.snapshots.keys().next().value as string);
  }

  /** Keep a copy of a note when it is opened, so the first edit can show what changed. */
  async onOpen(file: TFile | null) {
    if (!file || file.extension !== "md" || this.excluded(file.path) || this.snapshots.has(file.path)) return;
    try { this.remember(file.path, await this.app.vault.cachedRead(file)); } catch { /* ignore */ }
  }

  async onCreate(file: TAbstractFile) {
    if (!(file instanceof TFile) || this.excluded(file.path)) return;
    const src = this.captureSource(file.path);
    let text = "";
    if (file.extension === "md") { try { text = await this.app.vault.cachedRead(file); } catch { /* new file */ } }
    const ev = this.newEvent(src ? "capture" : "create", file.path, src ? { src } : {});
    const pv = excerpt(text);
    if (pv) ev.pv = pv;
    this.created.set(file.path, ev);
    if (file.extension === "md") this.remember(file.path, text);
    this.record(ev);
  }

  async onModify(file: TAbstractFile) {
    if (!(file instanceof TFile) || this.excluded(file.path)) return;
    const now = Date.now();
    const isMd = file.extension === "md";
    let text = "";
    if (isMd) { try { text = await this.app.vault.cachedRead(file); } catch { return; } }
    const prev = this.snapshots.get(file.path) ?? null;
    if (isMd) this.remember(file.path, text);
    // status changes are recorded as their own entries; the fields the tracker writes with them are not edits
    if (isMd && prev !== null && onlyKeysChanged(prev, text, this.trackerKeys())) return;

    if (isMd && prev !== null) {
      for (const c of checkboxChanges(prev, text)) {
        this.record(this.newEvent(c.done ? "task-done" : "task-killed", file.path, { ti: c.text }));
      }
    }

    // a note that was just created: keep one "created" entry and refresh its preview
    const made = this.created.get(file.path);
    if (made && now - made.t < this.windowMs() && dayKey(made.t) === dayKey(now)) {
      const pv = excerpt(text);
      if (pv !== (made.pv ?? "")) { if (pv) made.pv = pv; else delete made.pv; this.record(made); }
      return;
    }
    this.created.delete(file.path);

    let s = this.sessions.get(file.path);
    if (!s || now - (s.ev.e ?? s.ev.t) > this.windowMs() || dayKey(s.ev.t) !== dayKey(now)) {
      s = { ev: this.newEvent("edit", file.path), base: prev };
      this.sessions.set(file.path, s);
    }
    s.ev.e = now;
    if (isMd) {
      if (s.base !== null) {
        const d = lineDiff(s.base, text);
        s.ev.n = d.changed;
        if (d.preview) s.ev.pv = d.preview; else delete s.ev.pv;
      } else {
        const pv = excerpt(text);
        if (pv) s.ev.pv = pv;
      }
    }
    this.record(s.ev);
  }

  onRename(file: TAbstractFile, oldPath: string) {
    for (const map of [this.snapshots, this.sessions, this.created] as Map<string, unknown>[]) {
      if (map.has(oldPath)) { map.set(file.path, map.get(oldPath)); map.delete(oldPath); }
    }
    const s = this.sessions.get(file.path);
    if (s) s.ev.p = file.path;
    if (!(file instanceof TFile) || (this.excluded(file.path) && this.excluded(oldPath))) return;
    this.record(this.newEvent("rename", file.path, { op: oldPath }));
  }

  onDelete(file: TAbstractFile) {
    this.snapshots.delete(file.path);
    this.sessions.delete(file.path);
    this.created.delete(file.path);
    if (!(file instanceof TFile) || this.excluded(file.path)) return;
    this.record(this.newEvent("delete", file.path));
  }

  /** Frontmatter fields whose changes are shown as status entries, not as edits. */
  private trackerKeys(): string[] {
    const keys = new Set<string>();
    for (const m of this.plugin.allModels()) {
      const f = m.s.fields;
      for (const k of [f.status, f.statusLog, f.statusChanged, f.closed]) keys.add(k);
    }
    return [...keys];
  }

  /** Called by the status tracker when a Star task changes status. */
  onStatus(file: TFile, before: string, now: string, isDone: boolean, fm: FM) {
    if (this.excluded(file.path)) return;
    const killed = this.s.killedStatuses.map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (isDone) { this.record(this.newEvent("task-done", file.path, { from: before, to: now })); return; }
    if (killed.includes(now.toLowerCase())) {
      const r = str(fm[this.s.killReasonField]).trim();
      this.record(this.newEvent("task-killed", file.path, { from: before, to: now, ...(r ? { r } : {}) }));
      return;
    }
    this.record(this.newEvent("status", file.path, { from: before, to: now }));
  }
}
