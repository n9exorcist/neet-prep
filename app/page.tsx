import Link from "next/link";

import { computeStats, loadRows } from "@/lib/review/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stats = computeStats(await loadRows());

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="t-h1">NEET Prep</h1>
      <p className="t-body mt-3 max-w-[60ch] text-graphite">
        An adaptive study planner built around a target score rather than a perfect one.
      </p>

      <section className="mt-10">
        <h2 className="t-label text-graphite">Question bank</h2>
        <dl className="mt-3 grid grid-cols-3 gap-4">
          <Stat label="Extracted" value={stats.total} />
          <Stat label="Approved" value={stats.approved} />
          <Stat label="Pending" value={stats.pending} />
        </dl>
        <p className="t-ui mt-3 text-graphite">
          Questions stay hidden from students until a human has approved them.
        </p>
      </section>

      <nav className="mt-10">
        <Link
          href="/admin/review"
          className="t-ui inline-flex min-h-[44px] items-center rounded-[4px] border border-ink bg-ink px-5 text-[var(--paper)]"
        >
          Review questions
        </Link>
      </nav>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-[4px] border border-rule bg-paper-raised px-4 py-3"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <dt className="t-label text-graphite">{label}</dt>
      <dd className="t-data mt-2 text-[1.5rem]">{value}</dd>
    </div>
  );
}
