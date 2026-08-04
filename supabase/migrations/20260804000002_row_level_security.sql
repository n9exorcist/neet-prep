-- Row level security. All database access from the browser goes through these
-- policies; the service role key is used only by scripts/import.ts and must
-- never reach the client.

alter table chapters   enable row level security;
alter table questions  enable row level security;
alter table students   enable row level security;
alter table attempts   enable row level security;
alter table responses  enable row level security;
alter table mastery    enable row level security;
alter table plans      enable row level security;


-- Chapters are reference data: readable by any signed-in student, writable only
-- by the import script, which bypasses RLS with the service role.
create policy chapters_read on chapters
  for select to authenticated
  using (true);


-- The guardrail, enforced by the database rather than by remembering to filter.
-- An unreviewed question is invisible to every client, so a mistake in app code
-- cannot put an unverified answer key in front of a student.
create policy questions_read_reviewed on questions
  for select to authenticated
  using (reviewed = true);


create policy students_read_own on students
  for select to authenticated
  using (id = (select auth.uid()));

create policy students_insert_own on students
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy students_update_own on students
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));


create policy attempts_own on attempts
  for all to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));


-- Responses are reached through their attempt, so ownership is checked there.
create policy responses_own on responses
  for all to authenticated
  using (
    exists (
      select 1 from attempts a
      where a.id = responses.attempt_id
        and a.student_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from attempts a
      where a.id = responses.attempt_id
        and a.student_id = (select auth.uid())
    )
  );


create policy mastery_own on mastery
  for all to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));


create policy plans_own on plans
  for all to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));
