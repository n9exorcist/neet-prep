import { promises as fs } from "node:fs";
import path from "node:path";

import {
  type Decision,
  type ExtractedQuestion,
  type OptionKey,
  type Options,
  type ReviewRow,
  OPTION_KEYS,
  rowId,
} from "./types";

const ROOT = process.cwd();
const EXTRACTED_DIR = path.join(ROOT, "data", "extracted");
const DECISIONS_FILE = path.join(ROOT, "data", "review", "decisions.jsonl");

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function normaliseOptions(raw: unknown): Options {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Options;
  for (const k of OPTION_KEYS) out[k] = asString(src[k]).trim();
  return out;
}

function normaliseAnswer(raw: unknown): OptionKey | null {
  const v = asString(raw).trim().toLowerCase().replace(/[()\s.]/g, "");
  return (OPTION_KEYS as string[]).includes(v) ? (v as OptionKey) : null;
}

/**
 * Read every extracted question. Malformed lines are skipped rather than thrown:
 * the extractor appends while a run is in progress, so a torn final line is
 * normal and must not take the page down.
 */
export async function readExtracted(): Promise<ExtractedQuestion[]> {
  let years: string[];
  try {
    years = (await fs.readdir(EXTRACTED_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }

  const rows: ExtractedQuestion[] = [];
  for (const year of years) {
    let text: string;
    try {
      text = await fs.readFile(path.join(EXTRACTED_DIR, year, "questions.jsonl"), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const number = Number(raw.number);
      const sourcePage = Number(raw.source_page);
      if (!Number.isFinite(number) || !Number.isFinite(sourcePage)) continue;

      rows.push({
        number,
        year: Number(raw.year) || Number(year),
        source_page: sourcePage,
        subject: asString(raw.subject).toLowerCase(),
        chapter: asString(raw.chapter) || null,
        topic: asString(raw.topic) || null,
        question: asString(raw.question),
        options: normaliseOptions(raw.options),
        answer: normaliseAnswer(raw.answer),
        difficulty: asString(raw.difficulty) || null,
        confidence: asString(raw.confidence) || null,
        has_figure: Boolean(raw.has_figure),
        figure_path: asString(raw.figure_path) || null,
      });
    }
  }
  return rows;
}

/** Latest decision per row id. */
export async function readDecisions(): Promise<Map<string, Decision>> {
  const out = new Map<string, Decision>();
  let text: string;
  try {
    text = await fs.readFile(DECISIONS_FILE, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const d = JSON.parse(trimmed) as Decision;
      if (d?.id) out.set(d.id, d); // later lines win
    } catch {
      continue;
    }
  }
  return out;
}

export async function appendDecision(decision: Decision): Promise<void> {
  await fs.mkdir(path.dirname(DECISIONS_FILE), { recursive: true });
  await fs.appendFile(DECISIONS_FILE, JSON.stringify(decision) + "\n", "utf8");
}

export type FigureMeta = { width: number; height: number; short: boolean };

/**
 * PNG width/height straight from the IHDR header - 24 bytes, no decoding. Used
 * to reserve exact layout space and to flag crops that came out suspiciously
 * short, which is the signature of a figure_span that missed its target.
 */
export async function getFigureMeta(
  year: number,
  figurePath: string,
): Promise<FigureMeta | null> {
  const name = figurePath.split("/").pop();
  if (!name) return null;
  try {
    const fh = await fs.open(path.join(EXTRACTED_DIR, String(year), "figures", name), "r");
    try {
      const buf = Buffer.alloc(24);
      const { bytesRead } = await fh.read(buf, 0, 24, 0);
      if (bytesRead < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      // 400px at 200dpi is about two inches - too little for a real diagram.
      // Set to catch all three known-blank crops; a false warning costs a glance,
      // a blank figure reaching a student costs them the question.
      return { width, height, short: height < 400 };
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}

export type ReviewStats = {
  total: number;
  approved: number;
  rejected: number;
  skipped: number;
  pending: number;
  byYear: { year: number; total: number; done: number }[];
};

export async function loadRows(): Promise<ReviewRow[]> {
  const [extracted, decisions] = await Promise.all([readExtracted(), readDecisions()]);
  return extracted.map((q) => {
    const id = rowId(q);
    return { ...q, id, decision: decisions.get(id) ?? null };
  });
}

export function computeStats(rows: ReviewRow[]): ReviewStats {
  const byYear = new Map<number, { total: number; done: number }>();
  let approved = 0;
  let rejected = 0;
  let skipped = 0;

  for (const r of rows) {
    const entry = byYear.get(r.year) ?? { total: 0, done: 0 };
    entry.total += 1;
    const action = r.decision?.action;
    if (action === "approved") approved += 1;
    else if (action === "rejected") rejected += 1;
    else if (action === "skipped") skipped += 1;
    if (action === "approved" || action === "rejected") entry.done += 1;
    byYear.set(r.year, entry);
  }

  return {
    total: rows.length,
    approved,
    rejected,
    skipped,
    pending: rows.length - approved - rejected,
    byYear: [...byYear.entries()]
      .map(([year, v]) => ({ year, ...v }))
      .sort((a, b) => a.year - b.year),
  };
}

/**
 * Review order: never-seen questions first, then ones explicitly skipped, so a
 * skip parks a question at the back of the queue instead of losing it. Within
 * each group, low-confidence and missing-answer rows come first - those are the
 * ones most likely to be wrong, and the ones worth the reviewer's attention
 * while it is still fresh.
 */
export function buildQueue(rows: ReviewRow[], year?: number): ReviewRow[] {
  const pending = rows.filter((r) => {
    const a = r.decision?.action;
    if (a === "approved" || a === "rejected") return false;
    return year ? r.year === year : true;
  });

  const risk = (r: ReviewRow) =>
    (r.answer == null ? 2 : 0) +
    (r.confidence === "low" ? 1 : 0) +
    (r.has_figure && !r.figure_path ? 2 : 0);

  return pending.sort((a, b) => {
    const aSkipped = a.decision?.action === "skipped" ? 1 : 0;
    const bSkipped = b.decision?.action === "skipped" ? 1 : 0;
    if (aSkipped !== bSkipped) return aSkipped - bSkipped;
    const r = risk(b) - risk(a);
    if (r !== 0) return r;
    if (a.year !== b.year) return a.year - b.year;
    if (a.number !== b.number) return a.number - b.number;
    return a.source_page - b.source_page;
  });
}

/** Distinct chapter names already in use, for the datalist that nudges the
 *  reviewer toward one spelling per chapter instead of five. */
export function chaptersBySubject(rows: ReviewRow[]): Record<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const chapter = r.decision?.edited?.chapter ?? r.chapter;
    if (!chapter) continue;
    const subject = r.decision?.edited?.subject ?? r.subject;
    if (!map.has(subject)) map.set(subject, new Set());
    map.get(subject)!.add(chapter.trim());
  }
  return Object.fromEntries(
    [...map.entries()].map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b))]),
  );
}
