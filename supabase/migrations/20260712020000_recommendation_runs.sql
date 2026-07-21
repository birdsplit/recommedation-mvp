-- Reproducible recommendation runs and journey-based measurement.

create table recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null,
  session_id uuid not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  algorithm_version text not null check (algorithm_version ~ '[^[:space:]]'),
  catalog_release_id uuid not null references catalog_releases(id) on delete restrict,
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot) = 'object'),
  candidate_count int not null check (candidate_count between 0 and 3),
  study_code text,
  created_at timestamptz not null default now()
);

create index recommendation_runs_journey_idx
  on recommendation_runs (journey_id, created_at desc);
create index recommendation_runs_catalog_idx
  on recommendation_runs (catalog_release_id, created_at desc);

alter table events
  add column journey_id uuid,
  add column run_id uuid references recommendation_runs(id) on delete set null,
  add column event_version smallint not null default 1 check (event_version > 0),
  add column cohort text,
  add column is_test boolean not null default false;

alter table events drop constraint if exists events_event_type_check;
alter table events add constraint events_event_type_check
  check (event_type in (
    'visit','start_click','question_answer','questions_complete',
    'summary_view','results_view','product_detail_view','compare_add',
    'cost_check','outbound_click','source_open','feedback_submit',
    'post_purchase_submit'
  ));

update events set journey_id = session_id where journey_id is null;
alter table events
  alter column journey_id set not null,
  alter column event_version set default 2;

create index events_journey_created_idx on events (journey_id, created_at);
create index events_run_created_idx on events (run_id, created_at) where run_id is not null;
create index events_analysis_idx
  on events (event_type, is_test, created_at, journey_id);

alter table feedback
  add column journey_id uuid,
  add column run_id uuid references recommendation_runs(id) on delete set null;

update feedback set journey_id = session_id where journey_id is null;
alter table feedback alter column journey_id set not null;

alter table feedback drop constraint if exists feedback_session_id_key;
alter table feedback add constraint feedback_run_id_key unique (run_id);
create index feedback_journey_idx on feedback (journey_id, created_at desc);

alter table recommendation_runs enable row level security;
grant all on table recommendation_runs to service_role;
revoke all on table recommendation_runs from anon, authenticated;

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
      or events.payload @> '{"entry":"questions"}'::jsonb
    )
  group by events.event_type
$$;

grant execute on function admin_journey_event_counts() to service_role;
revoke all on function admin_journey_event_counts() from anon, authenticated;
