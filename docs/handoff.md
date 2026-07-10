# 모두의침대 MVP — 작업 인수인계 문서 (2026-07-10 기준)

## 1. 프로젝트 개요

- **위치**: `/Users/jh030512/Desktop/codes/modoo` (git init 됨, 커밋은 아직 없음)
- **스택**: Next.js 16.2.10 (App Router, src-dir, `@/*` alias) + React 19 + TypeScript + **Tailwind v4** + Supabase(service-role만, anon 미사용) + vitest
- **기획서**: `docs/침대_구매의사결정_MVP_앱_기획서.md` — §9 추천 규칙, §11.1 이벤트 12종, §19 완료 기준이 수락 기준
- **디자인**: 시안 A(밝고 프렌들리 라운드형) 확정. 원본 참조: `design-samples/a.html` (M2 완료까지 유지 후 삭제 예정)
- **서비스명**: "모두의침대"는 임시 — `src/lib/constants.ts`의 `SERVICE_NAME` 한 곳에서 관리

## 2. 완료된 작업 (M0, M1 + M2 일부)

### M0 — 기반 (완료)
- `supabase/schema.sql` — products/events/feedback 3테이블, RLS on·정책 없음, updated_at 트리거, 점검 쿼리 주석
- `supabase/seed.sql` — 더미 상품 10개 (⚠️ `src/lib/seed-data.ts`와 1:1 미러 — 한쪽 수정 시 다른 쪽도 수정)
- `src/lib/constants.ts` — SERVICE_NAME, 리뷰리스크 10종, EVENT_TYPES 12종, 라벨 맵, TIER_LABELS(great/conditional/not_fit), STALE_VERIFIED_DAYS=14, COMPARE_MAX=3
- `src/lib/supabase.ts` — `supabaseAdmin()`, `isSupabaseConfigured()` (미설정 시 폴백 동작 지원)
- `src/lib/track.ts` — sessionId(localStorage `modoo_sid` + `sid` 쿠키 미러), `track()`(sendBeacon→keepalive fetch), `trackVisit()`(하루 1회)
- `src/lib/products.ts` — `getPublicProducts()`, `getProductById()`, `getPublicProductsByIds()` — **Supabase 미설정 시 seed-data 폴백**
- `src/app/api/events/route.ts` — whitelist 검증, payload 2KB 캡, 미설정 시 204로 조용히 버림
- `src/app/globals.css` — 시안 A 토큰이 `@theme`에 등록됨: `cream/ink/sub/faint`, `peach-50/100/200`, `coral-400~700`, `leaf-50/700`, `honey-50/700`, `shadow-soft/card/cta`, Pretendard(npm 패키지 self-host, layout.tsx에서 CSS import)
- `.env.example` — SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD, ADMIN_COOKIE_SECRET

### M1 — 추천 엔진 (완료, 테스트 44개 전부 통과)
- `src/lib/reco/` — types / answers / cost / filter / score / reasons / relax / engine (순수 함수 파이프라인)
- 핵심 API: `recommend(products, answers)` → `{candidates(≤3, 비추천 미포함), totalReviewed, relaxSuggestions}` / `evaluateProduct(p, answers)` → Recommendation(tier·cost·checks·fitReasons 2개·cautions·finalJudgment) — 상세/비교 화면 공용
- 답변은 URL 쿼리로 흐름: `s`(big/drawer/robot/closed/any), `c`(both/asm/carry/svc/friend), `b`(100000/200000/300000), `pb`(item/total), `d`(1w/2w/1m/any), `m`(1/0)
- **적대적 리뷰로 8건 결함 수정 완료**: 프로토타입 키 쿼리 크래시(`?s=toString`), 운반/조립 완화 미고지(충족표 note+주의 추가, 라벨을 "운반은 어려움 · 조립 가능"으로 변경), `installation_service='none'`을 미확인과 구분, 조사 오류("가격는"→"금액은"), "확인 확인" 중복(core 명사구 개명), 복수 상품 "가장 무난" 최상급 제거, 먼지차단 보통 상품 과장 문구, hasAnswers 검증 강화 — 전부 회귀 테스트 있음

### M2 — 화면 (부분 완료)
**완료된 화면**: `/`(랜딩), `/q/[step]`(질문 1~3, 클라이언트, 쿼리 누적+기존값 프리셀렉트), `/summary`(조건 요약+수정 링크+충돌 경고), `/results`(카드 3개, 빈 결과+완화 제안 링크, 조건 수정 바)

**완료된 컴포넌트**: `icons.tsx`, `BedIllustration.tsx`(Hero/Placeholder/Thumb), `TierBadge`, `Track.tsx`(EventOnMount/VisitTracker/TrackedLink), `useCompare.ts`(localStorage `modoo_compare`), `CompareButton`, `SellerLinkButton.tsx`(이동 전 확인 시트+`buildCheckItems`), `ProductCard.tsx`(+installationLabel/mattressLabel/TrustLine), `RememberAnswers.tsx`(sessionStorage `modoo_last_query`/`modoo_last_candidates` — 결과 화면이 저장, 비교함/피드백이 읽음)

## 3. 남은 작업 — 상세

### 3-A. M2 잔여 화면 (직전에 4개 병렬 에이전트로 착수하려던 스펙)

**공통 규약**: 서버 페이지는 `params`/`searchParams`가 Promise(await 필요), 클라이언트는 useParams/useSearchParams. 디자인은 기존 카드·버튼 클래스 재사용(카드 `rounded-[28px] bg-white shadow-card`, CTA `rounded-full bg-gradient-to-r from-[#F95B36] to-[#EE4E26] shadow-cta`, 칩 `rounded-full bg-peach-50`). 점수 숫자 노출 금지. 기존 파일 수정 최소화.

1. **`/products/[id]/page.tsx` (화면7 상세 판단, 서버)** — `getProductById` → 없거나 비공개면 notFound. `parseAnswers` + `evaluateProduct`. 9개 섹션: ①필수조건 충족표(checks 5행, pass 아이콘+note) ②맞는 이유 2 ③안 맞는 이유(not_recommended_for 포함) ④감당 가능 리스크(cautions 전체) ⑤실질 총비용(CostBreakdown+unknownParts) ⑥리뷰 리스크 태그 칩(REVIEW_RISKS 라벨) ⑦배송·설치·운반 확인사항(배송일·지정일·서비스·조립 인원/공구) ⑧출처·확인일(TrustLine) ⑨최종 판단 한 문장 강조 박스. 버튼 순서(기획서 고정): CompareButton → `/cost-check/[id]?쿼리` 링크("우리 집까지 총비용 확인") → SellerLinkButton(via="detail"). not_fit이면 상단에 비추천 배너+실패 조건 표시. `EventOnMount product_detail_view {productId, tier, rank}`

2. **`/cost-check/[id]/page.tsx` + `CostCheckForm.tsx` (화면9 MVP 축소판)** — 계산 없음(P1). 표시: 확인된 비용 분해 + "추가비용 발생 가능 조건" 정적 목록(도서산간, 계단 운반, 내부 운반, extra_cost 리스크 시 지역 배송비 강조) + 판매처 최종 확인 목록. 클라이언트 폼(전부 선택 입력): 시·도, 엘리베이터 유무, 계단 운반, 집 안 운반, 희망 시기 → 제출 시 `track('cost_check', {productId, ...입력})`만 기록. "입력은 확인 목록 생성에만 사용" 안내 + 연락처/상세주소 안 받음 명시. SellerLinkButton(via="cost_check")

3. **`/compare/page.tsx` (화면8, 클라이언트) + `/api/products/route.ts`** — API: GET `?ids=a,b,c` → getPublicProductsByIds JSON. 비교 페이지: useCompare ids → fetch → 답변은 URL 쿼리 ?? `loadLastQuery()` 폴백 → 클라이언트에서 `evaluateProduct` 실행(엔진은 순수 TS라 가능). 비교표 11행: 총비용/배송일/수납력/먼지차단/로봇청소기/운반/조립 난이도/매트리스/리뷰 리스크/분해·이사/최종 판단. 차이나는 행 강조, not_fit 상품은 빨간 경고. 열별 제거 버튼, 상세 보기+판매처 버튼. 빈 상태 → 결과로 유도. enum 한국어 라벨 맵은 비교 파일 안에 로컬로 정의(constants.ts 수정 금지 — 충돌 방지)

4. **`/go/[id]/route.ts` (화면10)** — GET: `sid` 쿠키(UUID 검증, 없으면 randomUUID) → 상품 조회(없거나 비공개 → `/`로) → `outbound_click` insert `{productId, rank, via}` (try/catch, 미설정 시 스킵, 실패해도 redirect) → 302 `seller_url`

5. **`/feedback/page.tsx` + `/api/feedback/route.ts` (화면11)** — 폼(클라이언트): 1~5 척도 3개(시간 단축/조건 반영/이유 도움), 예·아니오 2개(고려 상품 발견/재사용 의향), 가장 피곤한 질문(질문1/2/3/없음+주관식), 선택: 최종 선택 상품(`loadLastCandidateIds()`로 후보 로드, 없으면 숨김), 구매 후 확인 동의 체크박스. POST → feedback insert(검증: 1~5 범위, bool, 텍스트 길이 캡) → 성공 시 클라이언트에서 `track('feedback_submit')` → 감사 화면

6. **기타**: `/have-candidate/page.tsx`(경로 A 수동 안내 — 준비 중 + 질문 플로우 유도), `not-found.tsx`, `error.tsx`("use client" 필수)

**M2 완료 후**: `npx tsc --noEmit`, `npm run build`, `npx vitest run` 전부 통과 확인. Q1 이모지(🗄️ 등)가 랜딩~질문 화면에서 깨지지 않는지, 390px 뷰포트 확인.

### 3-B. M3 — 이벤트 검증 (Task #4)
- 12종 이벤트가 전부 실제로 기록되는지 dev 서버로 전체 여정 워크스루: visit → start_click → question_answer×3 → questions_complete → summary_view → results_view → product_detail_view → compare_add → cost_check → outbound_click → feedback_submit (post_purchase_submit은 타입만 예약, 화면 없음 — 의도된 것)
- Supabase 연결 후 `select event_type, count(*) from events group by 1`로 확인

### 3-C. M4 — 관리자 (Task #5)
- `/api/admin/login` — `ADMIN_PASSWORD` 비교 → HMAC(`ADMIN_COOKIE_SECRET`) httpOnly·secure·lax 쿠키. `admin/layout.tsx`에서 서버 검증 → 미인증 시 `/admin/login`
- `/admin/products` — 목록: 상태 뱃지(PRODUCT_STATUS_LABELS), `last_verified_at` 14일 경과 빨간 표시(STALE_VERIFIED_DAYS), 상태 즉시 변경(server action)
- `/admin/products/new`, `/admin/products/[id]` — ProductForm(server actions): §8.1 그룹(기본/비용/배송/크기·구조/운반·조립/판단 데이터/리뷰 리스크 체크박스 10종/신뢰 정보), "오늘로 확인일 갱신" 버튼
- `/admin` 대시보드 — events group by 퍼널 카운트 테이블(전 단계 대비 %) — 차트 라이브러리 금지
- `/api/admin/export/[kind]` — kind∈events|feedback, CSV 수기 escape + **BOM 프리픽스**(엑셀 한글), Content-Disposition attachment, 쿠키 검증

### 3-D. M5 — QA·배포 (Task #6)
- 기획서 §19 완료 기준 12항목 전체 워크스루 (계획 파일의 "검증" 섹션에 체크리스트 있음). 특히: 빈 결과 조합(큰 짐+일주일 배송)→완화 제안, 품절 전환→결과 제외, 비교함 상품 비공개→우아한 제거, `/results` 새로고침 동일 결과
- 문구 검수(기획서 화면 문구 대조), design-samples/ 삭제, README에 셋업 가이드, Vercel 배포(GitHub push → import → env 4개)
- 배포 전 화면 전반 적대적 리뷰 워크플로우 1회 권장(엔진에서 했던 것과 동일 패턴)

## 4. 사용자(본인)가 해야 할 일
1. Supabase 프로젝트 생성(서울 리전) → Settings→API에서 URL + service_role 키 복사
2. SQL Editor에서 `supabase/schema.sql` → `supabase/seed.sql` 순서로 실행
3. `.env.local` 작성(.env.example 참고 — 4개 변수) → `npm run dev` 재시작
   - **미설정이어도 화면은 시드 폴백으로 동작**하고 이벤트만 안 쌓입니다

## 5. 주의사항 (다음 세션에서 놓치기 쉬운 것)
- `seed.sql` ↔ `seed-data.ts` 동기화 유지
- 비추천(not_fit)은 상위 3에 절대 미노출 — 상세/비교에서만
- 총비용에 모르는 금액 지어내기 금지 — `unknownParts`로 고지
- 주의 문구 core는 "확인"으로 끝나면 안 됨(최종 문장 템플릿과 중복됨), 최상급("가장") 금지 — 회귀 테스트가 잡아줌
- 리뷰 워크플로우 중 402 квота 에러로 검증 못 한 발견 2건이 있었음 — 전체 결과: `/private/tmp/claude-501/-Users-jh030512-Desktop-codes-modoo/311b96e1-e5ec-424f-a16b-85105ae4e7d9/tasks/we3hbso6l.output`