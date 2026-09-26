import { TAbstractFile, TFile } from "obsidian";
import type StarTrackerPlugin from "./main";
import { fmOf, isoDay, list } from "./util";

/** Writes status_log / status_changed (and closed) whenever a task's status changes. */
export class StatusTracker {
  known = new Map<string, string>();
  writing = new Set<string>();
  constructor(private plugin: StarTrackerPlugin) {}
  get app() { return this.plugin.app; }
  get s() { return this.plugin.settings; }

  seed() {
    this.known.clear();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const fm = (this.app.metadataCache.getFileCache(file) || ({} as any)).frontmatter;
      const st = fm && fm[this.s.fields.status];
      if (fm && this.plugin.model.isTask(fm) && st) this.known.set(file.path, String(st));
    }
  }
  onChanged(file: TFile) {
    if (!(file instanceof TFile) || this.writing.has(file.path)) return;
    const f = this.s.fields;
    const fm = fmOf(this.app, file);
    if (!this.plugin.model.isTask(fm) || !fm[f.status]) return;
    const now = String(fm[f.status]);
    const before = this.known.get(file.path);
    this.known.set(file.path, now);
    if (!this.s.logStatusChanges || before === undefined || before === now) return;
    const today = isoDay(Date.now());
    this.writing.add(file.path);
    this.app.fileManager.processFrontMatter(file, (x) => {
      const log = list(x[f.statusLog]);
      log.push(`${today} | ${before} → ${now}`);
      x[f.statusLog] = log;
      x[f.statusChanged] = today;
      if (this.s.setClosedOnDone && now === this.s.doneStatus && !x[f.closed]) x[f.closed] = today;
    }).catch((e) => console.error("Star Tracker: could not write status log", e))
      .finally(() => window.setTimeout(() => this.writing.delete(file.path), 500));
  }
  onRename(file: TAbstractFile, oldPath: string) {
    if (this.known.has(oldPath)) { this.known.set(file.path, this.known.get(oldPath)); this.known.delete(oldPath); }
  }
  onDelete(file: TAbstractFile) { this.known.delete(file.path); }
}
