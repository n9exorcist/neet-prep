# NEET Prep Platform

## What this is

An adaptive NEET preparation platform built around **target scores, not perfect scores**.

Most NEET platforms optimise for 720/720. This one asks a different question: given
this student's current profile and a target of, say, 550, which chapters return the
most marks per hour of study? That planner is the core product. Everything else
supports it.

## Who it is for

1. Private students who want an honest, personalised study plan.
2. Tamil Nadu government school students, who receive it free. Many hold the 7.5%
   government-school quota on top of other reservations, so a score near 550 is
   often enough for a government MBBS seat. Aiming them at 720 wastes their time.

## Stack

- Next.js (App Router) + TypeScript
- Supabase: Postgres, Auth, Storage (question figure images)
- Tailwind CSS
- Vercel for deployment
- Python (separate `pipeline/` directory) for one-time PYQ extraction — not part of the app

## Exam structure

VERIFY the current NTA pattern before relying on these numbers; the format has changed
before and may change again.

- 180 questions, 720 marks, 3 hours
- +4 for correct, -1 for incorrect, 0 for unattempted
- Physics 45 / Chemistry 45 / Botany 45 / Zoology 45
- **Biology is 90 questions = 360 marks — half the paper.** For a 550 target this is
  the dominant lever. The planner must reflect this, not treat subjects as equal.

## Data model

Core tables. Migrations live in `supabase/migrations/`.

```
chapters
  id, subject, name, ncert_class, pyq_question_count, avg_marks_per_year

questions
  id, year, question_number, subject, chapter_id, topic,
  question_md          -- LaTeX inside $...$
  options              -- jsonb {a,b,c,d}
  answer               -- 'a'|'b'|'c'|'d'
  difficulty           -- easy|medium|hard
  figure_url           -- Supabase Storage path, null if none
  reviewed             -- boolean, false until a human has verified it
  source_page, created_at

students
  id (auth.users), name, target_score, exam_date, quota_category, school_type

attempts
  id, student_id, kind, started_at, completed_at
  -- kind: diagnostic | topic | practice | mock

responses
  id, attempt_id, question_id, selected, is_correct, seconds_taken

mastery
  student_id, chapter_id, theta, accuracy, questions_seen, updated_at
  -- theta = ability estimate, updated after each response

plans
  id, student_id, target_score, generated_at,
  allocations          -- jsonb: chapter_id -> {hours, projected_gain, rank}
```

## Planner logic

This is the intellectual core. Do not simplify it into "practise your weak topics".

For each chapter:
- `ceiling` = pyq_question_count x 4 (marks realistically available)
- `current` = projected marks from the student's `theta` for that chapter
- `headroom` = ceiling - current
- `marginal_return` = headroom x learnability / estimated_hours

`learnability` is higher for factual and formula-driven chapters (Biology recall,
inorganic chemistry, modern physics) and lower for chapters needing sustained
conceptual work (rotational mechanics, organic mechanisms). Store it per chapter.

Rank chapters by marginal_return, allocate study hours greedily until the projected
total reaches the target, then stop. **Explicitly tell the student which chapters to
skip.** That honesty is the product.

## Guardrails

- **Never generate question content that gets shown to a student without human review.**
  A wrong answer key given to someone with one attempt at a seat is a serious harm.
  New `questions` rows default to `reviewed = false` and stay hidden until flipped.
- **Do not republish the worked solutions from the source PDFs.** Those belong to the
  coaching companies that produced them (Vedantu, Aakash). The NTA questions can be
  used; their solutions cannot. Write our own.
- Questions with diagrams, graphs, circuits, or chemical structures MUST have a
  `figure_url`. Text alone makes them unanswerable. Never ship a figure question
  without its image.
- Students are minors. Collect the minimum: name, target, exam date, quota. No phone
  numbers, no addresses, no photographs.
- Government school accounts are free forever. Never put a paywall in that path.

## Conventions

- Server components by default; `"use client"` only where interaction requires it
- All database access through Supabase row-level security — no service key in the browser
- Money and marks as integers, never floats
- Dates as `date`, timestamps as `timestamptz`
- One migration file per schema change, never edit an applied migration

## Commands

```
npm run dev          # local dev server
npm run build        # production build, run before every deploy
npx supabase db push # apply migrations
npm run test         # vitest
```

## Working notes

The builder is an experienced banker, not a career programmer. Explain non-obvious
decisions in plain language. When there is a trade-off, state it and recommend one
option rather than listing five. Prefer boring, well-documented approaches over
clever ones.
