/** Text helpers for activity previews. Pure functions, no Obsidian API. */

const PREVIEW_CHARS = 240;

/** Markdown line to plain text: no links syntax, no list markers, no formatting characters. */
export function plain(line: string): string {
  return line
    .replace(/\s*[✅❌📅⏳🛫➕]\uFE0F?\s*\d{4}-\d{2}-\d{2}/gu, "")
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s*>+\s?/, "")
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/^\s*[-*+]\s+\[.\]\s+/, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+/, "")
    .replace(/[*_`~=]{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\s*(\r?\n|$)/, "");
}

function clip(s: string, n = PREVIEW_CHARS): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

/** First few lines of a note's body, as plain text. */
export function excerpt(text: string, lines = 3): string {
  const out: string[] = [];
  for (const raw of stripFrontmatter(text).split(/\r?\n/)) {
    if (/^\s*(```|%%|\|?\s*:?-{3,})/.test(raw)) continue;
    const p = plain(raw);
    if (p) out.push(p);
    if (out.length >= lines) break;
  }
  return clip(out.join("\n"));
}

/**
 * What changed between two versions of a note: the block between the shared start and the
 * shared end. `changed` counts the lines in that block (the larger side); `preview` is the
 * new text, or the removed text when the edit only deleted lines.
 */
export function lineDiff(before: string, after: string): { changed: number; preview: string } {
  const a = before.split(/\r?\n/), b = after.split(/\r?\n/);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const removed = a.slice(i, a.length - j), added = b.slice(i, b.length - j);
  const changed = Math.max(removed.length, added.length);
  const pick = (ls: string[]) => ls.map((l) => plain(l.replace(/^---$/, ""))).filter(Boolean).slice(0, 3).join("\n");
  const addedText = pick(added);
  if (addedText) return { changed, preview: clip(addedText) };
  const removedText = pick(removed);
  return { changed, preview: removedText ? clip("Removed: " + removedText) : "" };
}

const CHECKBOX = /^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]\s+(.*)$/;
/** Tasks plugin adds a done / cancelled date after the text; ignore it when matching lines. */
function taskKey(text: string): string {
  return text.replace(/\s*[✅❌]\s*\d{4}-\d{2}-\d{2}/gu, "").trim();
}

/** Checkboxes that went from open to done ([x]) or cancelled ([-]) between two versions. */
export function checkboxChanges(before: string, after: string): { text: string; done: boolean }[] {
  const open = new Map<string, number>();
  for (const line of before.split(/\r?\n/)) {
    const m = line.match(CHECKBOX);
    if (m && m[1] === " ") { const k = taskKey(m[2]); open.set(k, (open.get(k) ?? 0) + 1); }
  }
  const prevClosed = new Map<string, number>();
  for (const line of before.split(/\r?\n/)) {
    const m = line.match(CHECKBOX);
    if (m && m[1] !== " ") { const k = taskKey(m[2]) + "|" + m[1].toLowerCase(); prevClosed.set(k, (prevClosed.get(k) ?? 0) + 1); }
  }
  const out: { text: string; done: boolean }[] = [];
  for (const line of after.split(/\r?\n/)) {
    const m = line.match(CHECKBOX);
    if (!m) continue;
    const state = m[1].toLowerCase();
    if (state !== "x" && state !== "-") continue;
    const k = taskKey(m[2]);
    const ck = k + "|" + state;
    // already closed this way before: not a new change
    const pc = prevClosed.get(ck) ?? 0;
    if (pc > 0) { prevClosed.set(ck, pc - 1); continue; }
    const n = open.get(k) ?? 0;
    if (n <= 0) continue;
    open.set(k, n - 1);
    out.push({ text: plain(k) || k, done: state === "x" });
  }
  return out;
}

/** Frontmatter keys with their lines, plus the body. Lines under a key (lists, nested values) belong to it. */
function splitNote(text: string): { keys: Map<string, string>; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  const keys = new Map<string, string>();
  if (!m) return { keys, body: text };
  let cur = "";
  for (const line of m[1].split(/\r?\n/)) {
    const k = line.match(/^([^\s:#][^:]*):/);
    if (k) cur = k[1].trim();
    keys.set(cur, (keys.get(cur) ?? "") + line + "\n");
  }
  return { keys, body: text.slice(m[0].length) };
}

/** True when the only differences are in these frontmatter keys (for example fields the plugin writes itself). */
export function onlyKeysChanged(before: string, after: string, ignore: string[]): boolean {
  if (before === after) return true;
  const a = splitNote(before), b = splitNote(after);
  if (a.body !== b.body) return false;
  const skip = new Set(ignore);
  const all = new Set([...a.keys.keys(), ...b.keys.keys()]);
  for (const k of all) if (!skip.has(k) && a.keys.get(k) !== b.keys.get(k)) return false;
  return true;
}
