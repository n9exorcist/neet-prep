"use server";

import { createClient } from "@/lib/supabase/server";

export type AnswerResult =
  | { ok: true; correct: boolean; answer: string }
  | { ok: false; error: string };

/**
 * Grades one answer.
 *
 * The comparison happens in the database, in submit_response, because the
 * student's own client is not permitted to read questions.answer - checking
 * correctness here would mean this code could read the key, and anything this
 * code can read a determined student can eventually read too.
 */
export async function submitAnswer(input: {
  attemptId: string;
  questionId: string;
  selected: string;
  seconds: number | null;
}): Promise<AnswerResult> {
  const supabase = await createClient();

  const { data: correct, error } = await supabase.rpc("submit_response", {
    p_attempt_id: input.attemptId,
    p_question_id: input.questionId,
    p_selected: input.selected,
    p_seconds: input.seconds,
  });
  if (error) return { ok: false, error: error.message };

  // Released only now that a response exists for this question.
  const { data: answer, error: revealError } = await supabase.rpc("reveal_answer", {
    p_question_id: input.questionId,
  });
  if (revealError) return { ok: false, error: revealError.message };

  return { ok: true, correct: Boolean(correct), answer: String(answer) };
}

/** Opens a practice attempt, or reuses the one already in progress. */
export async function startAttempt(): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Signed out." };

  const { data: open } = await supabase
    .from("attempts")
    .select("id")
    .eq("student_id", user.id)
    .eq("kind", "practice")
    .is("completed_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (open) return { id: open.id as string };

  const { data, error } = await supabase
    .from("attempts")
    .insert({ student_id: user.id, kind: "practice" })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data.id as string };
}
