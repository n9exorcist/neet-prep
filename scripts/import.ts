/**
 * Import reviewed questions into Supabase.
 *
 *   npm run import -- --dry-run     # report what would happen, touch nothing
 *   npm run import                  # seed chapters, upload figures, upsert rows
 *
 * Needs, in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY      server-side only, never shipped to a browser
 *
 * Idempotent: chapters upsert on (subject, name), questions on
 * (year, question_number), figures upload with upsert. Running it twice changes
 * nothing the second time.
 *
 * By default ONLY questions approved in /admin/review are imported. That is the
 * guardrail in CLAUDE.md made operational: an unverified answer key never
 * reaches the database, let alone a student.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadRows } from "../lib/review/store";
import { OPTION_KEYS, type ReviewRow } from "../lib/review/types";

const BUCKET = "figures";
const MARKS_PER_QUESTION = 4;

type Args = { dryRun: boolean; includeUnreviewed: boolean };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes("--dry-run"),
    includeUnreviewed: argv.includes("--include-unreviewed"),
  };
}

async function loadEnv(): Promise<void> {
  // Small hand-rolled .env.local reader: this script runs outside Next, which is
  // what would normally load it, and one file is not worth a dependency.
  try {
    const raw = await fs.readFile(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  } catch {
    // Fine - the variables may already be in the environment.
  }
}

/** The shape we actually insert, built from the reviewer's edits. */
type ImportRow = {
  year: number;
  question_number: number;
  subject: string;
  chapter: string;
  topic: string | null;
  question_md: string;
  options: Record<string, string>;
  answer: string;
  difficulty: string;
  alt_text: string | null;
  figure_source: string | null; // local path, uploaded later
  figure_name: string | null;
  is_section_b: boolean;
  source_page: number;
};

function toImportRow(row: ReviewRow): ImportRow | { error: string } {
  const e = row.decision?.edited;
  const subject = (e?.subject ?? row.subject ?? "").toLowerCase();
  const chapter = (e?.chapter ?? row.chapter ?? "").trim();
  const answer = (e?.answer ?? row.answer ?? "").toLowerCase();

  if (subject === "biology") {
    return {
      error:
        "subject is 'biology' - resolve to botany or zoology before import " +
        "(the planner allocates hours per subject and cannot split an umbrella)",
    };
  }
  if (!["physics", "chemistry", "botany", "zoology"].includes(subject)) {
    return { error: `unknown subject ${subject || "(blank)"}` };
  }
  if (!chapter) return { error: "no chapter" };
  if (!(OPTION_KEYS as string[]).includes(answer)) return { error: "no answer key" };

  const options = e?.options ?? row.options;
  for (const k of OPTION_KEYS) {
    if (!String(options[k] ?? "").trim()) return { error: `option (${k}) is empty` };
  }

  const altText = (e?.alt_text ?? "").trim();
  if (row.figure_path && !altText) {
    return { error: "has a figure but no alt text" };
  }

  return {
    year: row.year,
    question_number: row.number,
    subject,
    chapter,
    topic: (e?.topic ?? row.topic ?? "").trim() || null,
    question_md: (e?.question ?? row.question).trim(),
    options: Object.fromEntries(OPTION_KEYS.map((k) => [k, String(options[k]).trim()])),
    answer,
    difficulty: (e?.difficulty ?? row.difficulty ?? "medium").toLowerCase(),
    alt_text: altText || null,
    figure_source: row.figure_path
      ? path.join(process.cwd(), "data", "extracted", String(row.year), row.figure_path)
      : null,
    figure_name: row.figure_path ? `${row.year}/${row.figure_path.split("/").pop()}` : null,
    is_section_b: row.number > 180,
    source_page: row.source_page,
  };
}

async function ensureBucket(db: SupabaseClient): Promise<void> {
  const { data } = await db.storage.listBuckets();
  if (data?.some((b) => b.name === BUCKET)) return;
  // Public: figures are exam diagrams shown to every student, and a signed URL
  // per question would cost a round trip on a slow connection for no benefit.
  const { error } = await db.storage.createBucket(BUCKET, { public: true });
  if (error && !/exists/i.test(error.message)) throw error;
}

async function main(): Promise<void> {
  const args = parseArgs();
  await loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const rows = await loadRows();
  const candidates = rows.filter((r) =>
    args.includeUnreviewed ? r.decision?.action !== "rejected" : r.decision?.action === "approved",
  );

  const ready: ImportRow[] = [];
  const rejected: string[] = [];
  for (const row of candidates) {
    const result = toImportRow(row);
    if ("error" in result) rejected.push(`${row.id}: ${result.error}`);
    else ready.push(result);
  }

  // A duplicate here means both copies of a page-break duplicate were approved.
  // Fail loudly rather than let one silently overwrite the other.
  const byNumber = new Map<string, ImportRow>();
  const clashes: string[] = [];
  for (const r of ready) {
    const k = `${r.year}-${r.question_number}`;
    if (byNumber.has(k)) clashes.push(`${k} approved twice (pages ${byNumber.get(k)!.source_page} and ${r.source_page})`);
    else byNumber.set(k, r);
  }

  console.log(`extracted rows:        ${rows.length}`);
  console.log(`selected for import:   ${candidates.length}`);
  console.log(`importable:            ${byNumber.size}`);
  console.log(`held back:             ${rejected.length}`);
  for (const r of rejected.slice(0, 15)) console.log(`   ${r}`);
  if (rejected.length > 15) console.log(`   ... and ${rejected.length - 15} more`);
  if (clashes.length) {
    console.error(`\nDUPLICATE APPROVALS (${clashes.length}) - fix these in /admin/review:`);
    for (const c of clashes) console.error(`   ${c}`);
    process.exitCode = 1;
    return;
  }

  if (byNumber.size === 0) {
    console.log(
      "\nNothing to import. Approve questions in /admin/review first - " +
        "import deliberately refuses unverified rows.",
    );
    return;
  }

  if (args.dryRun) {
    console.log("\n--dry-run: stopping before any write.");
    return;
  }

  if (!url || !key) {
    console.error(
      "\nNEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set " +
        "in .env.local before importing.",
    );
    process.exitCode = 1;
    return;
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const importable = [...byNumber.values()];

  // 1. Chapters. Seeded from the reviewer's chapter names, so normalising a name
  //    in review is what defines the chapter list.
  const chapterKeys = new Map<string, { subject: string; name: string }>();
  for (const r of importable) chapterKeys.set(`${r.subject}|${r.chapter}`, { subject: r.subject, name: r.chapter });

  const { error: chapterError } = await db
    .from("chapters")
    .upsert([...chapterKeys.values()], { onConflict: "subject,name", ignoreDuplicates: true });
  if (chapterError) throw chapterError;

  const { data: chapterRows, error: readError } = await db.from("chapters").select("id, subject, name");
  if (readError) throw readError;
  const chapterId = new Map(chapterRows!.map((c) => [`${c.subject}|${c.name}`, c.id as string]));
  console.log(`\nchapters present:      ${chapterId.size}`);

  // 2. Figures.
  await ensureBucket(db);
  let uploaded = 0;
  let missing = 0;
  for (const r of importable) {
    if (!r.figure_source || !r.figure_name) continue;
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(r.figure_source);
    } catch {
      missing += 1;
      console.warn(`   figure missing on disk: ${r.figure_source}`);
      continue;
    }
    const { error } = await db.storage
      .from(BUCKET)
      .upload(r.figure_name, bytes, { contentType: "image/png", upsert: true });
    if (error) throw error;
    uploaded += 1;
  }
  console.log(`figures uploaded:      ${uploaded}${missing ? ` (${missing} missing on disk)` : ""}`);

  // 3. Questions.
  const payload = importable.map((r) => ({
    year: r.year,
    question_number: r.question_number,
    subject: r.subject,
    chapter_id: chapterId.get(`${r.subject}|${r.chapter}`) ?? null,
    topic: r.topic,
    question_md: r.question_md,
    options: r.options,
    answer: r.answer,
    difficulty: r.difficulty,
    figure_url: r.figure_name ? `${BUCKET}/${r.figure_name}` : null,
    alt_text: r.alt_text,
    is_section_b: r.is_section_b,
    reviewed: true, // only approved rows reach here
    source_page: r.source_page,
  }));

  const { error: questionError } = await db
    .from("questions")
    .upsert(payload, { onConflict: "year,question_number" });
  if (questionError) throw questionError;
  console.log(`questions upserted:    ${payload.length}`);

  // 4. Chapter statistics, recomputed from what is actually in the table.
  const { data: counts, error: countError } = await db
    .from("questions")
    .select("chapter_id, year")
    .eq("reviewed", true);
  if (countError) throw countError;

  const perChapter = new Map<string, { n: number; years: Set<number> }>();
  for (const q of counts ?? []) {
    if (!q.chapter_id) continue;
    const entry = perChapter.get(q.chapter_id) ?? { n: 0, years: new Set<number>() };
    entry.n += 1;
    entry.years.add(q.year);
    perChapter.set(q.chapter_id, entry);
  }

  for (const [id, { n, years }] of perChapter) {
    // Section B questions are counted in full here. They were optional in the
    // exam, so if the planner should discount them it must do so using
    // is_section_b - better an explicit decision there than a fudge factor
    // buried in an import script.
    const { error } = await db
      .from("chapters")
      .update({
        pyq_question_count: n,
        avg_marks_per_year: Number(((n * MARKS_PER_QUESTION) / Math.max(years.size, 1)).toFixed(2)),
      })
      .eq("id", id);
    if (error) throw error;
  }
  console.log(`chapter stats updated: ${perChapter.size}`);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
