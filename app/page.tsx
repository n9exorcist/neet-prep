import Link from "next/link";

export const metadata = {
  title: "NEET Prep",
  description: "An adaptive NEET study plan built around your target score.",
};

/**
 * Deliberately reads nothing. The question bank lives in Supabase behind row
 * level security, and the review tool reads local files that are not deployed,
 * so a landing page querying either would render zeros to a signed-out visitor.
 * Saying nothing is better than saying "0 questions".
 */
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-12 sm:px-6 sm:py-20">
      <h1 className="t-h1">NEET Prep</h1>

      <p className="t-body mt-4 max-w-[60ch]">
        Most preparation aims at 720 out of 720. This asks a different question: given
        where you are now and the score you actually need, which chapters return the most
        marks per hour of study — and which are not worth your time?
      </p>

      <section className="mt-10">
        <h2 className="t-label text-graphite">How it works</h2>
        <ol className="mt-4 flex flex-col gap-5">
          <Step n={1} title="Take a diagnostic">
            Questions across Physics, Chemistry, Botany and Zoology, drawn from past
            papers and weighted by how often each chapter actually appears.
          </Step>
          <Step n={2} title="See where the marks are">
            Not one score out of 720, but a per-chapter picture of what you already have
            and what is still available to you.
          </Step>
          <Step n={3} title="Get a plan for your target">
            Chapters ranked by marks gained per hour, allocated until the plan reaches
            your target — including an honest list of what to leave alone.
          </Step>
        </ol>
      </section>

      <section className="mt-12 rounded-[4px] border border-rule bg-paper-raised p-5">
        <h2 className="t-h3">Free for Tamil Nadu government school students</h2>
        <p className="t-body mt-2 max-w-[58ch] text-graphite">
          With the 7.5% government school quota, a score near 550 is often enough for a
          government MBBS seat. Aiming at 720 wastes time you do not have. Government
          school accounts are free, permanently, with no paywall anywhere in that path.
        </p>
      </section>

      <p className="t-ui mt-10 max-w-[58ch] text-graphite">
        Every question comes from a past NEET paper and is checked by a person before any
        student sees it.
      </p>

      {process.env.NODE_ENV !== "production" ? (
        <nav className="mt-8">
          <Link
            href="/admin/review"
            className="t-ui inline-flex min-h-[44px] items-center rounded-[4px] border border-rule px-4 text-graphite hover:border-ink hover:text-ink"
          >
            Review questions — local only
          </Link>
        </nav>
      ) : null}
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="t-data mt-1 shrink-0 text-graphite" aria-hidden="true">
        {n}
      </span>
      <span>
        <span className="t-h3 block">{title}</span>
        <span className="t-body mt-1 block max-w-[58ch] text-graphite">{children}</span>
      </span>
    </li>
  );
}
