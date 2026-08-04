"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { renderMathText } from "@/lib/review/math-text";
import type { FigureMeta } from "@/lib/review/store";
import { OPTION_KEYS, type ReviewRow } from "@/lib/review/types";

import { recordDecision } from "./actions";

const DIFFICULTIES = ["easy", "medium", "hard"];
const SUBJECTS = ["physics", "chemistry", "botany", "zoology", "biology"];

function Math({ source, className }: { source: string; className?: string }) {
  return (
    <span className={className} dangerouslySetInnerHTML={{ __html: renderMathText(source) }} />
  );
}

export function ReviewClient({
  row,
  remaining,
  chapters,
  figureMeta,
}: {
  row: ReviewRow;
  remaining: number;
  chapters: Record<string, string[]>;
  figureMeta: FigureMeta | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // A previously skipped question comes back with whatever edits were made then.
  const seed = row.decision?.edited;
  const [subject, setSubject] = useState(seed?.subject ?? row.subject ?? "");
  const [chapter, setChapter] = useState(seed?.chapter ?? row.chapter ?? "");
  const [topic, setTopic] = useState(seed?.topic ?? row.topic ?? "");
  const [difficulty, setDifficulty] = useState(seed?.difficulty ?? row.difficulty ?? "medium");
  const [question, setQuestion] = useState(seed?.question ?? row.question ?? "");
  const [options, setOptions] = useState<Record<string, string>>(
    () => seed?.options ?? { ...row.options },
  );
  const [answer, setAnswer] = useState<string>(seed?.answer ?? row.answer ?? "");
  const [altText, setAltText] = useState(seed?.alt_text ?? "");
  const [figureBroken, setFigureBroken] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showPage, setShowPage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFigure = Boolean(row.figure_path);
  const figureSrc = row.figure_path
    ? `/api/figure/${row.year}/${row.figure_path.split("/").pop()}`
    : null;

  function submit(action: "approved" | "skipped" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await recordDecision({
        id: row.id,
        year: row.year,
        number: row.number,
        source_page: row.source_page,
        action,
        edited: {
          subject,
          chapter,
          topic,
          question,
          options,
          answer,
          difficulty,
          alt_text: altText,
          has_figure: hasFigure,
        },
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  // Keyboard: A-D or 1-4 pick the answer, Enter approves, S skips, X rejects.
  // Ignored while typing, so editing question text never triggers an action.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        el?.isContentEditable;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing && e.key !== "Escape") return;

      const key = e.key.toLowerCase();
      if (["a", "b", "c", "d"].includes(key)) {
        e.preventDefault();
        setAnswer(key);
      } else if (["1", "2", "3", "4"].includes(key)) {
        e.preventDefault();
        setAnswer(OPTION_KEYS[Number(key) - 1]);
      } else if (e.key === "Enter") {
        e.preventDefault();
        submit("approved");
      } else if (key === "s") {
        e.preventDefault();
        submit("skipped");
      } else if (key === "x") {
        e.preventDefault();
        submit("rejected");
      } else if (e.key === "Escape") {
        (el as HTMLElement | null)?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const flags: string[] = [];
  if (row.answer == null) flags.push("no answer key in source");
  if (row.confidence === "low") flags.push("low confidence");
  if (row.has_figure && !row.figure_path) flags.push("figure expected but not cropped");
  if (row.decision?.action === "skipped") flags.push("skipped earlier");

  return (
    <article
      className="rounded-[4px] border border-rule bg-paper-raised"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-3 sm:px-6">
        <p className="t-data">
          <span className="text-graphite">Q</span>
          {row.number}
          <span className="text-graphite"> · {row.year} · p{row.source_page}</span>
        </p>
        <p className="t-label text-graphite">{remaining} left</p>
      </div>

      {flags.length > 0 ? (
        <p className="t-ui border-b border-rule bg-paper px-4 py-2 text-graphite sm:px-6">
          <span aria-hidden="true">⚑ </span>
          {flags.join(" · ")}
        </p>
      ) : null}

      <div className="px-4 py-5 sm:px-6 sm:py-6">
        {hasFigure ? (
          <figure className="mb-5">
            {figureBroken ? (
              <p className="t-ui rounded-[4px] border border-rule px-4 py-6 text-center text-graphite">
                The figure for this question failed to load. Check
                <code className="t-data mx-1 text-[0.875rem]">{row.figure_path}</code>
                before approving.
              </p>
            ) : (
              /* Rendered at its own proportions. width/height reserve the exact
                 space so the layout does not jump, without squashing crops that
                 range from taller-than-wide to eight times wider than tall. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={figureSrc ?? ""}
                alt={altText || "Figure for this question, awaiting a description"}
                loading="lazy"
                width={figureMeta?.width}
                height={figureMeta?.height}
                onError={() => setFigureBroken(true)}
                className="h-auto w-full rounded-[4px] border border-rule bg-white"
              />
            )}

            {figureMeta?.short ? (
              <figcaption className="t-ui mt-2 text-incorrect">
                <span aria-hidden="true">⚠ </span>
                This crop is only {figureMeta.height}px tall and may be blank or cut
                off. Check it against the full page before approving.
              </figcaption>
            ) : null}

            <button
              type="button"
              onClick={() => setShowPage((v) => !v)}
              className="t-ui mt-2 min-h-[44px] text-graphite underline underline-offset-4 hover:text-ink"
              aria-expanded={showPage}
            >
              {showPage ? "Hide" : "Show"} full page {row.source_page}
            </button>

            {showPage ? (
              /* Both pages: a diagram question near the foot of a page routinely
                 has its last option printed overleaf, so page N alone is not
                 enough to tell whether the crop lost anything. */
              <div className="mt-2 flex flex-col gap-2">
                {[row.source_page, row.source_page + 1].map((p) => (
                  <div key={p}>
                    <p className="t-label text-graphite">Page {p}</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/page/${row.year}/${p}`}
                      alt={`Full source page ${p} of the ${row.year} paper`}
                      loading="lazy"
                      className="mt-1 h-auto w-full rounded-[4px] border border-rule bg-white"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </figure>
        ) : null}

        <Math source={question} className="t-body block" />

        <fieldset className="mt-5">
          <legend className="sr-only">Correct answer for question {row.number}</legend>
          <ul className="flex flex-col gap-2">
            {OPTION_KEYS.map((k, i) => (
              <li key={k}>
                <label className="flex cursor-pointer items-center gap-3 rounded-[4px] py-1">
                  <input
                    type="radio"
                    name="answer"
                    value={k}
                    checked={answer === k}
                    onChange={() => setAnswer(k)}
                    className="peer sr-only"
                  />
                  <span
                    className="bubble peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ink)]"
                    data-selected={answer === k}
                    aria-hidden="true"
                  >
                    {k.toUpperCase()}
                  </span>
                  <span className="sr-only">Option {i + 1}:</span>
                  <Math source={options[k] ?? ""} className="t-body" />
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        {answer === "" ? (
          <p className="t-ui mt-3 text-graphite">
            No answer selected. Press A–D or 1–4.
          </p>
        ) : null}
      </div>

      <div className="border-t border-rule px-4 py-5 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Chapter" hint="Required — the planner ranks by chapter">
            <input
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              list="chapter-options"
              className={inputClass}
            />
            <datalist id="chapter-options">
              {(chapters[subject] ?? []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Topic">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Subject">
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputClass}
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Difficulty">
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className={inputClass}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {hasFigure ? (
          <div className="mt-4">
            <Field
              label="Figure alt text"
              hint="Describe the figure without giving away the answer. Required."
            >
              <textarea
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                rows={2}
                className={inputClass}
              />
            </Field>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setShowText((v) => !v)}
          className="t-ui mt-4 min-h-[44px] text-graphite underline underline-offset-4 hover:text-ink"
          aria-expanded={showText}
        >
          {showText ? "Hide" : "Edit"} question and option text
        </button>

        {showText ? (
          <div className="mt-3 grid gap-4">
            <Field label="Question" hint="LaTeX inside $…$">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={5}
                className={`${inputClass} font-[var(--font-data)] text-[0.875rem]`}
              />
            </Field>
            {OPTION_KEYS.map((k) => (
              <Field key={k} label={`Option ${k.toUpperCase()}`}>
                <textarea
                  value={options[k] ?? ""}
                  onChange={(e) => setOptions((o) => ({ ...o, [k]: e.target.value }))}
                  rows={2}
                  className={`${inputClass} font-[var(--font-data)] text-[0.875rem]`}
                />
              </Field>
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="t-ui border-t border-rule px-4 py-3 text-incorrect sm:px-6"
        >
          <span aria-hidden="true">✕ </span>
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={() => submit("approved")}
          disabled={pending}
          className="t-ui min-h-[44px] flex-1 rounded-[4px] border border-ink bg-ink px-4 text-[var(--paper)] disabled:opacity-50"
        >
          Approve <span className="t-data ml-1 text-[0.8125rem] opacity-70">↵</span>
        </button>
        <button
          type="button"
          onClick={() => submit("skipped")}
          disabled={pending}
          className="t-ui min-h-[44px] rounded-[4px] border border-rule px-4 hover:border-ink disabled:opacity-50"
        >
          Skip <span className="t-data ml-1 text-[0.8125rem] text-graphite">S</span>
        </button>
        <button
          type="button"
          onClick={() => submit("rejected")}
          disabled={pending}
          className="t-ui min-h-[44px] rounded-[4px] border border-rule px-4 text-graphite hover:border-incorrect hover:text-incorrect disabled:opacity-50"
        >
          Reject <span className="t-data ml-1 text-[0.8125rem]">X</span>
        </button>
      </div>
    </article>
  );
}

const inputClass =
  "w-full min-h-[44px] rounded-[4px] border border-rule bg-paper px-3 py-2 text-ink";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="t-label block text-graphite">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint ? <span className="t-ui mt-1 block text-graphite">{hint}</span> : null}
    </label>
  );
}
