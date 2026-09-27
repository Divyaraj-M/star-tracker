import { App, PluginSettingTab, Setting } from "obsidian";
import type StarTrackerPlugin from "./main";
import { DEFAULT_SETTINGS, Fields, defaultsCopy } from "./settings";
import { BackfillModal, CreateTrackerModal } from "./setup";

const FIELD_LABELS: Record<keyof Fields, string> = {
  status: "Status",
  priority: "Priority",
  type: "Type",
  parent: "Parent (links a task to its epic or story)",
  start: "Start date",
  end: "End date",
  blockedBy: "Blocked by (links to other tasks)",
  owner: "Owner",
  waitingOn: "Waiting on",
  area: "Area",
  related: "Related record (for example a deal or customer)",
  opened: "Opened date",
  closed: "Closed date",
  due: "Due date",
  bucket: "Planning bucket",
  source: "Source",
  nextAction: "Next action",
  statusLog: "Status log",
  statusChanged: "Status changed date",
  sprint: "Sprint (links a task to its sprint note)",
  points: "Story points",
};

export class StarSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: StarTrackerPlugin) { super(app, plugin); }
  get s() { return this.plugin.settings; }
  async save(redraw = false) {
    await this.plugin.saveSettings();
    if (redraw) this.display();
  }

  display() {
    const { containerEl } = this;
    const s = this.s;
    containerEl.empty();

    new Setting(containerEl).setName("Set up").setHeading();
    new Setting(containerEl).setName("Create a tracker").setDesc("Makes a base with a dashboard, boards, weekly view and timeline, using the settings below.")
      .addButton((b) => b.setButtonText("Create…").setCta().onClick(() => new CreateTrackerModal(this.app, this.plugin).open()));
    new Setting(containerEl).setName("Add missing fields to task notes").setDesc("Adds empty type, status, priority, parent, start, end, blocked by and role owner fields where they are missing.")
      .addButton((b) => b.setButtonText("Check notes…").onClick(() => new BackfillModal(this.app, this.plugin).open()));

    // ---- Tasks
    new Setting(containerEl).setName("Tasks").setHeading();
    new Setting(containerEl).setName("Task tag").setDesc("Notes with this tag are tasks. Leave blank to treat every note in the base as a task.")
      .addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.taskTag).setValue(s.taskTag).onChange(async (v) => { s.taskTag = v.replace(/^#/, "").trim(); await this.save(); }));
    const names = s.statuses.map((x) => x.name);
    const dd = (setting: Setting, value: string, allowNone: boolean, onChange: (v: string) => void) =>
      setting.addDropdown((d) => {
        if (allowNone) d.addOption("", "None");
        for (const n of names) d.addOption(n, n);
        d.setValue(names.includes(value) ? value : allowNone ? "" : names[0] || "");
        d.onChange(onChange);
      });
    dd(new Setting(containerEl).setName("Done status").setDesc("Tasks in this status count as finished."), s.doneStatus, false, (v) => { s.doneStatus = v; void this.save(); });
    dd(new Setting(containerEl).setName("Needs-attention status").setDesc("Counted and flagged in red on the dashboard, for example a status for tasks blocked on you."), s.attentionStatus, true, (v) => { s.attentionStatus = v; void this.save(); });
    dd(new Setting(containerEl).setName("Status for new tasks"), s.newStatus, false, (v) => { s.newStatus = v; void this.save(); });
    new Setting(containerEl).setName("Default owner").setDesc("Filled in on new tasks. Leave blank for none.")
      .addText((t) => t.setValue(s.defaultOwner).onChange(async (v) => { s.defaultOwner = v.trim(); await this.save(); }));
    new Setting(containerEl).setName("Record status changes").setDesc("Adds a dated line to the status log each time a status changes. The weekly view reads it.")
      .addToggle((t) => t.setValue(s.logStatusChanges).onChange(async (v) => { s.logStatusChanges = v; await this.save(); }));
    new Setting(containerEl).setName("Set closed date when done").addToggle((t) => t.setValue(s.setClosedOnDone).onChange(async (v) => { s.setClosedOnDone = v; await this.save(); }));
    new Setting(containerEl).setName("First day of the week")
      .addDropdown((d) => d.addOption("mon", "Monday").addOption("sun", "Sunday").setValue(s.weekStartsMonday ? "mon" : "sun")
        .onChange(async (v) => { s.weekStartsMonday = v === "mon"; await this.save(); }));

    // ---- Stages
    new Setting(containerEl).setName("Stages").setHeading()
      .setDesc("Groups of statuses, for example product, design and development. Each stage gets its own board when you create a tracker.");
    s.stages.forEach((st, i) => {
      const row = new Setting(containerEl).setClass("st-list-row");
      row.addText((t) => t.setValue(st.name).onChange(async (v) => {
        const old = st.name;
        st.name = v;
        for (const x of s.statuses) if (x.stage === old) x.stage = v;
        await this.save();
      }));
      row.addColorPicker((c) => c.setValue(st.color).onChange(async (v) => { st.color = v; await this.save(); }));
      this.moveButtons(row, s.stages, i);
    });
    new Setting(containerEl).addButton((b) => b.setButtonText("Add stage").onClick(async () => { s.stages.push({ name: "New stage", color: "#64748B" }); await this.save(true); }));

    // ---- Statuses
    new Setting(containerEl).setName("Statuses").setHeading()
      .setDesc("In board order: name, color, stage, handover toggle. Turn handover on for a status that means its stage finished its part, such as a handover to the next team. Renaming a status here does not change existing notes.");
    s.statuses.forEach((st, i) => {
      const row = new Setting(containerEl).setClass("st-list-row");
      row.addText((t) => t.setValue(st.name).onChange(async (v) => {
        const old = st.name;
        st.name = v;
        if (s.doneStatus === old) s.doneStatus = v;
        if (s.attentionStatus === old) s.attentionStatus = v;
        if (s.newStatus === old) s.newStatus = v;
        await this.save();
      }));
      row.addColorPicker((c) => c.setValue(st.color).onChange(async (v) => { st.color = v; await this.save(); }));
      row.addDropdown((d) => {
        for (const g of s.stages) d.addOption(g.name, g.name);
        d.setValue(st.stage).onChange(async (v) => { st.stage = v; await this.save(); });
      });
      row.addToggle((t) => t.setTooltip("Handover: moving a task here counts as done for its stage in the weekly view").setValue(!!st.handover)
        .onChange(async (v) => { st.handover = v; await this.save(); }));
      this.moveButtons(row, s.statuses, i);
    });
    new Setting(containerEl).addButton((b) => b.setButtonText("Add status").onClick(async () => {
      s.statuses.push({ name: "New status", color: "#64748B", stage: s.stages[0]?.name || "" });
      await this.save(true);
    }));

    // ---- Priorities
    new Setting(containerEl).setName("Priorities").setHeading().setDesc("Highest first. The first one gets its own tile on the dashboard.");
    s.priorities.forEach((p, i) => {
      const row = new Setting(containerEl).setClass("st-list-row");
      row.addText((t) => t.setValue(p.name).onChange(async (v) => { p.name = v; await this.save(); }));
      row.addColorPicker((c) => c.setValue(p.color).onChange(async (v) => { p.color = v; await this.save(); }));
      this.moveButtons(row, s.priorities, i);
    });
    new Setting(containerEl).addButton((b) => b.setButtonText("Add priority").onClick(async () => { s.priorities.push({ name: "New priority", color: "#64748B" }); await this.save(true); }));

    // ---- Types
    new Setting(containerEl).setName("Task types").setHeading()
      .setDesc("The first type is the top level (epics). Child type is what the + button on the timeline creates under it.");
    s.types.forEach((t, i) => {
      const row = new Setting(containerEl).setClass("st-list-row");
      row.addText((x) => x.setPlaceholder("Name").setValue(t.name).onChange(async (v) => { t.name = v; await this.save(); }));
      row.addText((x) => { x.setPlaceholder("Icon").setValue(t.icon).onChange(async (v) => { t.icon = v; await this.save(); }); x.inputEl.addClass("st-icon-input"); });
      row.addColorPicker((c) => c.setValue(t.color).onChange(async (v) => { t.color = v; await this.save(); }));
      row.addDropdown((d) => {
        d.addOption("", "No child");
        for (const o of s.types) if (o.name !== t.name) d.addOption(o.name, `Child: ${o.name}`);
        d.setValue(t.child || "").onChange(async (v) => { t.child = v; await this.save(); });
      });
      this.moveButtons(row, s.types, i);
    });
    new Setting(containerEl).addButton((b) => b.setButtonText("Add type").onClick(async () => { s.types.push({ name: "New type", icon: "•", color: "#64748B", child: "" }); await this.save(true); }));

    // ---- Role owners
    new Setting(containerEl).setName("Role owners").setHeading()
      .setDesc("Extra owner fields, such as design owner and dev owner. Each gets a chart on the dashboard.");
    s.roleFields.forEach((r, i) => {
      const row = new Setting(containerEl).setClass("st-list-row");
      row.addText((x) => x.setPlaceholder("Label").setValue(r.label).onChange(async (v) => { r.label = v; await this.save(); }));
      row.addText((x) => x.setPlaceholder("Frontmatter key").setValue(r.field).onChange(async (v) => { r.field = v.trim(); await this.save(); }));
      this.moveButtons(row, s.roleFields, i);
    });
    new Setting(containerEl).addButton((b) => b.setButtonText("Add role owner").onClick(async () => { s.roleFields.push({ label: "New owner", field: "new_owner" }); await this.save(true); }));

    // ---- Weekly
    new Setting(containerEl).setName("Weekly view").setHeading();
    new Setting(containerEl).setName("Next-week bucket").setDesc(`Tasks with ${s.fields.bucket} set to this show under "To take up next week".`)
      .addText((t) => t.setValue(s.nextWeekBucket).onChange(async (v) => { s.nextWeekBucket = v.trim(); await this.save(); }));
    new Setting(containerEl).setName("Channel bucket").setDesc(`Tasks with ${s.fields.bucket} set to this, opened this week, show under "New from the channels".`)
      .addText((t) => t.setValue(s.channelBucket).onChange(async (v) => { s.channelBucket = v.trim(); await this.save(); }));
    new Setting(containerEl).setName("Internal sources").setDesc(`Comma separated. A task opened this week whose ${s.fields.source} is not one of these counts as new from the channels. Leave blank to use the bucket only.`)
      .addText((t) => t.setValue(s.internalSources.join(", ")).onChange(async (v) => { s.internalSources = v.split(",").map((x) => x.trim()).filter(Boolean); await this.save(); }));

    // ---- Cards
    new Setting(containerEl).setName("Board cards").setHeading()
      .setDesc("What each card on a star board shows under its title.");
    new Setting(containerEl).setName("Card fields")
      .setDesc("Frontmatter keys, comma separated, in the order to show them. Used on boards where you have not picked properties in the view's properties menu.")
      .addTextArea((t) => t.setPlaceholder("Example: priority, points, owner").setValue(s.cardFields.join(", ")).onChange(async (v) => {
        s.cardFields = v.split(",").map((x) => x.trim()).filter(Boolean);
        await this.save();
      }));
    new Setting(containerEl).setName("Use card fields on every board")
      .setDesc("On: every board shows the card fields above and ignores its own properties menu. Off: a board's properties menu wins when it has any.")
      .addToggle((t) => t.setValue(s.cardFieldsOverride).onChange(async (v) => { s.cardFieldsOverride = v; await this.save(); }));
    new Setting(containerEl).setName("Always show priority").setDesc("Adds a colored priority chip to every card, even when priority is empty.")
      .addToggle((t) => t.setValue(s.cardShowPriority).onChange(async (v) => { s.cardShowPriority = v; await this.save(); }));
    new Setting(containerEl).setName("Show epic").setDesc("Shows the epic a task belongs to, found through its parent links.")
      .addToggle((t) => t.setValue(s.cardShowEpic).onChange(async (v) => { s.cardShowEpic = v; await this.save(); }));
    new Setting(containerEl).setName("Show blocks count").setDesc("Shows how many open tasks are waiting on this one.")
      .addToggle((t) => t.setValue(s.cardShowBlocks).onChange(async (v) => { s.cardShowBlocks = v; await this.save(); }));

    // ---- Sprints
    new Setting(containerEl).setName("Sprints").setHeading()
      .setDesc("Each sprint is a note with this tag. It holds state (planned, active, closed), start, end, goal and capacity. Tasks join a sprint through the sprint field.");
    new Setting(containerEl).setName("Sprint tag").addText((t) => t.setValue(s.sprintTag).onChange(async (v) => { s.sprintTag = v.replace(/^#/, "").trim() || "sprint"; await this.save(); }));
    new Setting(containerEl).setName("Sprint folder").setDesc("New sprint notes go here.").addText((t) => t.setValue(s.sprintFolder).onChange(async (v) => { s.sprintFolder = v.trim(); await this.save(); }));
    new Setting(containerEl).setName("Sprint length (days)").addText((t) => t.setValue(String(s.sprintLengthDays)).onChange(async (v) => { const n = parseInt(v, 10); if (n > 0) { s.sprintLengthDays = n; await this.save(); } }));
    new Setting(containerEl).setName("Default capacity (points)").setDesc("Filled in on new sprints. You can change it per sprint.")
      .addText((t) => t.setValue(String(s.defaultCapacity)).onChange(async (v) => { const n = parseInt(v, 10); s.defaultCapacity = isNaN(n) ? 0 : n; await this.save(); }));
    new Setting(containerEl).setName("Point scale").setDesc("Comma separated. Shown when you set points on a card or in planning.")
      .addText((t) => t.setValue(s.pointScale.join(", ")).onChange(async (v) => {
        const nums = v.split(",").map((x) => Number(x.trim())).filter((x) => x > 0 && !isNaN(x));
        if (nums.length) { s.pointScale = nums; await this.save(); }
      }));

    // ---- Dashboard
    new Setting(containerEl).setName("Dashboard").setHeading();
    new Setting(containerEl).setName("Related record label").setDesc(`What the ${s.fields.related} field holds, for example Deal or Customer.`)
      .addText((t) => t.setValue(s.relatedLabel).onChange(async (v) => { s.relatedLabel = v.trim() || "Related"; await this.save(); }));

    // ---- Field names
    new Setting(containerEl).setName("Field names").setHeading().setDesc("The frontmatter keys this plugin reads and writes.");
    (Object.keys(FIELD_LABELS) as (keyof Fields)[]).forEach((k) => {
      new Setting(containerEl).setName(FIELD_LABELS[k]).addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.fields[k]).setValue(s.fields[k]).onChange(async (v) => {
        s.fields[k] = v.trim() || DEFAULT_SETTINGS.fields[k];
        await this.save();
      }));
    });

    new Setting(containerEl).setName("Reset").setHeading();
    new Setting(containerEl).setName("Restore defaults").setDesc("Puts every setting back to its default. Your notes are not changed.")
      .addButton((b) => b.setClass("mod-warning").setButtonText("Restore defaults").onClick(async () => {
        if (!b.buttonEl.hasClass("st-confirm")) { b.setButtonText("Click again to confirm"); b.buttonEl.addClass("st-confirm"); return; }
        this.plugin.settings = defaultsCopy();
        this.plugin.model.s = this.plugin.settings;
        await this.save(true);
      }));
  }

  moveButtons<T>(row: Setting, arr: T[], i: number) {
    row.addExtraButton((b) => b.setIcon("arrow-up").setTooltip("Move up").setDisabled(i === 0).onClick(async () => {
      if (i === 0) return;
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      await this.save(true);
    }));
    row.addExtraButton((b) => b.setIcon("arrow-down").setTooltip("Move down").setDisabled(i === arr.length - 1).onClick(async () => {
      if (i === arr.length - 1) return;
      [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      await this.save(true);
    }));
    row.addExtraButton((b) => b.setIcon("trash-2").setTooltip("Delete").onClick(async () => { arr.splice(i, 1); await this.save(true); }));
  }
}
