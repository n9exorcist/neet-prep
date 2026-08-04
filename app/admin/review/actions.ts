"use server";

import { revalidatePath } from "next/cache";

import { appendDecision } from "@/lib/review/store";
import {
  type Decision,
  type OptionKey,
  type ReviewAction,
  OPTION_KEYS,
} from "@/lib/review/types";

export type DecisionInput = {
  id: string;
  year: number;
  number: number;
  source_page: number;
  action: ReviewAction;
  edited?: {
    subject: string;
    chapter: string;
    topic: string;
    question: string;
    options: Record<string, string>;
    answer: string;
    difficulty: string;
    alt_text: string;
    has_figure: boolean;
  };
};

export type DecisionResult = { ok: true } | { ok: false; error: string };

/**
 * Records one review decision. Validation lives here rather than only in the
 * client because this is the last gate before a question is marked fit to show
 * a student - a wrong answer key reaching someone with one attempt at a seat is
 * the most serious thing this project can get wrong.
 */
export async function recordDecision(input: DecisionInput): Promise<DecisionResult> {
  if (!input?.id) return { ok: false, error: "Missing question id." };

  const decision: Decision = {
    id: input.id,
    year: input.year,
    number: input.number,
    source_page: input.source_page,
    action: input.action,
    reviewed_at: new Date().toISOString(),
  };

  if (input.action === "approved") {
    const e = input.edited;
    if (!e) return { ok: false, error: "Nothing to approve." };

    const answer = (e.answer ?? "").trim().toLowerCase();
    if (!(OPTION_KEYS as string[]).includes(answer)) {
      return { ok: false, error: "Pick the correct answer before approving." };
    }
    if (!e.question.trim()) {
      return { ok: false, error: "Question text cannot be empty." };
    }
    if (!e.chapter.trim()) {
      return { ok: false, error: "Chapter is required - the planner ranks by chapter." };
    }
    const options = {} as Record<OptionKey, string>;
    for (const k of OPTION_KEYS) {
      const v = (e.options?.[k] ?? "").trim();
      if (!v) return { ok: false, error: `Option (${k}) is empty.` };
      options[k] = v;
    }
    // DESIGN.md: a figure question without alt text is not ready to ship.
    if (e.has_figure && !e.alt_text.trim()) {
      return {
        ok: false,
        error: "This question has a figure, so it needs alt text before approval.",
      };
    }

    decision.edited = {
      subject: e.subject.trim().toLowerCase(),
      chapter: e.chapter.trim(),
      topic: e.topic.trim(),
      question: e.question.trim(),
      options,
      answer: answer as OptionKey,
      difficulty: (e.difficulty || "medium").trim().toLowerCase(),
      alt_text: e.alt_text.trim(),
    };
  }

  await appendDecision(decision);
  revalidatePath("/admin/review");
  return { ok: true };
}
