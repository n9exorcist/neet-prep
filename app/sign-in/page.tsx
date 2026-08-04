import Link from "next/link";

import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in — NEET Prep" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string }>;
}) {
  const { mode, next } = await searchParams;
  // Only accept an internal path, so ?next= cannot bounce anyone off-site.
  const safeNext = next && /^\/[^/\\]/.test(next) ? next : "/practice";

  return (
    <div className="marketing relative flex-1">
      <div className="marketing-bg" aria-hidden="true" />

      <main className="mx-auto w-full max-w-[440px] px-5 py-12 sm:py-20">
        <Link
          href="/"
          className="t-ui text-graphite underline underline-offset-4 hover:text-ink"
        >
          NEET Prep
        </Link>

        <div className="glass rise mt-6 rounded-[4px] p-6 sm:p-8">
          <h1 className="t-h2">Sign in</h1>
          <p className="t-ui mt-2 text-graphite">
            Your progress and your study plan are tied to this account.
          </p>

          <SignInForm
            initialMode={mode === "sign-up" ? "sign-up" : "sign-in"}
            next={safeNext}
          />
        </div>

        <p
          className="t-ui rise mt-6 text-graphite"
          style={{ "--delay": "120ms" } as React.CSSProperties}
        >
          We ask for an email, your target score and your exam date. Nothing else — no
          phone number, no address, no photograph.
        </p>
      </main>
    </div>
  );
}
