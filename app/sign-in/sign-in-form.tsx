"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/practice";

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    const supabase = createClient();
    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setBusy(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    // With email confirmation switched on, sign-up returns no session and the
    // student has to confirm first. Say so rather than silently doing nothing.
    if (mode === "sign-up" && !result.data.session) {
      setNotice("Check your email to confirm the account, then sign in.");
      setMode("sign-in");
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
      <label className="block">
        <span className="t-label block text-graphite">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="t-label block text-graphite">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          minLength={8}
          required
          className={inputClass}
        />
        {mode === "sign-up" ? (
          <span className="t-ui mt-1 block text-graphite">At least 8 characters.</span>
        ) : null}
      </label>

      {error ? (
        <p role="alert" className="t-ui text-incorrect">
          <span aria-hidden="true">✕ </span>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="t-ui text-ink">
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="t-ui min-h-[44px] rounded-[4px] border border-ink bg-ink px-5 text-[var(--paper)] disabled:opacity-50"
      >
        {busy ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setError(null);
          setNotice(null);
        }}
        className="t-ui min-h-[44px] text-graphite underline underline-offset-4 hover:text-ink"
      >
        {mode === "sign-in" ? "Create an account instead" : "I already have an account"}
      </button>
    </form>
  );
}

const inputClass =
  "mt-1 w-full min-h-[44px] rounded-[4px] border border-rule bg-paper-raised px-3 py-2 text-ink";
