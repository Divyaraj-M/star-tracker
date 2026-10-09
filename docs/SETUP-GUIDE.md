# Set up Star Tracker as your tracker

This guide gets you from an empty vault to a working tracker: your own statuses, boards, a dashboard per team or person, sprints, a weekly update and the activity timeline.

There are two ways to use it:

- **Hand it to Claude.** Copy the prompt in [Set it up with Claude](#set-it-up-with-claude). Claude reads this file, asks you a few questions and builds the tracker in your vault.
- **Do it yourself.** Follow [Set it up by hand](#set-it-up-by-hand). It takes about 15 minutes.

---

## What you end up with

| Piece | What it is |
|---|---|
| Task notes | Plain Markdown notes with a tag (default `#task`) and frontmatter fields: status, priority, owner, dates. |
| Tracker base | A `.base` file holding all views: dashboard, boards, sprint, weekly, timeline, activity. |
| Dashboards | One **Star dashboard** view per slice you care about (whole team, one owner, one area). |
| Sprints | Notes tagged `#sprint` with dates, goal and capacity. |
| Activity timeline | A record of what changed in the vault, per day and per task. |

---

## Set it up with Claude

You need Claude with access to your vault folder. In the Claude desktop app (Cowork), click **Add folder** and pick your vault. Install and enable Star Tracker in Obsidian first.

Copy this prompt and fill in the brackets:

```text
Set up the Obsidian plugin Star Tracker as my task tracker.

Read the guide first: https://github.com/Divyaraj-M/star-tracker/blob/main/docs/SETUP-GUIDE.md
My vault is the connected folder [vault folder name].

About my work:
- Team / project name: [e.g. Mobile app]
- My workflow stages and statuses, in order: [e.g. Product: Backlog, In progress, Handover to design; Design: In design, Review; Dev: In dev, QA; Done: Shipped]
- Status that means done: [Shipped]
- Statuses that mean dropped: [Won't do]
- Priorities: [Urgent, High, Medium, Low]
- People who own tasks: [names or handles]
- Dashboards I want: [e.g. whole team, one per owner, one for bugs only]
- Sprint length in days, or no sprints: [14]
- Folders where captures land (for the activity timeline): [e.g. Clippings = Web clipper]
- Existing task notes to bring in: [folder, or none]

Follow the "Steps for Claude" section of the guide. Ask me before overwriting any file.
```

### Steps for Claude

Claude: follow these in order. Ask the user when an answer is missing. Never overwrite a file the user did not ask you to change.

1. **Check the plugin is installed.** It lives in `<vault>/.obsidian/plugins/star-tracker/` with `manifest.json` version 1.6.0 or later. If it is missing, tell the user to install it from Community plugins and stop.
2. **Write the settings.** Settings live in `<vault>/.obsidian/plugins/star-tracker/data.json`. Read it first if it exists and change only the keys below. Ask the user to turn the plugin off and on (or restart Obsidian) afterwards, because Obsidian keeps settings in memory and overwrites the file on save.
   - `taskTag`: the tag that marks a task (no `#`).
   - `stages`: `[{ "name": "Product", "color": "#2563EB" }, ...]` in workflow order.
   - `statuses`: `[{ "name": "Backlog", "color": "#93C5FD", "stage": "Product", "handover": false }, ...]` in workflow order. Set `"handover": true` on statuses that pass work to the next stage.
   - `doneStatus`, `newStatus`, `attentionStatus` (a status shown in red on the dashboard, or `""`).
   - `priorities`: `[{ "name": "Urgent", "color": "#EF4444" }, ...]`, highest first.
   - `types`: keep the defaults unless the user names their own. Each has `name`, `color`, `icon`, `child` (the type created under it).
   - `roleFields`: extra owner fields, e.g. `[{ "label": "Design owner", "field": "design_owner" }]`.
   - `relatedLabel`: what the `deals` field links to (e.g. `Customer`).
   - `sprintFolder`, `sprintLengthDays`, `defaultCapacity`.
   - `activity.captureFolders`: `[{ "folder": "Clippings", "label": "Web clipper" }]`.
   - `activity.killedStatuses`: the dropped statuses.
3. **Create the tracker.** Tell the user to run **Star Tracker: Create a tracker** (command palette) with their folder and tag. This writes a base with every view, wired to the settings. If the user prefers, write the `.base` file yourself using the template in [The tracker base](#the-tracker-base).
4. **Add the dashboards.** For each dashboard the user asked for, add a `star-dashboard` view to the base with a filter. See [Custom dashboards](#custom-dashboards).
5. **Bring in existing tasks.** For each existing task note, add the task tag and any missing fields from [Task note format](#task-note-format). Keep the note body as is. Map old status names to the new ones and list anything you could not map. Then tell the user they can run **Add missing fields to task notes** to fill empty fields.
6. **Create the first sprint** if they use sprints: a note in `sprintFolder` using [Sprint note format](#sprint-note-format), `state: planned`.
7. **Add a task template** at `Templates/Task.md` from [Task note format](#task-note-format) so new tasks start complete.
8. **Report back** as a list: files created, files changed, settings changed, and what the user should click next (reload the plugin, open the base).

---

## Set it up by hand

1. **Install.** Settings → Community plugins → Browse → Star Tracker → Install → Enable. Obsidian 1.10.2 or later, with the core **Bases** plugin on.
2. **Define your workflow.** Settings → Star Tracker:
   - **Stages**: the big phases (for example Product, Design, Dev, Done).
   - **Statuses**: every column you want, each in a stage. Turn on the handover toggle for statuses that hand work to the next stage.
   - **Done status**, **Status for new tasks**, **Needs-attention status**.
   - **Priorities**, highest first. **Types** if you want more than Epic / Story / Feature / Bug / Task / Sub-task.
   - **Task tags**: the tag that makes a note a task.
3. **Create the tracker.** Command palette → **Star Tracker: Create a tracker**. Pick a folder, a name and a tag. Leave "Add a sample epic and task" on the first time.
4. **Open it.** The tracker icon in the left ribbon, or **Star Tracker: Open a tracker**.
5. **Add your tasks.** On any board, click **+** in a column, or create a note with the task tag.
6. **Add dashboards** for the slices you care about. See [Custom dashboards](#custom-dashboards).
7. **Turn on the activity timeline extras.** Settings → Star Tracker → Activity timeline → **Capture folders** and **Killed statuses**.

---

## Design your workflow

A few rules make every view work well:

- **Stages are phases, statuses are columns.** The dashboard's "By stage" chart and the weekly view count work per stage.
- **Handover statuses mark finished work for a stage.** Moving a task to *Handover to design* counts as done for Product in the weekly view, even though the task is still open.
- **One done status.** Tasks there count as finished everywhere. Star Tracker sets `closed` the first time a task reaches it.
- **Killed statuses** (Settings → Activity timeline) show as "Task killed" on the activity timeline. Put the reason in the `reason` field.
- **Needs-attention status** gets its own red tile on the dashboard. Use it for "blocked on me" or "waiting for review".
- **Status history is automatic.** Each status change adds a line to `status_log`. The weekly view, sprint burndown and per-task activity read it, so leave it in place.

---

## Task note format

```markdown
---
tags: [task]
type: Story
status: Backlog
priority: High
owner: alex
parent: "[[E-001 Mobile app launch]]"
start: 2026-10-01
end: 2026-10-14
due: 2026-10-14
blocked_by: []
area: Onboarding
deals: []
sprint: "[[Sprint 4]]"
points: 3
opened: 2026-10-01
bucket:
source:
next_action: Write the acceptance criteria
reason:
---

What needs doing and why.
```

| Field | Used by |
|---|---|
| `status`, `priority`, `type` | Boards, dashboard, timeline |
| `owner`, `waiting_on`, role fields | Dashboard "by owner" charts, weekly update |
| `parent` | Epic → story → sub-task tree on the timeline and the epic chip on cards |
| `start`, `end` | Timeline bars |
| `due` | Overdue tile on the dashboard |
| `blocked_by` | Red chip on cards, "Blocked by a task" tile |
| `sprint`, `points` | Sprint board, planning, burndown, velocity |
| `opened`, `closed` | "Created vs done" chart, weekly view |
| `bucket` | `next-week` puts a task in the weekly plan; `channel` marks it as coming from outside |
| `source` | Where the task came from (a person, a channel) |
| `reason` | Why a task was killed, shown on the activity timeline |
| `status_log`, `status_changed` | Written by Star Tracker. Leave them alone. |

Every field name can be renamed under Settings → Star Tracker → Field names.

---

## Sprint note format

```markdown
---
tags: [sprint]
state: planned
start: 2026-10-13
end: 2026-10-26
goal: Ship push notifications
capacity: 20
---
```

`state` is `planned`, `active` or `closed`. Start and complete sprints from the **Star sprint** view; it fills in the committed and completed numbers.

---

## The tracker base

**Create a tracker** writes this for you. The short version, if you want to write or extend it by hand:

```yaml
filters:
  and:
    - file.hasTag("task")
views:
  - type: star-dashboard
    name: Dashboard
  - type: star-board
    name: Board
    groupBy:
      property: status
      direction: ASC
    newItemFolder: "Tracker"
    newItemProperties:
      tags:
        - "task"
  - type: star-sprint
    name: Sprint
  - type: star-weekly
    name: Weekly
  - type: star-timeline
    name: Timeline
  - type: star-activity
    name: Activity
    onlyBaseFiles: true
```

The top `filters` decide which notes the whole base sees. Each view can add its own `filters` on top.

---

## Custom dashboards

The Star dashboard always shows the same set of tiles and charts (open, done, overdue, blocked, by status, by priority, by stage, epics, created vs done, by owner, by area, by type, by related record, recently moved). You customise it in three ways:

1. **Filter what it counts.** A dashboard counts only the notes its view lets through. Add a second, third, fourth `star-dashboard` view, each with its own filter, and you get one dashboard per person, area or type.
2. **Change what the charts group by.** Statuses, stages, priorities, types, role fields and the related-record label all come from settings, so the charts follow your workflow.
3. **Run several trackers.** One base per team or project, each with its own tag, and if needed its own settings (Settings → Star Tracker → Show options for → Use own settings).

### Examples

Add these under `views:` in your tracker base, or use **Add view → Star dashboard** in the base and set the filter there.

One dashboard per owner:

```yaml
  - type: star-dashboard
    name: Alex
    filters:
      and:
        - owner == "alex"
```

Bugs only:

```yaml
  - type: star-dashboard
    name: Bugs
    filters:
      and:
        - type == "Bug"
```

One product area:

```yaml
  - type: star-dashboard
    name: Onboarding
    filters:
      and:
        - area == "Onboarding"
```

Tasks that link to one customer or deal note (in `deals` or anywhere in the note):

```yaml
  - type: star-dashboard
    name: Globex
    filters:
      and:
        - file.hasLink("Globex")
```

One folder:

```yaml
  - type: star-dashboard
    name: Q4 roadmap
    filters:
      and:
        - file.inFolder("Roadmap/Q4")
```

Everything still open, across all trackers (a separate base at the vault root):

```yaml
filters:
  and:
    - file.hasTag("task")
    - status != "Shipped"
views:
  - type: star-dashboard
    name: All open work
```

Pair each dashboard with a matching board (same filter, `type: star-board`) so you can act on what you see.

---

## A daily and weekly routine

**Every day**

1. Open the tracker (ribbon icon). Start on the **Dashboard**: check the red tiles (needs attention, top priority) and **Overdue**.
2. Work from the **Board**. Drag cards as status changes; Star Tracker logs each move.
3. Before a meeting about a task, open its note and click the **history icon** next to the edit button (or right-click its card → **Show activity**) to see its history.
4. At the end of the day, open **Activity timeline** (command palette) on **Day** to see what you did.

**Every week**

1. Set `bucket: next-week` on what you plan to take up.
2. Open the **Weekly** view → **Copy weekly update** → paste into your team channel.
3. Check the **Activity timeline** on **Week**, and the heatmap for quiet days.

**Every sprint**

1. **Sprint → Planning**: drag tasks from backlog into the sprint, estimate points, stay under capacity.
2. **Start sprint**. Work from **Sprint → Board**.
3. **Complete sprint**: unfinished tasks move to the next sprint or the backlog. Check the **Report** tab for burndown and velocity.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| A note does not show on the board | It needs the task tag and must match the base's filters. |
| Columns are in the wrong order | Statuses are ordered in Settings → Star Tracker → Statuses. |
| Weekly view shows nothing done | It reads `status_log`. Moves made before Star Tracker was installed are not there. |
| Burndown is flat | Tasks need `points`, or the chart counts tasks instead. |
| Activity timeline is empty | It records from the moment 1.6.0 is on. Edit a note to see the first entry. |
| Settings Claude wrote did not apply | Turn the plugin off and on, or restart Obsidian. |
