# Build Roadmap

Work top to bottom. Each phase ends with something you can actually use.
Do not start a phase until the previous one works.

The prompts below are meant to be pasted into Claude Code more or less as written.
Start each phase in a fresh session (`/clear`) so context stays clean.

---

## Phase 0 — Question bank (no app yet)

The asset. Everything else is worthless without it.

- [ ] Run `extract_pyq.py` on all 10 usable years (2020 file is corrupt — re-download it)
- [ ] Review every extracted question by hand against the paper
- [ ] Normalise chapter names against a single fixed NCERT chapter list
- [ ] Confirm every figure question has a usable cropped image

Target: ~1,800 verified questions. Expect this to take weeks, not days. It is the
only part of the project nobody else can do for you.

---

## Phase 1 — Database and import

> Set up a Supabase project with the schema in CLAUDE.md. Write the migration files,
> then write a Node script `scripts/import.ts` that reads the questions.jsonl files
> from the extraction pipeline, uploads figure images to Supabase Storage, and inserts
> rows. It should be idempotent — safe to run twice. Then seed the chapters table from
> the NCERT chapter list, computing pyq_question_count from the imported questions.

> Build a minimal admin page at /admin/review that shows one unreviewed question at a
> time with its rendered LaTeX and figure, and lets me fix the text, chapter tag, and
> answer, then mark it reviewed. Keyboard shortcuts for approve and skip.

Use that admin page for your Phase 0 review work. Building it early pays for itself.

---

## Phase 2 — Diagnostic and weakness report

> Build a 45-question diagnostic test that samples across all four subjects, weighted
> by chapter PYQ frequency, mixing difficulties. Store responses with time taken.
> Then build the results page: per-subject and per-chapter accuracy, a projected NEET
> score, and the five chapters with the most marks at stake. Charts, not tables.

This is the first thing your daughter uses. Sit next to her while she takes it and
watch where she hesitates — that is your best product feedback of the whole project.

---

## Phase 3 — Adaptive practice

> Implement per-chapter ability estimation. After each response, update the student's
> theta for that chapter using a simple Elo-style update, and record it in the mastery
> table. Then build a practice mode that picks the next question at a difficulty
> matched to current theta, biased toward chapters with low mastery and high PYQ
> weight. Show the correct answer and our own explanation after each question.

---

## Phase 4 — Target-score planner

The actual product. Read the planner section of CLAUDE.md first.

> Implement the target-score planner exactly as specified in CLAUDE.md. Given a
> student's mastery table, target score, and weeks remaining until the exam, produce a
> ranked chapter-by-chapter hour allocation with projected marks gained, and a clear
> list of chapters to deliberately skip. Render it as a weekly study plan. Recompute
> after every 200 answered questions.

Test it against real cases: a student at 320 wanting 550 with eight months. Does the
plan look sane to someone who knows the exam? Show it to a working NEET teacher before
you show it to a student.

---

## Phase 5 — Gamification

Only after the above works. Streaks, chapter mastery badges, marks-gained-this-week
as the headline number rather than questions-answered. Reward progress toward the
target, never raw volume.

---

## Phase 6 — Open it up

- Free accounts for government school students, verified by school code
- Teacher view: a班 class dashboard so a school teacher can see who is falling behind
- Tamil language support for the interface (questions stay in English — the exam is)

---

## Phase 7 — JEE

Same engine, different question bank and exam structure. Do not start until NEET has
real students and you know it works.

---

## How to work with Claude Code

- **One task per session.** Finish it, commit, `/clear`, start the next.
- **Use plan mode for anything non-trivial.** Shift+Tab twice. Read the plan before
  approving. This is where you catch bad decisions cheaply.
- **Commit after every working change.** `git commit -m "..."`. This is your undo
  button and you will need it.
- **Run it yourself before believing it works.** Claude Code reporting success and the
  feature actually working are two different claims.
- **Ask it to explain anything you do not understand.** You are the one maintaining
  this in two years. Code you cannot read is a liability, however fast it arrived.
- **Update CLAUDE.md when a decision changes.** It is the project's memory, not mine.
