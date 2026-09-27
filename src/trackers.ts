import { App, FuzzyMatch, FuzzySuggestModal, TFile } from "obsidian";
import type StarTrackerPlugin from "./main";

export interface TrackerInfo { file: TFile; views: string[] }
type Item = TrackerInfo | "new";

const VIEW_LINE = /^\s*-\s*type:\s*(star-[\w-]+)\s*$/;
const NAME_LINE = /^\s*name:\s*(.+?)\s*$/;

/** Views in a .base file that belong to Star Tracker, by name. */
export function starViews(text: string): string[] {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!VIEW_LINE.test(lines[i])) continue;
    const next = lines[i + 1] ?? "";
    const m = next.match(NAME_LINE);
    out.push(m ? m[1].replace(/^["']|["']$/g, "") : "View");
  }
  return out;
}

/** Keeps a list of every .base file that has at least one Star Tracker view. */
export class TrackerIndex {
  list: TrackerInfo[] = [];
  constructor(private app: App) {}
  async scan() {
    const found: TrackerInfo[] = [];
    for (const f of this.app.vault.getFiles()) {
      if (f.extension !== "base") continue;
      try {
        const views = starViews(await this.app.vault.cachedRead(f));
        if (views.length) found.push({ file: f, views });
      } catch { /* unreadable file, skip */ }
    }
    found.sort((a, b) => a.file.basename.localeCompare(b.file.basename, undefined, { numeric: true }));
    this.list = found;
  }
}

/** Popup listing every tracker; pick one to open it. */
export class TrackerPickerModal extends FuzzySuggestModal<Item> {
  constructor(app: App, private plugin: StarTrackerPlugin, private trackers: TrackerInfo[]) {
    super(app);
    this.setPlaceholder("Open a tracker");
    this.setInstructions([
      { command: "↵", purpose: "open" },
      { command: "mod ↵", purpose: "open in new tab" },
      { command: "shift ↵", purpose: "open to the right" },
      { command: "esc", purpose: "close" },
    ]);
    this.scope.register(["Mod"], "Enter", (evt) => {
      const chooser = (this as unknown as { chooser?: { useSelectedItem?: (e: KeyboardEvent) => void } }).chooser;
      chooser?.useSelectedItem?.(evt);
      return false;
    });
    this.scope.register(["Shift"], "Enter", (evt) => {
      const chooser = (this as unknown as { chooser?: { useSelectedItem?: (e: KeyboardEvent) => void } }).chooser;
      chooser?.useSelectedItem?.(evt);
      return false;
    });
  }
  getItems(): Item[] { return [...this.trackers, "new"]; }
  getItemText(item: Item): string {
    return item === "new" ? "Create a new tracker" : `${item.file.basename} ${item.file.parent?.path ?? ""}`;
  }
  renderSuggestion(match: FuzzyMatch<Item>, el: HTMLElement) {
    const item = match.item;
    el.addClass("st-picker-item");
    if (item === "new") {
      el.createDiv({ cls: "st-picker-title", text: "+ Create a new tracker" });
      return;
    }
    el.createDiv({ cls: "st-picker-title", text: item.file.basename });
    const folder = item.file.parent && item.file.parent.path !== "/" ? item.file.parent.path : "Vault root";
    el.createDiv({ cls: "st-picker-meta", text: `${folder} · ${item.views.length} view${item.views.length === 1 ? "" : "s"}: ${item.views.join(", ")}` });
  }
  onChooseItem(item: Item, evt: MouseEvent | KeyboardEvent) {
    if (item === "new") { this.plugin.openCreateTracker(); return; }
    const leaf = evt.shiftKey ? this.app.workspace.getLeaf("split", "vertical") : this.app.workspace.getLeaf(evt.ctrlKey || evt.metaKey);
    void leaf.openFile(item.file);
  }
}
