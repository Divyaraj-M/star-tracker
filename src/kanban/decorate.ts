import { TFile } from "obsidian";
import type StarTrackerPlugin from "../main";
import { GRAY, clean, fmOf } from "../util";

/**
 * Star Tracker additions to a board card. Idempotent: safe to call on every render.
 * - priority chip on every card, colored by level
 * - blocked_by chip red while a blocker is open, green once all are done
 * - "blocks N" chip for open tasks waiting on this one
 * - epic chip (walks parent links), points and sprint chips
 */
export function decorateCard(plugin: StarTrackerPlugin, cardEl: HTMLElement, props: HTMLElement, file: TFile, groupBy: string | null) {
  const m = plugin.model, f = plugin.settings.fields;
  const fm = fmOf(plugin.app, file);
  const chipFor = (key: string) => props.querySelector<HTMLElement>(`.base-board-card-chip[data-property-id="note.${CSS.escape(key)}"]`);
  const extra = (cls: string, label: string, value: string, first = false) => {
    let chip = props.querySelector<HTMLElement>("." + cls);
    if (!chip) {
      chip = document.createElement("span");
      chip.className = "base-board-card-chip st-added " + cls;
      const l = document.createElement("span"); l.className = "base-board-chip-label"; l.textContent = label;
      const v = document.createElement("span"); v.className = "base-board-chip-value";
      chip.append(l, v);
      if (first) props.prepend(chip); else props.appendChild(chip);
    }
    const v = chip.querySelector(".base-board-chip-value");
    if (v && v.textContent !== value) v.textContent = value;
    return chip;
  };

  // priority
  if (groupBy !== f.priority) {
    const value = clean(fm[f.priority]);
    let chip = chipFor(f.priority);
    const filler = props.querySelector<HTMLElement>(".st-prio-fill");
    if (chip && filler) filler.remove();
    if (!chip) chip = extra("st-prio-fill", "priority", value || "No priority", true);
    chip.addClass("st-prio");
    chip.toggleClass("is-empty", !value);
    chip.style.setProperty("--st-chip", value ? m.priorityColor(value) : GRAY);
    if (props.firstElementChild !== chip) props.prepend(chip);
  }

  // blocked_by
  const bchip = chipFor(f.blockedBy);
  if (bchip) {
    const bl = m.blockers(fm, file.path);
    const open = bl.filter((b) => !m.isDone(clean(fmOf(plugin.app, b)[f.status])));
    bchip.addClass("st-blocked");
    bchip.toggleClass("is-cleared", bl.length > 0 && !open.length);
    bchip.title = bl.length ? (open.length ? `Waiting on: ${open.map((b) => b.basename).join(", ")}` : "All blockers done") : "";
  }

  // blocks N
  const blocks = plugin.blocksIndex().get(file.path) || [];
  const existing = props.querySelector(".st-blocks");
  if (blocks.length) {
    const c = extra("st-blocks", "blocks", `${blocks.length} task${blocks.length === 1 ? "" : "s"}`);
    c.title = blocks.map((b) => b.basename).join("\n");
  } else if (existing) existing.remove();

  // points and sprint styling
  const pchip = chipFor(f.points);
  if (pchip) pchip.addClass("st-points");
  const schip = chipFor(f.sprint);
  if (schip) schip.addClass("st-sprint");

  // status / type colors when shown as chips
  const stchip = chipFor(f.status);
  if (stchip) { stchip.addClass("st-pill"); stchip.style.setProperty("--st-chip", m.statusColor(clean(fm[f.status]))); }
  const tchip = chipFor(f.type);
  if (tchip) { tchip.addClass("st-type"); tchip.style.setProperty("--st-chip", m.typeDef(clean(fm[f.type])).color); }

  // epic
  const epic = m.findEpic(file);
  const echip = props.querySelector(".st-epic");
  if (epic && epic.path !== file.path) {
    const c = extra("st-epic", "epic", epic.basename);
    c.title = epic.basename;
  } else if (echip) echip.remove();

  cardEl.addClass("st-card-decorated");
}
