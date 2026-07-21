-- Recommendation runs remember which experiment arm produced them and, for the
-- reaction loop (arm B), the criteria snapshot that shaped the ranking.

alter table recommendation_runs
  add column mode text not null default 'oneshot'
    constraint recommendation_runs_mode_check check (mode in ('oneshot','loop')),
  add column criteria jsonb;

create index recommendation_runs_mode_idx
  on recommendation_runs (mode, created_at desc);
