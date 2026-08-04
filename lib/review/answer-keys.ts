import { promises as fs } from "node:fs";
import path from "node:path";

import { type OptionKey, OPTION_KEYS } from "./types";

const KEYS_FILE = path.join(process.cwd(), "data", "reference", "answer-keys.json");

export type OfficialKeys = Map<string, OptionKey[]>;

function key(year: number, number: number): string {
  return `${year}-${number}`;
}

/**
 * The answers the papers print themselves, read by pipeline/answer_keys.py.
 *
 * This is the examiner's own answer, not a model's reading of a page image, so
 * where it exists it wins. It also fills gaps the extractor could not: 2019
 * prints its key as a block on the last page, which the extraction never saw,
 * leaving 176 questions with no answer at all.
 */
export async function loadOfficialKeys(): Promise<OfficialKeys> {
  const out: OfficialKeys = new Map();
  let raw: Record<string, { answers: Record<string, string[]> }>;
  try {
    raw = JSON.parse(await fs.readFile(KEYS_FILE, "utf8"));
  } catch {
    return out; // Not generated yet - everything falls back to the extraction.
  }

  for (const [year, entry] of Object.entries(raw)) {
    for (const [number, letters] of Object.entries(entry?.answers ?? {})) {
      const clean = (letters ?? []).filter((l): l is OptionKey =>
        (OPTION_KEYS as string[]).includes(l),
      );
      if (clean.length) out.set(key(Number(year), Number(number)), clean);
    }
  }
  return out;
}

export function officialFor(
  keys: OfficialKeys,
  year: number,
  number: number,
): OptionKey[] | null {
  return keys.get(key(year, number)) ?? null;
}
