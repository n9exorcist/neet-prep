import Link from "next/link";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "NEET Prep — a study plan built around your target score",
  description:
    "Which chapters return the most marks per hour of study, and which to skip. Free for Tamil Nadu government school students.",
};

/**
 * The marketing surface. Reads nothing about the question bank - it lives behind
 * row level security, so a signed-out visitor would only ever see zeros - but it
 * does check for a session, so a returning student lands on a button that
 * continues rather than one that asks them to sign up again.
 */
export default async function Home() {
  let signedIn = false;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      signedIn = Boolean(user);
    } catch {
      // Misconfigured environment should not take the front page down.
    }
  }

  return (
    <div className="marketing relative flex-1">
      <div className="marketing-bg" aria-hidden="true" />

      <main className="mx-auto w-full max-w-[900px] px-5 py-14 sm:px-8 sm:py-20">
        <section className="max-w-[38ch]">
          <p className="t-label rise text-graphite">Built for a target, not for 720</p>
          <h1 className="t-display rise mt-3" style={{ "--delay": "70ms" } as React.CSSProperties}>
            Study what actually earns you marks.
          </h1>
          <p
            className="t-body rise mt-5 max-w-[52ch] text-graphite"
            style={{ "--delay": "140ms" } as React.CSSProperties}
          >
            Most preparation aims at a perfect score. This asks a different question: given
            where you are now and the score you actually need, which chapters return the
            most marks per hour — and which are not worth your time?
          </p>

          <div
            className="rise mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
            style={{ "--delay": "210ms" } as React.CSSProperties}
          >
            {signedIn ? (
              <Link href="/practice" className={primaryCta}>
                Continue practising
              </Link>
            ) : (
              <>
                <Link href="/sign-in?mode=sign-up" className={primaryCta}>
                  Create a free account
                </Link>
                <Link href="/sign-in" className={secondaryCta}>
                  I already have an account
                </Link>
              </>
            )}
          </div>
        </section>

        <section className="mt-16 sm:mt-20">
          <h2 className="t-label text-graphite">How it works</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            <Step n={1} delay={60} title="Take a diagnostic">
              Questions across Physics, Chemistry, Botany and Zoology, weighted by how
              often each chapter actually appears in the paper.
            </Step>
            <Step n={2} delay={130} title="See where the marks are">
              Not one number out of 720, but a per-chapter picture of what you already
              have and what is still available to you.
            </Step>
            <Step n={3} delay={200} title="Get a plan for your target">
              Chapters ranked by marks gained per hour — including an honest list of what
              to leave alone.
            </Step>
          </ol>
        </section>

        <section
          className="glass lift rise mt-12 rounded-[4px] p-6 sm:mt-16 sm:p-8"
          style={{ "--delay": "120ms" } as React.CSSProperties}
        >
          <h2 className="t-h3">Free for Tamil Nadu government school students</h2>
          <p className="t-body mt-3 max-w-[58ch] text-graphite">
            With the 7.5% government school quota, a score near 550 is often enough for a
            government MBBS seat. Aiming at 720 wastes time you do not have. Government
            school accounts are free, permanently, with no paywall anywhere in that path.
          </p>
        </section>

        <p className="t-ui mt-12 max-w-[58ch] text-graphite">
          Every question comes from a past NEET paper and is checked by a person before any
          student sees it.
        </p>

        {process.env.NODE_ENV !== "production" ? (
          <nav className="mt-8">
            <Link
              href="/admin/review"
              className="t-ui text-graphite underline underline-offset-4 hover:text-ink"
            >
              Review questions — local only
            </Link>
          </nav>
        ) : null}
      </main>
    </div>
  );
}

const primaryCta =
  "t-ui lift inline-flex min-h-[48px] items-center justify-center rounded-[4px] border border-ink bg-ink px-6 text-[var(--paper)]";

const secondaryCta =
  "t-ui lift inline-flex min-h-[48px] items-center justify-center rounded-[4px] border border-rule bg-[var(--paper-raised)] px-6 text-ink";

function Step({
  n,
  title,
  delay,
  children,
}: {
  n: number;
  title: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <li
      className="glass lift rise rounded-[4px] p-5"
      style={{ "--delay": `${delay}ms` } as React.CSSProperties}
    >
      <span className="t-data text-graphite" aria-hidden="true">
        {String(n).padStart(2, "0")}
      </span>
      <h3 className="t-h3 mt-3">{title}</h3>
      <p className="t-body mt-2 text-graphite">{children}</p>
    </li>
  );
}
