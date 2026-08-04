"use client";

import { useActionState } from "react";

import { saveProfile, type OnboardingResult } from "./actions";

export function OnboardingForm() {
  const [result, action, pending] = useActionState<OnboardingResult, FormData>(
    saveProfile,
    undefined,
  );

  return (
    <form action={action} className="mt-8 flex flex-col gap-5">
      <Field label="Your name">
        <input name="name" required autoComplete="name" className={inputClass} />
      </Field>

      <Field
        label="Target score"
        hint="Out of 720. A score near 550 is often enough for a government MBBS seat under the 7.5% quota."
      >
        <input
          name="target_score"
          type="number"
          min={0}
          max={720}
          defaultValue={550}
          required
          inputMode="numeric"
          className={`${inputClass} tabular`}
        />
      </Field>

      <Field label="Exam date">
        <input name="exam_date" type="date" required className={inputClass} />
      </Field>

      <Field label="School type" hint="Government school accounts are free, permanently.">
        <select name="school_type" defaultValue="" className={inputClass}>
          <option value="">Prefer not to say</option>
          <option value="government">Government</option>
          <option value="private">Private</option>
        </select>
      </Field>

      <Field label="Quota category" hint="Optional. Affects the score you realistically need.">
        <input name="quota_category" className={inputClass} />
      </Field>

      {result && !result.ok ? (
        <p role="alert" className="t-ui text-incorrect">
          <span aria-hidden="true">✕ </span>
          {result.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="t-ui min-h-[44px] rounded-[4px] border border-ink bg-ink px-5 text-[var(--paper)] disabled:opacity-50"
      >
        {pending ? "Saving…" : "Start practising"}
      </button>
    </form>
  );
}

const inputClass =
  "mt-1 w-full min-h-[44px] rounded-[4px] border border-rule bg-paper-raised px-3 py-2 text-ink";

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
      {children}
      {hint ? <span className="t-ui mt-1 block text-graphite">{hint}</span> : null}
    </label>
  );
}
