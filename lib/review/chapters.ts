import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CANON_FILE = path.join(ROOT, "data", "reference", "ncert-chapters.json");
const MAP_FILE = path.join(ROOT, "data", "review", "chapter_map.json");

export type CanonicalChapter = {
  subject: string;
  name: string;
  ncert_class: number | null;
  in_current_syllabus: boolean;
  split_disputed: boolean;
};

export type ChapterMapEntry = {
  chapter: string | null;
  subject: string;
  ncert_class?: number | null;
  confidence?: number;
  needs_review?: boolean;
  split_disputed?: boolean;
  in_current_syllabus?: boolean;
};

/** The fixed NCERT list, flattened. Drives the datalist in the review form. */
export async function loadCanonicalChapters(): Promise<CanonicalChapter[]> {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(await fs.readFile(CANON_FILE, "utf8"));
  } catch {
    return [];
  }
  const out: CanonicalChapter[] = [];
  for (const [subject, chapters] of Object.entries(raw)) {
    if (subject.startsWith("_") || !Array.isArray(chapters)) continue;
    for (const c of chapters as Record<string, unknown>[]) {
      if (typeof c?.name !== "string") continue;
      out.push({
        subject,
        name: c.name,
        ncert_class: typeof c.ncert_class === "number" ? c.ncert_class : null,
        in_current_syllabus: c.in_current_syllabus !== false,
        split_disputed: c.split_disputed === true,
      });
    }
  }
  return out;
}

/**
 * Proposed mapping from an extracted "subject|chapter" to a canonical one,
 * produced by pipeline/normalise_chapters.py and hand-editable afterwards.
 */
export async function loadChapterMap(): Promise<Map<string, ChapterMapEntry>> {
  try {
    const raw = JSON.parse(await fs.readFile(MAP_FILE, "utf8")) as Record<string, ChapterMapEntry>;
    return new Map(Object.entries(raw));
  } catch {
    // No map yet is fine: rows simply keep the extractor's own chapter name.
    return new Map();
  }
}

export function chapterMapKey(subject: string | null, chapter: string | null): string {
  return `${(subject ?? "").trim().toLowerCase()}|${(chapter ?? "").trim()}`;
}

export function chaptersForDatalist(
  canon: CanonicalChapter[],
): Record<string, { name: string; dropped: boolean }[]> {
  const out: Record<string, { name: string; dropped: boolean }[]> = {};
  for (const c of canon) {
    (out[c.subject] ??= []).push({ name: c.name, dropped: !c.in_current_syllabus });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
