"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { renderMathText } from "@/lib/review/math-text";
import { OPTION_KEYS } from "@/lib/review/types";

import { submitAnswer } from "./actions";

export type PracticeQuestion = {
  id: string;
  year: number;
  number: number;
  subject: string;
  chapter: string | null;
  topic: string | null;
  questionMd: string;
  options: Record<string, string>;
  difficulty: string;
  figure: string | null;
  altText: string | null;
};

type Outcome = { correct: boolean; answer: string; selected: string };

function Tex({ source, className }: { source: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: renderMathText(source) }} />;
}

export function PracticeClient({
  attemptId,
  questions,
}: {
  attemptId: string;
  questions: PracticeQuestion[];
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set in an effect, not during render: reading the clock while rendering is
  // impure and would differ between the server and the client.
  const startedAt = useRef<number | null>(null);

  const question = questions[index];
  const done = index >= questions.length;

  const score = useMemo(() => {
    const values = Object.values(results);
    return { right: values.filter(Boolean).length, total: values.length };
  }, [results]);

  const submit = useCallback(async () => {
    if (!question || !selected || outcome || busy) return;
    setBusy(true);
    setError(null);
    const result = await submitAnswer({
      attemptId,
      questionId: question.id,
      selected,
      seconds: startedAt.current
        ? Math.max(0, Math.round((Date.now() - startedAt.current) / 1000))
        : null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOutcome({ correct: result.correct, answer: result.answer, selected });
    setResults((r) => ({ ...r, [question.id]: result.correct }));
  }, [attemptId, busy, outcome, question, selected]);

  const next = useCallback(() => {
    setIndex((i) => i + 1);
    setSelected(null);
    setOutcome(null);
    setError(null);
  }, []);

  // Restart the clock whenever a new question appears.
  useEffect(() => {
    startedAt.current = Date.now();
  }, [index]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (!outcome && ["a", "b", "c", "d"].includes(key)) {
        e.preventDefault();
        setSelected(key);
      } else if (!outcome && ["1", "2", "3", "4"].includes(key)) {
        e.preventDefault();
        setSelected(OPTION_KEYS[Number(key) - 1]);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (outcome) next();
        else void submit();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, outcome, submit]);

  if (done) {
    return (
      <div
        className="rounded-[4px] border border-rule bg-paper-raised p-8 text-center"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <h2 className="t-h3">Session finished</h2>
        <p className="t-data mt-3 text-[1.5rem]">
          {score.right}
          <span className="text-graphite"> / {score.total}</span>
        </p>
        <p className="t-ui mt-2 text-graphite">
          Marks on this set: {score.right * 4 - (score.total - score.right)} of {score.total * 4},
          scored the way NEET does — four for a correct answer, minus one for a wrong one.
        </p>
      </div>
    );
  }

  return (
    <article
      className="rounded-[4px] border border-rule bg-paper-raised"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-3 sm:px-6">
        <p className="t-data">
          <span className="text-graphite">Q</span>
          {index + 1}
          <span className="text-graphite"> / {questions.length}</span>
        </p>
        <p className="t-label text-graphite">
          {question.chapter ?? question.subject}
          {" · "}
          {question.year}
        </p>
      </div>

      {/* The answer sheet: filled for answered, outlined for still to come. */}
      <ul className="flex flex-wrap gap-1.5 border-b border-rule px-4 py-3 sm:px-6" aria-hidden="true">
        {questions.map((q, i) => (
          <li key={q.id} className="bubble-sm" data-filled={i < index || Boolean(outcome && i === index)} />
        ))}
      </ul>

      <div className="px-4 py-5 sm:px-6 sm:py-6">
        {question.figure ? (
          <figure className="mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={question.figure}
              alt={question.altText ?? "Figure for this question"}
              loading="lazy"
              className="h-auto w-full rounded-[4px] border border-rule bg-white"
            />
          </figure>
        ) : null}

        <Tex source={question.questionMd} className="t-body block" />

        <fieldset className="mt-5" disabled={Boolean(outcome) || busy}>
          <legend className="sr-only">Answer for question {index + 1}</legend>
          <ul className="flex flex-col gap-2">
            {OPTION_KEYS.map((k, i) => {
              const isAnswer = outcome?.answer === k;
              const isWrongPick = outcome && outcome.selected === k && !outcome.correct;
              return (
                <li key={k}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-[4px] py-1">
                    <input
                      type="radio"
                      name="option"
                      value={k}
                      checked={selected === k}
                      onChange={() => setSelected(k)}
                      className="peer sr-only"
                    />
                    <span
                      className="bubble peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ink)]"
                      data-selected={selected === k}
                      aria-hidden="true"
                    >
                      {k.toUpperCase()}
                    </span>
                    <span className="sr-only">Option {i + 1}:</span>
                    <Tex source={question.options[k] ?? ""} className="t-body" />
                    {/* Never colour alone: each state carries a mark and a word. */}
                    {isAnswer ? (
                      <span className="t-ui ml-auto shrink-0 text-correct">
                        <span aria-hidden="true">✓ </span>correct
                      </span>
                    ) : null}
                    {isWrongPick ? (
                      <span className="t-ui ml-auto shrink-0 text-incorrect">
                        <span aria-hidden="true">✕ </span>your answer
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {outcome ? (
          <p role="status" className="t-body mt-5">
            {outcome.correct ? (
              <span className="text-correct">
                <span aria-hidden="true">✓ </span>Correct. +4 marks.
              </span>
            ) : (
              <span className="text-incorrect">
                <span aria-hidden="true">✕ </span>Not this time. −1 mark; the answer is{" "}
                {outcome.answer.toUpperCase()}.
              </span>
            )}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="t-ui mt-4 text-incorrect">
            <span aria-hidden="true">✕ </span>
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 border-t border-rule px-4 py-4 sm:px-6">
        {outcome ? (
          <button
            type="button"
            onClick={next}
            className="t-ui min-h-[44px] flex-1 rounded-[4px] border border-ink bg-ink px-4 text-[var(--paper)]"
          >
            Next <span className="t-data ml-1 text-[0.8125rem] opacity-70">↵</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!selected || busy}
            className="t-ui min-h-[44px] flex-1 rounded-[4px] border border-ink bg-ink px-4 text-[var(--paper)] disabled:opacity-50"
          >
            {busy ? "Checking…" : "Check answer"}
            <span className="t-data ml-1 text-[0.8125rem] opacity-70">↵</span>
          </button>
        )}
        <p className="t-data shrink-0 text-graphite">
          {score.right}
          <span aria-hidden="true">/</span>
          <span className="sr-only"> correct of </span>
          {score.total}
        </p>
      </div>
    </article>
  );
}
