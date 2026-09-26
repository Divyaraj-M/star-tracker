export interface StatusDef { name: string; color: string; stage: string; handover?: boolean }
export interface StageDef { name: string; color: string }
export interface NamedColor { name: string; color: string }
export interface TypeDef { name: string; color: string; icon: string; child: string }
export interface RoleField { label: string; field: string }

export interface Fields {
  status: string;
  priority: string;
  type: string;
  parent: string;
  start: string;
  end: string;
  blockedBy: string;
  owner: string;
  waitingOn: string;
  area: string;
  related: string;
  opened: string;
  closed: string;
  due: string;
  bucket: string;
  source: string;
  nextAction: string;
  statusLog: string;
  statusChanged: string;
  sprint: string;
  points: string;
}

export interface StarSettings {
  taskTag: string;
  fields: Fields;
  statuses: StatusDef[];
  stages: StageDef[];
  doneStatus: string;
  attentionStatus: string;
  newStatus: string;
  priorities: NamedColor[];
  types: TypeDef[];
  roleFields: RoleField[];
  relatedLabel: string;
  logStatusChanges: boolean;
  setClosedOnDone: boolean;
  nextWeekBucket: string;
  channelBucket: string;
  internalSources: string[];
  defaultOwner: string;
  weekStartsMonday: boolean;
  sprintTag: string;
  sprintFolder: string;
  sprintLengthDays: number;
  defaultCapacity: number;
  pointScale: number[];
  /** Column order per board, used by the board view when a base does not store it. */
  columnConfigs: Record<string, { columns: string[] }>;
}

export const DEFAULT_SETTINGS: StarSettings = {
  taskTag: "task",
  fields: {
    status: "status",
    priority: "priority",
    type: "type",
    parent: "parent",
    start: "start",
    end: "end",
    blockedBy: "blocked_by",
    owner: "owner",
    waitingOn: "waiting_on",
    area: "area",
    related: "deals",
    opened: "opened",
    closed: "closed",
    due: "due",
    bucket: "bucket",
    source: "source",
    nextAction: "next_action",
    statusLog: "status_log",
    statusChanged: "status_changed",
    sprint: "sprint",
    points: "points",
  },
  statuses: [
    { name: "Backlog", color: "#93C5FD", stage: "Product" },
    { name: "Blocked by me", color: "#EF4444", stage: "Product" },
    { name: "Product in progress", color: "#2563EB", stage: "Product" },
    { name: "Handover to design", color: "#A78BFA", stage: "Product", handover: true },
    { name: "Design in progress", color: "#8B5CF6", stage: "Design" },
    { name: "Design review", color: "#6D28D9", stage: "Design" },
    { name: "Handover to dev", color: "#86EFAC", stage: "Design", handover: true },
    { name: "Dev in progress", color: "#22C55E", stage: "Dev" },
    { name: "UAT", color: "#F59E0B", stage: "Dev" },
    { name: "In testing", color: "#D97706", stage: "Dev" },
    { name: "Shipped", color: "#15803D", stage: "Done" },
  ],
  stages: [
    { name: "Product", color: "#2563EB" },
    { name: "Design", color: "#8B5CF6" },
    { name: "Dev", color: "#22C55E" },
    { name: "Done", color: "#15803D" },
  ],
  doneStatus: "Shipped",
  attentionStatus: "Blocked by me",
  newStatus: "Backlog",
  priorities: [
    { name: "Urgent", color: "#EF4444" },
    { name: "High", color: "#F97316" },
    { name: "Medium", color: "#FACC15" },
    { name: "Low", color: "#94A3B8" },
  ],
  types: [
    { name: "Epic", color: "#8B5CF6", icon: "⚡", child: "Story" },
    { name: "Story", color: "#22C55E", icon: "▣", child: "Sub-task" },
    { name: "Feature", color: "#3B82F6", icon: "★", child: "Sub-task" },
    { name: "Bug", color: "#EF4444", icon: "●", child: "Sub-task" },
    { name: "Task", color: "#0EA5E9", icon: "✓", child: "Sub-task" },
    { name: "Sub-task", color: "#94A3B8", icon: "↳", child: "" },
  ],
  roleFields: [
    { label: "Design owner", field: "design_owner" },
    { label: "Dev owner", field: "dev_owner" },
  ],
  relatedLabel: "Deal",
  logStatusChanges: true,
  setClosedOnDone: true,
  nextWeekBucket: "next-week",
  channelBucket: "channel",
  internalSources: [],
  defaultOwner: "",
  weekStartsMonday: true,
  sprintTag: "sprint",
  sprintFolder: "Sprints",
  sprintLengthDays: 14,
  defaultCapacity: 30,
  pointScale: [1, 2, 3, 5, 8, 13],
  columnConfigs: {},
};

/** Merge saved data over defaults so new settings keys get their default value. */
export function mergeSettings(saved: unknown): StarSettings {
  const d = defaultsCopy();
  if (!saved || typeof saved !== "object") return d;
  const src = saved as Partial<StarSettings>;
  const out: StarSettings = { ...d, ...src, fields: { ...d.fields, ...(src.fields ?? {}) } };
  if (!out.columnConfigs || typeof out.columnConfigs !== "object") out.columnConfigs = {};
  if (!Array.isArray(out.statuses)) out.statuses = d.statuses;
  if (!Array.isArray(out.stages)) out.stages = d.stages;
  if (!Array.isArray(out.priorities)) out.priorities = d.priorities;
  if (!Array.isArray(out.types)) out.types = d.types;
  if (!Array.isArray(out.roleFields)) out.roleFields = d.roleFields;
  if (!Array.isArray(out.internalSources)) out.internalSources = d.internalSources;
  if (!Array.isArray(out.pointScale)) out.pointScale = d.pointScale;
  return out;
}

export function defaultsCopy(): StarSettings {
  return structuredClone(DEFAULT_SETTINGS);
}
