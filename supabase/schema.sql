-- =============================================================
-- 모두의침대 MVP 스키마
-- Supabase SQL Editor에서 이 파일 전체를 실행한 뒤 seed.sql을 실행하세요.
--
-- 접근 모델: 모든 읽기/쓰기는 Next.js 서버 코드가 service_role 키로 수행.
-- RLS는 켜져 있고 정책이 없으므로 anon 키로는 아무것도 접근 불가.
-- =============================================================

-- ---------- 상품 (기획서 §10.1 객관 데이터 + §10.2 판단 데이터 + §8.2 상태) ----------
create table products (
  id uuid primary key default gen_random_uuid(),

  -- 객관 데이터 (§10.1)
  name text not null,
  seller_name text not null,
  seller_url text not null check (seller_url ~* '^https?://'),
  image_url text check (image_url is null or image_url ~* '^https?://'),
  price int not null check (price >= 0),                        -- 상품가 (원)
  shipping_fee int not null default 0 check (shipping_fee >= 0), -- 기본 배송비 (원)
  installation_service text not null default 'none'
    check (installation_service in ('none','paid','included','unknown')),
  installation_fee int check (installation_fee is null or installation_fee >= 0), -- 'paid'일 때 비용. null = 판매처 확인 필요
  mattress_included boolean not null default false,
  mattress_price int check (mattress_price is null or mattress_price >= 0), -- 미포함 시 별도 구매 예상가. null = 미확인
  delivery_days_min int not null check (delivery_days_min >= 0), -- 주문 후 달력일 기준
  delivery_days_max int not null check (delivery_days_max >= 0),
  scheduled_delivery boolean not null default false,  -- 지정일 배송 가능
  width_cm int check (width_cm is null or width_cm > 0),
  length_cm int check (length_cm is null or length_cm > 0),
  height_cm int check (height_cm is null or height_cm > 0),
  bed_size text not null default 'SS' check (bed_size = 'SS'),
  material text,
  storage_type text not null
    check (storage_type in ('lift_up','drawer','legs_open','closed_base','none')),
  under_bed_clearance_cm int check (under_bed_clearance_cm is null or under_bed_clearance_cm >= 0), -- 하부 높이
  has_outlet boolean not null default false,
  has_headboard boolean not null default false,
  colors text[] not null default '{}',

  -- 판단 데이터 (§10.2)
  storage_capacity text
    check (storage_capacity in ('large','medium','small','none')),
  dust_blocking text
    check (dust_blocking in ('high','medium','low')),
  cleaning_ease text
    check (cleaning_ease in ('easy','medium','hard')),
  robot_vacuum_fit text
    check (robot_vacuum_fit in ('ok','check_height','no')),
  carry_difficulty text
    check (carry_difficulty in ('easy','medium','hard')),
  carry_service_available boolean not null default false,   -- 집 안까지 운반 서비스 제공
  self_assembly text
    check (self_assembly in ('easy','medium','hard','not_possible')),
  assembly_service_available boolean not null default false,
  assembly_people int not null default 1 check (assembly_people >= 1), -- 권장 조립 인원
  assembly_tools text,                       -- 예: '육각렌치 동봉', '전동드릴 권장'
  disassembly_ease text
    check (disassembly_ease in ('easy','medium','hard')),
  review_risks text[] not null default '{}'
    check (review_risks <@ array[
      'squeak','wobble','smell','assembly_hard','manual_poor',
      'missing_parts','delivery_delay','finish_poor','drawer_awkward','extra_cost'
    ]::text[]),                               -- constants.ts REVIEW_RISKS 슬러그 10종
  recommended_for text,                      -- 추천 대상 한 줄
  not_recommended_for text,                  -- 비추천 대상 한 줄

  -- 신뢰 표시 (§7.3) + 상태 (§8.2)
  data_confidence text not null default 'estimated'
    check (data_confidence in ('confirmed','estimated')),
  source_note text,                          -- 정보 출처 (예: '공식몰 상세페이지')
  last_verified_at date not null,
  status text not null default 'hidden'
    check (status in ('public','hidden','sold_out','needs_check')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (delivery_days_min <= delivery_days_max),
  check (self_assembly is distinct from 'not_possible' or assembly_service_available),
  check (installation_service not in ('paid','included') or assembly_service_available),
  constraint products_public_source_note_check
    check (
      status <> 'public'
      or (source_note is not null and source_note ~ '[^[:space:]]')
    )
);

-- ---------- 이벤트 (기획서 §11.1의 12종과 1:1) ----------
create table events (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  event_type text not null
    check (event_type in (
      'visit','start_click','question_answer','questions_complete',
      'summary_view','results_view','product_detail_view','compare_add',
      'cost_check','outbound_click','feedback_submit','post_purchase_submit'
    )),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index events_type_created_idx on events (event_type, created_at);
create index events_session_idx on events (session_id);

-- ---------- 결과 피드백 (기획서 화면11) ----------
create table feedback (
  id bigint generated always as identity primary key,
  session_id uuid not null unique,
  q_time_saved int check (q_time_saved between 1 and 5),           -- 후보 정하는 시간 단축
  q_conditions_reflected int check (q_conditions_reflected between 1 and 5), -- 조건 반영
  q_reasons_helpful int check (q_reasons_helpful between 1 and 5), -- 이유가 도움
  q_found_candidate boolean,                 -- 실제 고려할 상품 발견
  q_would_reuse boolean,                     -- 다른 가구도 재사용 의향
  q_worst_question text,                     -- 가장 불필요/피곤했던 질문
  chosen_product_id uuid references products(id),
  post_purchase_optin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- RLS: 전부 켜고 정책 없음 (service_role만 통과) ----------
alter table products enable row level security;
alter table events enable row level security;
alter table feedback enable row level security;

-- service_role 서버만 명시적으로 접근. anon/authenticated는 RLS 정책도 없고 권한도 없다.
grant usage on schema public to service_role;
grant all on table products, events, feedback to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on table products, events, feedback from anon, authenticated;

-- ---------- updated_at 자동 갱신 ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- =============================================================
-- 참고용 점검 쿼리 (실행 불필요)
--
-- 퍼널: select event_type, count(*) as cnt, count(distinct session_id) as sessions
--       from events group by event_type;
-- 피드백 평균: select avg(q_time_saved), avg(q_conditions_reflected), avg(q_reasons_helpful)
--       from feedback;
-- 오래된 상품: select name, last_verified_at from products
--       where last_verified_at < current_date - 14;
-- =============================================================

-- Real-catalog identity, evidence, and immutable release snapshots.
-- Existing rows predate this contract and are demoted from public until they
-- are re-imported and explicitly released through the catalog workflow.

alter table products
  add column internal_key text,
  add column offer_id text,
  add column variant_key text,
  add column option_name text,
  add column availability text not null default 'unknown',
  add column source_url text,
  add column shipping_fee_confidence text not null default 'confirmed',
  add column unknown_fields text[] not null default '{}',
  add column commercial_verified_at date,
  add column spec_verified_at date;

alter table products
  alter column width_cm type numeric(7,2) using width_cm::numeric,
  alter column length_cm type numeric(7,2) using length_cm::numeric,
  alter column height_cm type numeric(7,2) using height_cm::numeric,
  alter column under_bed_clearance_cm type numeric(7,2)
    using under_bed_clearance_cm::numeric,
  drop constraint if exists products_bed_size_check,
  add constraint products_bed_size_nonempty_check
    check (bed_size ~ '[^[:space:]]');

update products
set
  internal_key = 'legacy:' || id::text,
  offer_id = id::text,
  variant_key = 'default',
  option_name = bed_size,
  source_url = seller_url,
  commercial_verified_at = last_verified_at,
  spec_verified_at = last_verified_at,
  status = case when status = 'public' then 'hidden' else status end;

alter table products
  alter column internal_key set not null,
  alter column offer_id set not null,
  alter column variant_key set not null,
  alter column option_name set not null,
  alter column source_url set not null,
  alter column commercial_verified_at set not null,
  alter column spec_verified_at set not null,
  add constraint products_internal_key_nonempty_check
    check (internal_key ~ '[^[:space:]]'),
  add constraint products_offer_id_nonempty_check
    check (offer_id ~ '[^[:space:]]'),
  add constraint products_variant_key_nonempty_check
    check (variant_key ~ '[^[:space:]]'),
  add constraint products_option_name_nonempty_check
    check (option_name ~ '[^[:space:]]'),
  add constraint products_availability_check
    check (availability in ('in_stock','out_of_stock','preorder','unknown')),
  add constraint products_source_url_check
    check (source_url ~* '^https?://'),
  add constraint products_shipping_fee_confidence_check
    check (shipping_fee_confidence in ('confirmed','estimated','unknown')),
  add constraint products_unknown_fields_check
    check (unknown_fields <@ array[
      'mattress_included','scheduled_delivery','has_outlet','has_headboard',
      'carry_service_available','assembly_service_available',
      'delivery_days_min','delivery_days_max','storage_type','assembly_people'
    ]::text[]),
  add constraint products_public_catalog_ready_check
    check (
      status <> 'public'
      or (
        availability = 'in_stock'
        and seller_url ~* '^https://'
        and source_url ~* '^https://'
        and seller_url !~* '^https://(localhost|127[.]0[.]0[.]1|([^/]+[.])?example[.](com|org|net)|[^/]+[.]invalid)([:/]|$)'
        and source_url !~* '^https://(localhost|127[.]0[.]0[.]1|([^/]+[.])?example[.](com|org|net)|[^/]+[.]invalid)([:/]|$)'
      )
    );

alter table products
  add constraint products_internal_key_key unique (internal_key),
  add constraint products_offer_variant_key unique (seller_name, offer_id, variant_key);

create table product_evidence (
  id bigint generated always as identity primary key,
  product_id uuid not null references products(id) on delete cascade,
  field_group text not null
    check (field_group in ('identity','commercial','delivery','spec','review','policy','catalog')),
  field_names text[] not null check (cardinality(field_names) > 0),
  source_url text not null check (source_url ~* '^https?://'),
  observed_value jsonb not null default '{}',
  confidence text not null
    check (confidence in ('confirmed','estimated','unknown')),
  verified_at date not null,
  verified_by text not null check (verified_by ~ '[^[:space:]]'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, field_group, source_url)
);

create index product_evidence_product_idx on product_evidence (product_id);
create index product_evidence_verified_idx on product_evidence (verified_at);

create trigger product_evidence_updated_at
  before update on product_evidence
  for each row execute function set_updated_at();

create table catalog_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (version ~ '[^[:space:]]'),
  data_hash text not null unique check (data_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft'
    check (status in ('draft','published','retired')),
  product_count int not null check (product_count > 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null) or status = 'retired')
);

create unique index catalog_releases_one_published_idx
  on catalog_releases ((status)) where status = 'published';

create table catalog_release_products (
  release_id uuid not null references catalog_releases(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  position int not null check (position > 0),
  product_snapshot jsonb not null check (jsonb_typeof(product_snapshot) = 'object'),
  primary key (release_id, product_id),
  unique (release_id, position)
);

create index catalog_release_products_product_idx
  on catalog_release_products (product_id);

create or replace function guard_catalog_release_items()
returns trigger language plpgsql as $$
declare
  target_release_id uuid;
begin
  target_release_id := case when tg_op = 'DELETE' then old.release_id else new.release_id end;
  if exists (
    select 1 from catalog_releases
    where id = target_release_id and status <> 'draft'
  ) then
    raise exception 'Published or retired catalog release items are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger catalog_release_items_immutable
  before insert or update or delete on catalog_release_products
  for each row execute function guard_catalog_release_items();

create or replace function publish_catalog_release(p_release_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  target catalog_releases%rowtype;
  actual_count int;
begin
  lock table catalog_releases in share row exclusive mode;
  select * into target from catalog_releases where id = p_release_id for update;
  if not found then
    raise exception 'Catalog release not found';
  end if;
  if target.status = 'published' then
    return;
  end if;
  if target.status <> 'draft' then
    raise exception 'Only a draft catalog release can be published';
  end if;

  select count(*) into actual_count
  from catalog_release_products where release_id = p_release_id;
  if actual_count <> target.product_count then
    raise exception 'Catalog release product count mismatch: expected %, got %',
      target.product_count, actual_count;
  end if;
  if exists (
    select 1 from catalog_release_products
    where release_id = p_release_id
      and (
        product_snapshot ->> 'status' <> 'public'
        or product_snapshot ->> 'availability' <> 'in_stock'
      )
  ) then
    raise exception 'Catalog release contains an ineligible product snapshot';
  end if;

  update catalog_releases
  set status = 'retired'
  where status = 'published' and id <> p_release_id;

  update catalog_releases
  set status = 'published', published_at = now()
  where id = p_release_id;
end $$;

alter table product_evidence enable row level security;
alter table catalog_releases enable row level security;
alter table catalog_release_products enable row level security;

grant all on table product_evidence, catalog_releases, catalog_release_products to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function publish_catalog_release(uuid) to service_role;
revoke all on table product_evidence, catalog_releases, catalog_release_products
  from anon, authenticated;

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

-- Consumer-protection policies, review sampling, and release approval records.

alter table products
  add column return_policy_summary text,
  add column damage_process_summary text,
  add column warranty_summary text,
  add column review_sample_count int not null default 0,
  add column review_risk_counts jsonb not null default '{}',
  add column review_verified_at date,
  add column review_rechecked_count int not null default 0,
  add constraint products_review_sample_count_check
    check (review_sample_count between 0 and 10),
  add constraint products_review_rechecked_count_check
    check (review_rechecked_count between 0 and review_sample_count),
  add constraint products_review_risk_counts_object_check
    check (jsonb_typeof(review_risk_counts) = 'object'),
  add constraint products_public_mvp_bed_size_check
    check (status <> 'public' or bed_size = 'SS');

alter table catalog_releases
  add column approved_by text,
  add column warning_approval text,
  add constraint catalog_releases_approved_by_nonempty_check
    check (approved_by is null or approved_by ~ '[^[:space:]]'),
  add constraint catalog_releases_warning_approval_nonempty_check
    check (warning_approval is null or warning_approval ~ '[^[:space:]]');

delete from product_evidence older
using product_evidence newer
where older.product_id = newer.product_id
  and older.field_group = newer.field_group
  and (older.updated_at, older.id) < (newer.updated_at, newer.id);

alter table product_evidence
  drop constraint if exists product_evidence_product_id_field_group_source_url_key,
  add constraint product_evidence_product_field_group_key
    unique (product_id, field_group);

create or replace function guard_catalog_release_scope()
returns trigger language plpgsql as $$
begin
  if new.product_snapshot ->> 'status' = 'public'
     and new.product_snapshot ->> 'bed_size' <> 'SS' then
    raise exception 'Current MVP releases only allow SS products';
  end if;
  if coalesce((new.product_snapshot ->> 'review_sample_count')::int, 0) < 1 then
    raise exception 'Released products require a reviewed sample';
  end if;
  return new;
end $$;

create trigger catalog_release_scope_guard
  before insert or update on catalog_release_products
  for each row execute function guard_catalog_release_scope();

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

-- Recommendation runs remember which experiment arm produced them and, for the
-- reaction loop (arm B), the criteria snapshot that shaped the ranking.

alter table recommendation_runs
  add column mode text not null default 'oneshot'
    constraint recommendation_runs_mode_check check (mode in ('oneshot','loop')),
  add column criteria jsonb;

create index recommendation_runs_mode_idx
  on recommendation_runs (mode, created_at desc);

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
