export type OptionKey = "a" | "b" | "c" | "d";

export const OPTION_KEYS: OptionKey[] = ["a", "b", "c", "d"];

export type Options = Record<OptionKey, string>;

/** A row exactly as pipeline/extract_pyq.py wrote it. */
export type ExtractedQuestion = {
  number: number;
  year: number;
  source_page: number;
  subject: string;
  chapter: string | null;
  topic: string | null;
  question: string;
  options: Options;
  answer: OptionKey | null;
  difficulty: string | null;
  confidence: string | null;
  has_figure: boolean;
  figure_path: string | null;
};

export type ReviewAction = "approved" | "rejected" | "skipped";

/**
 * One human decision. Appended, never overwritten - the newest record for an id
 * wins. Keeping the history means a mis-click is recoverable and the extraction
 * output stays untouched.
 */
export type Decision = {
  id: string;
  year: number;
  number: number;
  source_page: number;
  action: ReviewAction;
  reviewed_at: string;
  /** Present on approval: the corrected question as the reviewer left it. */
  edited?: {
    subject: string;
    chapter: string;
    topic: string;
    question: string;
    options: Options;
    answer: OptionKey;
    difficulty: string;
    /** Describes the figure without giving away the answer. Required if there is one. */
    alt_text: string;
  };
};

/**
 * What the chapter map proposes for this row. The extracted subject and chapter
 * are left untouched on the row itself so the original is always visible - this
 * is a proposal the reviewer confirms, not a silent rewrite of the source data.
 */
export type Normalisation = {
  subject: string;
  chapter: string;
  ncert_class: number | null;
  changed: boolean;
  needs_review: boolean;
  split_disputed: boolean;
  in_current_syllabus: boolean;
};

export type ReviewRow = ExtractedQuestion & {
  id: string;
  decision: Decision | null;
  normalised: Normalisation | null;
};

/** Extraction can emit the same question twice when it spans a page break. */
export function rowId(q: { year: number; number: number; source_page: number }): string {
  return `${q.year}-${String(q.number).padStart(3, "0")}-p${q.source_page}`;
}
