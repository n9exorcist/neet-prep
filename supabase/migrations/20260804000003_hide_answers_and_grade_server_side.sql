-- Stop the answer key being readable by the student it is being asked of.
--
-- The questions_read_reviewed policy lets any signed-in student select from
-- questions, and "answer" is one of its columns. Anyone who opened developer
-- tools could query the anon endpoint and read the key before answering. RLS
-- controls which ROWS are visible; it does not control which COLUMNS, so the
-- fix is a column grant plus a function that grades without handing the key out.

revoke select on public.questions from authenticated;

grant select (
  id, year, question_number, subject, chapter_id, topic,
  question_md, options, difficulty, figure_url, alt_text,
  is_section_b, reviewed, source_page, created_at
) on public.questions to authenticated;


-- Grades one answer and records it, without ever returning the key.
--
-- SECURITY DEFINER because the caller deliberately cannot read questions.answer.
-- It therefore has to verify ownership itself: the attempt must belong to the
-- calling user, or a student could write responses into someone else's attempt.
create or replace function public.submit_response(
  p_attempt_id uuid,
  p_question_id uuid,
  p_selected answer_option,
  p_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_answer answer_option;
  v_correct boolean;
begin
  select student_id into v_owner from attempts where id = p_attempt_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'attempt does not belong to the current user';
  end if;

  -- Only reviewed questions can be practised, matching what the student can see.
  select answer into v_answer from questions
   where id = p_question_id and reviewed = true;
  if v_answer is null then
    raise exception 'question not available';
  end if;

  v_correct := (p_selected is not null and p_selected = v_answer);

  insert into responses (attempt_id, question_id, selected, is_correct, seconds_taken)
  values (p_attempt_id, p_question_id, p_selected, v_correct, p_seconds)
  on conflict (attempt_id, question_id) do update
    set selected = excluded.selected,
        is_correct = excluded.is_correct,
        seconds_taken = excluded.seconds_taken;

  return v_correct;
end;
$$;

revoke all on function public.submit_response(uuid, uuid, answer_option, integer) from public;
grant execute on function public.submit_response(uuid, uuid, answer_option, integer) to authenticated;


-- After answering, the student is entitled to see the right answer. Same
-- reasoning: released deliberately, one question at a time, only once a response
-- for that question already exists.
create or replace function public.reveal_answer(p_question_id uuid)
returns answer_option
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer answer_option;
begin
  if not exists (
    select 1 from responses r
      join attempts a on a.id = r.attempt_id
     where r.question_id = p_question_id
       and a.student_id = auth.uid()
  ) then
    raise exception 'answer not available until the question has been attempted';
  end if;

  select answer into v_answer from questions where id = p_question_id;
  return v_answer;
end;
$$;

revoke all on function public.reveal_answer(uuid) from public;
grant execute on function public.reveal_answer(uuid) to authenticated;
