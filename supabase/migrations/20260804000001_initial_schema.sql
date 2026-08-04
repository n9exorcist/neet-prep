-- Initial schema: the question bank, students, and everything the planner reads.
-- Follows the data model in CLAUDE.md. Deviations are commented where they occur.

create extension if not exists "pgcrypto";

-- The exam has four papers of 45 questions each. "biology" is deliberately NOT a
-- value: the extraction pipeline used it as an umbrella for 162 questions, and
-- every one has to resolve to botany or zoology before import, because the
-- planner allocates hours per subject and cannot split an umbrella.
create type subject as enum ('physics', 'chemistry', 'botany', 'zoology');
create type difficulty as enum ('easy', 'medium', 'hard');
create type answer_option as enum ('a', 'b', 'c', 'd');
create type attempt_kind as enum ('diagnostic', 'topic', 'practice', 'mock');
create type school_type as enum ('government', 'private');


create table chapters (
  id uuid primary key default gen_random_uuid(),
  subject subject not null,
  name text not null,

  -- No source for this in the extracted data; the pipeline never captured it.
  -- Nullable so chapters can be seeded now and classified later.
  ncert_class smallint check (ncert_class in (11, 12)),

  -- Recomputed from the imported questions, never hand-edited.
  pyq_question_count integer not null default 0,

  -- An average across years, not a mark awarded to anyone, so this is the one
  -- place a non-integer is correct. Marks themselves stay integers everywhere.
  avg_marks_per_year numeric(6, 2) not null default 0,

  -- The planner's learnability coefficient: higher for factual and formula-driven
  -- chapters, lower for ones needing sustained conceptual work. 1.0 is a neutral
  -- placeholder - these MUST be set by hand before any plan is trusted, because
  -- marginal_return is directly proportional to this number.
  learnability numeric(4, 2) not null default 1.00 check (learnability > 0),

  created_at timestamptz not null default now(),

  unique (subject, name)
);

comment on column chapters.learnability is
  'Planner coefficient. Defaults to 1.00 which makes every chapter equally learnable - that is a placeholder, not a judgement.';


create table questions (
  id uuid primary key default gen_random_uuid(),
  year smallint not null check (year between 2000 and 2100),

  -- 1-180 for most papers, 1-200 for 2021-2024 when Section B was optional.
  question_number smallint not null check (question_number between 1 and 200),

  subject subject not null,
  chapter_id uuid references chapters (id) on delete restrict,
  topic text,

  question_md text not null check (length(btrim(question_md)) > 0),

  -- {"a": "...", "b": "...", "c": "...", "d": "..."}, all four required.
  options jsonb not null check (
    options ? 'a' and options ? 'b' and options ? 'c' and options ? 'd'
  ),

  -- A single letter. Two questions in the 2015-2025 bank print "answer (c) or
  -- (d)"; they are rejected at review rather than modelled, because supporting
  -- two accepted answers would change grading, mastery and the review UI for
  -- 2 questions in 2058.
  answer answer_option not null,

  difficulty difficulty not null default 'medium',

  figure_url text,

  -- Describes the figure without revealing the answer. Required by docs/DESIGN.md
  -- and enforced below: a figure question without a description is not shippable.
  alt_text text,

  -- Section B questions were optional in the exam, so they should not carry the
  -- same weight as compulsory ones when the planner counts PYQ frequency.
  is_section_b boolean not null default false,

  -- Nothing is shown to a student until a human has verified it.
  reviewed boolean not null default false,

  source_page smallint,
  created_at timestamptz not null default now(),

  unique (year, question_number),

  -- Text alone is unanswerable for a diagram question, and an undescribed image
  -- is unusable with a screen reader. Both halves must be present or neither.
  constraint figure_needs_alt_text check (
    figure_url is null or length(btrim(coalesce(alt_text, ''))) > 0
  )
);

create index questions_chapter_idx on questions (chapter_id);
create index questions_reviewed_idx on questions (reviewed) where reviewed;
create index questions_subject_year_idx on questions (subject, year);


-- Students are minors. Collect the minimum: no phone number, no address, no
-- photograph. Do not add such columns later without a hard reason.
create table students (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  target_score smallint not null check (target_score between 0 and 720),
  exam_date date not null,
  quota_category text,
  school_type school_type,
  created_at timestamptz not null default now()
);


create table attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  kind attempt_kind not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index attempts_student_idx on attempts (student_id, started_at desc);


create table responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts (id) on delete cascade,
  question_id uuid not null references questions (id) on delete restrict,
  selected answer_option,          -- null means the student left it unattempted
  is_correct boolean not null,
  seconds_taken integer check (seconds_taken >= 0),
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index responses_attempt_idx on responses (attempt_id);


create table mastery (
  student_id uuid not null references students (id) on delete cascade,
  chapter_id uuid not null references chapters (id) on delete cascade,
  theta numeric(6, 3) not null default 0,
  accuracy numeric(5, 4) not null default 0 check (accuracy between 0 and 1),
  questions_seen integer not null default 0 check (questions_seen >= 0),
  updated_at timestamptz not null default now(),
  primary key (student_id, chapter_id)
);


create table plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students (id) on delete cascade,
  target_score smallint not null check (target_score between 0 and 720),
  generated_at timestamptz not null default now(),
  -- chapter_id -> {hours, projected_gain, rank}
  allocations jsonb not null
);

create index plans_student_idx on plans (student_id, generated_at desc);
