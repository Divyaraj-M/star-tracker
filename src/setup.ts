import { App, Modal, Notice, Setting, TFile, TFolder, normalizePath } from "obsidian";
import type StarTrackerPlugin from "./main";
import type { StarSettings } from "./settings";
import { fmOf, isoDay } from "./util";
import { BOARD_VIEW } from "./views/board";
import { DASHBOARD_VIEW } from "./views/dashboard";
import { WEEKLY_VIEW } from "./views/weekly";
import { TIMELINE_VIEW } from "./views/timeline";
import { SPRINT_VIEW, createSprint } from "./views/sprint";

const q = (v: string) => JSON.stringify(v);

/** Build the YAML for a .base file with every Star Tracker view. */
export function buildBaseYaml(s: StarSettings, folder: string): string {
  const f = s.fields;
  const tag = s.taskTag.replace(/^#/, "").trim();
  const roles = s.roleFields.map((r) => r.field).filter(Boolean);
  const card = ["file.name", "task_id", f.priority, f.blockedBy, f.points, f.owner, f.due];
  const L: string[] = [];
  if (tag) L.push("filters:", "  and:", `    - file.hasTag(${q(tag)})`);
  L.push("views:");
  const newItem = () => [`    newItemFolder: ${q(folder)}`];
  const orderBlock = (props: string[]) => ["    order:", ...props.map((p) => `      - ${p}`)];
  const statusFilter = (names: string[], join: "or" | "and" = "or", op = "==") =>
    ["    filters:", `      ${join}:`, ...names.map((n) => `        - ${f.status} ${op} ${q(n)}`)];

  const group = (prop: string) => ["    groupBy:", `      property: ${prop}`, "      direction: ASC"];
  const cols = (names: string[]) => ["    boardColumns:", ...names.map((n) => `      - ${q(n)}`)];
  L.push(`  - type: ${DASHBOARD_VIEW}`, "    name: Dashboard");
  L.push(`  - type: ${BOARD_VIEW}`, "    name: Global board", ...group(f.status), ...cols(s.statuses.map((x) => x.name)),
    ...orderBlock([...card.slice(0, 5), ...roles, ...card.slice(5)]), ...newItem());

  const doneStage = s.statuses.find((x) => x.name === s.doneStatus)?.stage;
  const work = s.stages.filter((st) => st.name !== doneStage);
  work.forEach((st, i) => {
    // incoming handovers from the previous stage, this stage's statuses, and the done status after the last stage
    const prev = i > 0 ? s.statuses.filter((x) => x.stage === work[i - 1].name && x.handover).map((x) => x.name) : [];
    const own = s.statuses.filter((x) => x.stage === st.name).map((x) => x.name);
    const names = [...prev, ...own, ...(i === work.length - 1 && s.doneStatus ? [s.doneStatus] : [])];
    if (!own.length) return;
    L.push(`  - type: ${BOARD_VIEW}`, `    name: ${q(st.name + " board")}`, ...group(f.status),
      ...statusFilter(names), ...cols(names),
      ...orderBlock([...card.slice(0, 5), ...roles, ...card.slice(5)]), ...newItem());
  });
  L.push(`  - type: ${BOARD_VIEW}`, "    name: Priority board", ...group(f.priority), ...cols(s.priorities.map((x) => x.name)),
    ...statusFilter([s.doneStatus], "and", "!="), ...orderBlock(["file.name", "task_id", f.status, f.blockedBy, f.owner, f.due]), ...newItem());
  L.push(`  - type: ${SPRINT_VIEW}`, "    name: Sprint", ...orderBlock(["file.name", "task_id", f.priority, f.points, f.blockedBy, f.owner]), ...newItem());
  L.push(`  - type: ${WEEKLY_VIEW}`, "    name: Weekly");
  L.push(`  - type: ${TIMELINE_VIEW}`, "    name: Timeline", ...newItem());
  L.push("  - type: table", "    name: Blocked by another task", "    filters:", "      and:",
    `        - ${q("!" + f.blockedBy + ".isEmpty()")}`, `        - ${f.status} != ${q(s.doneStatus)}`,
    ...orderBlock(["file.name", f.status, f.blockedBy, f.owner, f.due]));
  return L.join("\n") + "\n";
}

async function ensureFolder(app: App, path: string) {
  if (!path) return;
  const parts = normalizePath(path).split("/");
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!app.vault.getAbstractFileByPath(cur)) await app.vault.createFolder(cur);
  }
}

export class CreateTrackerModal extends Modal {
  folder = "Tracker";
  name = "Tracker";
  sample = true;
  sprint = true;
  constructor(app: App, private plugin: StarTrackerPlugin) { super(app); }

  onOpen() {
    const { contentEl } = this;
    const s = this.plugin.settings;
    this.setTitle("Create a tracker");
    contentEl.createEl("p", { text: `Creates a base with a dashboard, a global board, one board per stage, a priority board, a sprint view, a weekly view and a timeline. Tasks are notes tagged #${s.taskTag || "(no tag)"}. Change statuses, stages and fields in settings first if you need to.` });
    new Setting(contentEl).setName("Folder").setDesc("New task notes go here too.").addText((t) => t.setValue(this.folder).onChange((v) => (this.folder = v.trim())));
    new Setting(contentEl).setName("Base name").addText((t) => t.setValue(this.name).onChange((v) => (this.name = v.trim() || "Tracker")));
    new Setting(contentEl).setName("Task tag").setDesc("Saved to settings.").addText((t) => t.setValue(s.taskTag).onChange(async (v) => { s.taskTag = v.replace(/^#/, "").trim(); await this.plugin.saveSettings(); }));
    new Setting(contentEl).setName("Create the first sprint").setDesc(`A planned sprint note in ${s.sprintFolder || "the vault root"}.`).addToggle((t) => t.setValue(this.sprint).onChange((v) => (this.sprint = v)));
    new Setting(contentEl).setName("Add a sample epic and task").addToggle((t) => t.setValue(this.sample).onChange((v) => (this.sample = v)));
    new Setting(contentEl).addButton((b) => b.setButtonText("Create").setCta().onClick(() => this.create()));
  }

  async create() {
    const s = this.plugin.settings;
    const f = s.fields;
    const folder = normalizePath(this.folder || "/").replace(/^\/$/, "");
    try {
      await ensureFolder(this.app, folder);
      const basePath = normalizePath(`${folder ? folder + "/" : ""}${this.name}.base`);
      if (this.app.vault.getAbstractFileByPath(basePath)) { new Notice(`${basePath} already exists.`); return; }
      const base = await this.app.vault.create(basePath, buildBaseYaml(s, folder || "/"));
      if (this.sample) {
        const m = this.plugin.model;
        const epicType = m.epicType();
        const child = (s.types[0] && s.types[0].child) || "Task";
        const today = isoDay(Date.now());
        const end = isoDay(Date.now() + 21 * 86400000);
        const epic = await this.app.vault.create(normalizePath(`${folder ? folder + "/" : ""}Sample ${epicType.toLowerCase()}.md`), "Describe the goal of this epic here.\n");
        await this.app.fileManager.processFrontMatter(epic, (fm) => m.newTaskFm(fm, { [f.type]: epicType, [f.start]: today, [f.end]: end }));
        const task = await this.app.vault.create(normalizePath(`${folder ? folder + "/" : ""}Sample ${child.toLowerCase()}.md`), "Drag this card between columns to change its status.\n");
        await this.app.fileManager.processFrontMatter(task, (fm) => m.newTaskFm(fm, { [f.type]: child, [f.parent]: `[[${epic.basename}]]`, [f.priority]: s.priorities[1]?.name || null }));
      }
      if (this.sprint && !this.plugin.model.sprints().length) await createSprint(this.plugin);
      this.close();
      await this.app.workspace.getLeaf(true).openFile(base);
      new Notice("Tracker created.");
    } catch (e) {
      console.error(e);
      new Notice("Could not create the tracker. See the console for details.");
    }
  }
  onClose() { this.contentEl.empty(); }
}

/** Fields every task should have, with their empty default value. */
export function missingFields(s: StarSettings, fm: Record<string, any>): Record<string, any> {
  const f = s.fields;
  const want: Record<string, any> = {
    [f.type]: "Task",
    [f.status]: s.newStatus || s.statuses[0]?.name || "",
    [f.priority]: null,
    [f.parent]: null,
    [f.start]: null,
    [f.end]: null,
    [f.blockedBy]: [],
    [f.points]: null,
    [f.sprint]: null,
  };
  for (const r of s.roleFields) if (r.field) want[r.field] = null;
  const out: Record<string, any> = {};
  for (const k of Object.keys(want)) if (!(k in fm)) out[k] = want[k];
  return out;
}

export class BackfillModal extends Modal {
  constructor(app: App, private plugin: StarTrackerPlugin) { super(app); }
  targets(): TFile[] {
    const m = this.plugin.model;
    return this.app.vault.getMarkdownFiles().filter((file) => {
      const fm = (this.app.metadataCache.getFileCache(file) || ({} as any)).frontmatter;
      return fm && m.isTask(fm) && Object.keys(missingFields(this.plugin.settings, fm)).length > 0;
    });
  }
  onOpen() {
    const files = this.targets();
    this.setTitle("Add missing fields to task notes");
    const { contentEl } = this;
    if (!files.length) { contentEl.createEl("p", { text: "Every task note already has all tracker fields." }); return; }
    contentEl.createEl("p", { text: `${files.length} task note${files.length === 1 ? "" : "s"} are missing one or more fields (type, status, priority, parent, start, end, blocked by, points, sprint, role owners). Missing fields are added empty. Nothing that exists is changed.` });
    new Setting(contentEl).addButton((b) => b.setButtonText(`Update ${files.length} notes`).setCta().onClick(async () => {
      b.setDisabled(true);
      let n = 0;
      for (const file of files) {
        const add = missingFields(this.plugin.settings, fmOf(this.app, file));
        await this.app.fileManager.processFrontMatter(file, (fm) => { for (const k in add) if (!(k in fm)) fm[k] = add[k]; });
        n++;
      }
      new Notice(`Updated ${n} notes.`);
      this.close();
    }));
  }
  onClose() { this.contentEl.empty(); }
}

export function isFolder(x: any): x is TFolder { return x instanceof TFolder; }
