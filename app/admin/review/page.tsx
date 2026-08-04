import Link from "next/link";

import { chaptersForDatalist, loadCanonicalChapters } from "@/lib/review/chapters";
import {
  buildQueue,
  computeStats,
  getFigureMeta,
  loadRows,
  unmappedCount,
} from "@/lib/review/store";

import { ReviewClient } from "./review-client";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined;

  const [rows, canon] = await Promise.all([loadRows(), loadCanonicalChapters()]);
  const stats = computeStats(rows);
  const queue = buildQueue(rows, year);
  const current = queue[0] ?? null;
  const chapters = chaptersForDatalist(canon);
  const unmapped = unmappedCount(rows);
  const figureMeta =
    current?.figure_path ? await getFigureMeta(current.year, current.figure_path) : null;

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h1 className="t-h2">Question review</h1>
          <p className="t-data text-graphite">
            <span className="text-ink">{stats.approved}</span>
            <span aria-hidden="true"> / </span>
            <span className="sr-only">approved of</span>
            {stats.total}
            <span className="t-label ml-2 normal-case tracking-normal">approved</span>
          </p>
        </div>

        <p className="t-ui mt-2 text-graphite">
          {stats.pending} pending
          {stats.skipped > 0 ? `, ${stats.skipped} skipped for later` : ""}
          {stats.rejected > 0 ? `, ${stats.rejected} rejected` : ""}. Nothing reaches a
          student until it is approved here.
          {unmapped > 0 ? (
            <>
              {" "}
              <span className="text-ink">
                {unmapped} still need a chapter the map could not place
              </span>
              ; they are sorted to the front.
            </>
          ) : null}
        </p>

        <nav aria-label="Filter by year" className="mt-4 flex flex-wrap gap-2">
          <YearChip href="/admin/review" label="All" active={year === undefined} />
          {stats.byYear.map((y) => (
            <YearChip
              key={y.year}
              href={`/admin/review?year=${y.year}`}
              label={`${y.year}`}
              detail={`${y.done}/${y.total}`}
              active={year === y.year}
            />
          ))}
        </nav>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="No extracted questions yet"
          body="Run the extraction pipeline first — pipeline/extract_pyq.py writes data/extracted/<year>/questions.jsonl, which this page reads."
        />
      ) : current === null ? (
        <EmptyState
          title={year ? `Nothing left in ${year}` : "Everything has been reviewed"}
          body={
            stats.skipped > 0
              ? "Skipped questions stay in the queue — clear the year filter to come back to them."
              : "Every extracted question has been approved or rejected."
          }
        />
      ) : (
        <ReviewClient
          key={current.id}
          row={current}
          remaining={queue.length}
          chapters={chapters}
          figureMeta={figureMeta}
        />
      )}
    </main>
  );
}

function YearChip({
  href,
  label,
  detail,
  active,
}: {
  href: string;
  label: string;
  detail?: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`t-ui inline-flex min-h-[44px] items-center gap-2 rounded-[4px] border px-3 ${
        active
          ? "border-ink bg-paper-raised text-ink"
          : "border-rule text-graphite hover:border-ink hover:text-ink"
      }`}
    >
      <span className="t-data text-[0.9375rem]">{label}</span>
      {detail ? <span className="t-data text-[0.8125rem] text-graphite">{detail}</span> : null}
    </Link>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-[4px] border border-rule bg-paper-raised p-8 text-center"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <h2 className="t-h3">{title}</h2>
      <p className="t-ui mx-auto mt-2 max-w-[46ch] text-graphite">{body}</p>
    </div>
  );
}
