-- =============================================================
-- 모두의침대 MVP 시드 — 슈퍼싱글 침대 프레임 더미 10개
-- schema.sql 실행 후 이 파일을 실행하세요.
--
-- 실존 상품이 아닌 검증용 더미입니다 (seller_url은 example.com).
-- 구성 원칙: 수납 방식·가격대·배송일 구간을 고르게 분산,
-- "큰 짐 수납 + 이번 주 배송" 조합은 의도적으로 빈 결과가 나오게 설계(§7.5 검증용).
-- =============================================================

insert into products (
  name, seller_name, seller_url, image_url,
  price, shipping_fee, installation_service, installation_fee,
  mattress_included, mattress_price,
  delivery_days_min, delivery_days_max, scheduled_delivery,
  width_cm, length_cm, height_cm, bed_size, material,
  storage_type, under_bed_clearance_cm, has_outlet, has_headboard, colors,
  storage_capacity, dust_blocking, cleaning_ease, robot_vacuum_fit,
  carry_difficulty, carry_service_available,
  self_assembly, assembly_service_available, assembly_people, assembly_tools,
  disassembly_ease, review_risks, recommended_for, not_recommended_for,
  data_confidence, source_note, last_verified_at, status
) values

-- 1. 서랍 수납 · 총비용 20만 이하 · 빠른 배송 (디자인 시안의 대표 카드)
('루미 슈퍼싱글 서랍 수납침대', '오늘의가구', 'https://example.com/lumi-ss-drawer', null,
 159000, 30000, 'none', null,
 false, 89000,
 5, 7, false,
 115, 205, 32, 'SS', 'PB+LPM',
 'drawer', null, false, false, '{화이트,오크}',
 'medium', 'high', 'easy', 'no',
 'medium', false,
 'medium', false, 2, '십자드라이버 필요(미동봉)',
 'medium', '{assembly_hard}',
 '자잘한 짐이 많은 자취생', '이사가 잦거나 혼자 조립이 어려운 사람',
 'confirmed', '공식몰 상세페이지', '2026-07-08', 'public'),

-- 2. 리프트업 대형 수납 · 설치 포함 · 배송 2~3주
('스텔라 LED 리프트업 수납침대', '한샘몰', 'https://example.com/stella-liftup', null,
 299000, 0, 'included', null,
 false, 120000,
 14, 21, true,
 118, 208, 95, 'SS', 'PB+친환경 E0',
 'lift_up', null, true, true, '{화이트,그레이}',
 'large', 'high', 'easy', 'no',
 'hard', true,
 'not_possible', true, 2, '전문 기사 설치',
 'hard', '{smell}',
 '겨울 이불처럼 큰 짐을 통째로 넣고 싶은 사람', '2년 안에 이사할 가능성이 높은 사람',
 'confirmed', '공식몰 상세페이지', '2026-07-05', 'public'),

-- 3. 다리형 원목 · 로봇청소기 OK · 빠른 배송 · 혼자 조립 쉬움
('코지 원목 슈퍼싱글 침대 (하부 25cm)', '코지홈 스토어', 'https://example.com/cozy-wood', null,
 129000, 25000, 'none', null,
 false, 95000,
 3, 5, false,
 112, 203, 28, 'SS', '고무나무 원목',
 'legs_open', 25, false, false, '{내추럴}',
 'small', 'low', 'easy', 'ok',
 'easy', false,
 'easy', false, 1, '육각렌치 동봉',
 'easy', '{wobble}',
 '로봇청소기를 쓰는 자취생', '수납 공간이 많이 필요한 사람',
 'confirmed', '공식 스마트스토어', '2026-07-09', 'public'),

-- 4. 최저가 스틸 프레임 · 익일 배송 · 10만 이하
('브리즈 스틸 프레임 슈퍼싱글', '쿠팡', 'https://example.com/breeze-steel', null,
 89000, 0, 'none', null,
 false, 79000,
 1, 2, false,
 111, 201, 30, 'SS', '스틸',
 'legs_open', 30, false, false, '{블랙,화이트}',
 'small', 'low', 'easy', 'ok',
 'easy', false,
 'easy', false, 1, '조립 공구 동봉',
 'easy', '{squeak,finish_poor}',
 '예산이 빠듯하고 이번 주 안에 받아야 하는 사람', '삐걱임 소음에 민감한 사람',
 'estimated', '판매페이지+리뷰 취합', '2026-07-06', 'public'),

-- 5. 프리미엄 원목 서랍침대 · 설치 서비스 유료 · 30만 초과
('네스트 원목 서랍침대 슈퍼싱글', '리바트몰', 'https://example.com/nest-drawer', null,
 349000, 40000, 'paid', 30000,
 false, 150000,
 7, 14, true,
 117, 207, 35, 'SS', '오크 원목',
 'drawer', null, false, true, '{월넛,오크}',
 'medium', 'high', 'easy', 'no',
 'hard', true,
 'hard', true, 2, '설치 서비스 이용 권장',
 'medium', '{drawer_awkward}',
 '마감 품질을 중시하고 오래 쓸 사람', '예산이 20만원 이하인 사람',
 'confirmed', '공식몰 상세페이지', '2026-07-01', 'public'),

-- 6. 평상형(하부 막힘) · 먼지 차단 · 혼자 운반 어려움
('모던 헤드리스 평상형 침대', '모던하우스', 'https://example.com/modern-platform', null,
 119000, 30000, 'none', null,
 false, 85000,
 10, 14, false,
 113, 204, 25, 'SS', 'PB+LPM',
 'closed_base', null, false, false, '{화이트,그레이}',
 'none', 'high', 'medium', 'no',
 'hard', false,
 'medium', false, 2, '십자드라이버 필요(미동봉)',
 'medium', '{delivery_delay}',
 '침대 밑 먼지가 아예 안 쌓이길 원하는 사람', '엘리베이터 없이 혼자 운반해야 하는 사람',
 'estimated', '판매페이지', '2026-06-28', 'public'),

-- 7. 호텔식 헤드보드 + 콘센트 · 하부 12cm (로봇청소기 기종 확인)
('아르떼 호텔식 헤드보드 침대', 'G마켓', 'https://example.com/arte-hotel', null,
 199000, 0, 'paid', 40000,
 false, 110000,
 7, 10, false,
 116, 206, 105, 'SS', 'PB+패브릭 헤드',
 'legs_open', 12, true, true, '{베이지,차콜}',
 'small', 'medium', 'medium', 'check_height',
 'medium', true,
 'medium', true, 2, '전동드릴 권장',
 'medium', '{manual_poor}',
 '헤드 콘센트와 호텔 무드가 필요한 사람', '하부가 높은 로봇청소기를 쓰는 사람',
 'confirmed', '판매페이지', '2026-07-07', 'public'),

-- 8. 리프트업 + 매트리스 세트 · 설치 포함 · 배송 김
('밀로 리프트업 침대 + 매트리스 세트', '오늘의집', 'https://example.com/milo-set', null,
 279000, 0, 'included', null,
 true, null,
 14, 30, false,
 119, 209, 40, 'SS', 'PB+본넬 매트리스',
 'lift_up', null, false, false, '{아이보리}',
 'large', 'high', 'easy', 'no',
 'hard', true,
 'not_possible', true, 2, '전문 기사 설치',
 'hard', '{smell,delivery_delay}',
 '매트리스까지 한 번에 해결하고 싶은 사람', '2주 안에 받아야 하는 사람',
 'estimated', '판매페이지+리뷰 취합', '2026-07-03', 'public'),

-- 9. 철제 2단 서랍 · 가성비 · 조립 리스크 큼
('데일리 철제 2단 수납침대', '11번가', 'https://example.com/daily-steel-drawer', null,
 139000, 20000, 'none', null,
 false, 75000,
 5, 7, false,
 110, 200, 45, 'SS', '스틸+PB',
 'drawer', null, false, false, '{블랙}',
 'medium', 'medium', 'medium', 'no',
 'medium', false,
 'hard', false, 2, '부품 많음·전동드릴 권장',
 'easy', '{squeak,missing_parts,assembly_hard}',
 '가성비 수납침대가 필요하고 공구를 다룰 수 있는 사람', '조립 경험이 없는 사람',
 'estimated', '판매페이지+리뷰 취합', '2026-06-30', 'public'),

-- 10. 소나무 원목 주문제작 · 분해·이사 편함 · 배송 3~4주
('그로브 소나무 원목 침대 (주문제작)', '그로브 스마트스토어', 'https://example.com/grove-pine', null,
 169000, 35000, 'none', null,
 false, 100000,
 21, 30, true,
 114, 204, 30, 'SS', '소나무 원목',
 'legs_open', 18, false, false, '{내추럴,브라운}',
 'small', 'low', 'easy', 'check_height',
 'medium', false,
 'easy', false, 1, '육각렌치 동봉',
 'easy', '{extra_cost}',
 '원목 질감과 이사할 때 분해 편의를 중시하는 사람', '2주 안에 받아야 하는 사람',
 'confirmed', '공식 스마트스토어', '2026-07-04', 'public');
