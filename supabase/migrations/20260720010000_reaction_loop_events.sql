-- Reaction-loop (arm B) measurement events and cohort-aware funnel aggregation.

alter table events drop constraint if exists events_event_type_check;
alter table events add constraint events_event_type_check
  check (event_type in (
    'visit','start_click','question_answer','questions_complete',
    'summary_view','results_view','product_detail_view','compare_add',
    'cost_check','outbound_click','source_open','feedback_submit',
    'post_purchase_submit',
    'browse_view','candidate_reaction','criteria_prompt','criteria_confirm',
    'candidates_rerank','shortlist_finalize'
  ));

-- Widen the start_click funnel attribution so both the questions entry (arm A)
-- and the browse entry (arm B) count as a started journey.
create or replace function admin_journey_event_counts()
returns table (event_type text, journey_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select events.event_type, count(distinct events.journey_id)::bigint
  from events
  where events.is_test = false
    and (
      events.event_type <> 'start_click'
      or events.payload ->> 'entry' in ('questions','browse')
    )
  group by events.event_type
$$;

grant execute on function admin_journey_event_counts() to service_role;
revoke all on function admin_journey_event_counts() from anon, authenticated;

-- Per-cohort funnel counts (A/B arm split by events.cohort). Null cohort collapses
-- to the empty string so ungrouped traffic is still reported.
create or replace function admin_cohort_event_counts()
returns table (cohort text, event_type text, journey_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(events.cohort, ''), events.event_type,
    count(distinct events.journey_id)::bigint
  from events
  where events.is_test = false
  group by 1, 2
$$;

grant execute on function admin_cohort_event_counts() to service_role;
revoke all on function admin_cohort_event_counts() from anon, authenticated;
