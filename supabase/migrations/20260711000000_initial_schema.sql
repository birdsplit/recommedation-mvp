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
  check (installation_service not in ('paid','included') or assembly_service_available)
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
