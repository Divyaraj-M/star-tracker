import { TAbstractFile, TFile } from "obsidian";
import type StarTrackerPlugin from "./main";
import { Model, fmOf, isoDay, list, str, FM } from "./util";

/** Writes status_log / status_changed (and closed) whenever a task's status changes. */
export class StatusTracker {
  known = new Map<string, string>();
  writing = new Set<string>();
  constructor(private plugin: StarTrackerPlugin) {}
  get app() { return this.plugin.app; }

  /** The task settings a note belongs to: the first tracker whose tags match it. */
  modelOf(fm: FM): Model | null {
    return this.plugin.allModels().find((m) => m.isTask(fm)) ?? null;
  }
  seed() {
    this.known.clear();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const m = fm ? this.modelOf(fm) : null;
      const st = fm && m ? str(fm[m.s.fields.status]) : "";
      if (st) this.known.set(file.path, st);
    }
  }
  onChanged(file: TFile) {
    if (!(file instanceof TFile) || this.writing.has(file.path)) return;
    const fm = fmOf(this.app, file);
    const model = this.modelOf(fm);
    if (!model) return;
    const cfg = model.s, f = cfg.fields;
    if (!fm[f.status]) return;
    const now = str(fm[f.status]);
    const before = this.known.get(file.path);
    this.known.set(file.path, now);
    if (before !== undefined && before !== now) this.plugin.activity?.onStatus(file, before, now, now === cfg.doneStatus, fm);
    if (!cfg.logStatusChanges || before === undefined || before === now) return;
    const today = isoDay(Date.now());
    this.writing.add(file.path);
    this.app.fileManager.processFrontMatter(file, (x: FM) => {
      const log = list(x[f.statusLog]);
      log.push(`${today} | ${before} → ${now}`);
      x[f.statusLog] = log;
      x[f.statusChanged] = today;
      if (cfg.setClosedOnDone && now === cfg.doneStatus && !x[f.closed]) x[f.closed] = today;
    }).catch((e) => console.error("Star Tracker: could not write status log", e))
      .finally(() => window.setTimeout(() => this.writing.delete(file.path), 500));
  }
  onRename(file: TAbstractFile, oldPath: string) {
    if (this.known.has(oldPath)) { this.known.set(file.path, this.known.get(oldPath)); this.known.delete(oldPath); }
  }
  onDelete(file: TAbstractFile) { this.known.delete(file.path); }
}
