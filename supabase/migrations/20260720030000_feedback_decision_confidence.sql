-- Decision-confidence feedback item and per-arm feedback aggregation.

alter table feedback
  add column q_decision_confidence integer
    check (q_decision_confidence between 1 and 5);

-- Compare the two experiment arms on the feedback survey. Feedback joins to its
-- recommendation run, so rows with a null run_id (unlinked feedback) are excluded.
create or replace function admin_cohort_feedback()
returns table (
  mode text,
  feedback_count bigint,
  avg_confidence numeric,
  avg_time_saved numeric,
  avg_conditions numeric,
  avg_reasons numeric,
  found_rate numeric,
  reuse_rate numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    runs.mode,
    count(*)::bigint,
    avg(feedback.q_decision_confidence),
    avg(feedback.q_time_saved),
    avg(feedback.q_conditions_reflected),
    avg(feedback.q_reasons_helpful),
    avg((feedback.q_found_candidate)::int),
    avg((feedback.q_would_reuse)::int)
  from feedback
  join recommendation_runs runs on runs.id = feedback.run_id
  group by runs.mode
$$;

grant execute on function admin_cohort_feedback() to service_role;
revoke all on function admin_cohort_feedback() from anon, authenticated;
