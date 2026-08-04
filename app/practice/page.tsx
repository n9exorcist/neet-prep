import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { figureUrl } from "@/lib/supabase/storage";

import { startAttempt } from "./actions";
import { PracticeClient, type PracticeQuestion } from "./practice-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Practice — NEET Prep" };

export default async function PracticePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/practice");

  const { data: student } = await supabase
    .from("students")
    .select("name, target_score")
    .eq("id", user.id)
    .maybeSingle();
  if (!student) redirect("/onboarding");

  // No filter on `reviewed` here: the questions_read_reviewed policy already
  // makes unreviewed rows invisible, and `answer` is not a readable column.
  const { data: questions, error } = await supabase
    .from("questions")
    .select("id, year, question_number, subject, topic, question_md, options, difficulty, figure_url, alt_text, chapters(name)")
    .order("year", { ascending: false })
    .order("question_number")
    .limit(50);

  if (error) {
    return (
      <Shell name={student.name}>
        <Empty title="Could not load questions" body={error.message} />
      </Shell>
    );
  }

  if (!questions?.length) {
    return (
      <Shell name={student.name}>
        <Empty
          title="No questions yet"
          body="Questions appear here once they have been checked by a person. Nothing unverified is ever shown to a student."
        />
      </Shell>
    );
  }

  const attempt = await startAttempt();
  if ("error" in attempt) {
    return (
      <Shell name={student.name}>
        <Empty title="Could not start a practice session" body={attempt.error} />
      </Shell>
    );
  }

  const prepared: PracticeQuestion[] = questions.map((q) => ({
    id: q.id as string,
    year: q.year as number,
    number: q.question_number as number,
    subject: q.subject as string,
    // PostgREST types an embedded relation as an array even when it is to-one.
    chapter: toChapterName(q.chapters),
    topic: (q.topic as string | null) ?? null,
    questionMd: q.question_md as string,
    options: q.options as Record<string, string>,
    difficulty: (q.difficulty as string | null) ?? "medium",
    figure: figureUrl(q.figure_url as string | null),
    altText: (q.alt_text as string | null) ?? null,
  }));

  return (
    <Shell name={student.name} target={student.target_score as number}>
      <PracticeClient attemptId={attempt.id} questions={prepared} />
    </Shell>
  );
}

function toChapterName(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  const name = (row as { name?: unknown } | null)?.name;
  return typeof name === "string" ? name : null;
}

function Shell({
  name,
  target,
  children,
}: {
  name: string;
  target?: number;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="t-h2">Practice</h1>
        <p className="t-ui text-graphite">
          {name}
          {target ? (
            <>
              {" · target "}
              <span className="t-data text-ink">{target}</span>
            </>
          ) : null}
        </p>
      </header>
      {children}
      <p className="mt-8">
        <Link href="/" className="t-ui text-graphite underline underline-offset-4 hover:text-ink">
          Home
        </Link>
      </p>
    </main>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
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
