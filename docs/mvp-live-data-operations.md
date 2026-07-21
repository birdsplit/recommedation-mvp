# 모두의침대 MVP 실데이터 운영 가이드

목표 기능 동결일은 지원사업 제출일(7월 28일) 하루 전인 **2026년 7월 27일**이다. 그전까지 공개본은 `DATA_MODE=demo`로 유지하고, 검수가 끝난 하나의 카탈로그 릴리스가 생긴 뒤에만 `live`로 전환한다.

## 현재 준비된 데이터

- `data/catalog-products.draft.csv`: 공식 판매처 6곳의 실제 상품 URL 30개 초안
- `outputs/recommendation_mvp/모두의침대_실상품_조사_템플릿.xlsx`: 같은 30개 초안을 포함한 조사·검수 워크북
- 모든 초안 행은 `hidden`, 재고는 `unknown`, 이미지는 빈칸이다.
- 가격·배송비·재고·옵션·치수의 미확인 값을 확정값으로 바꾸지 않는다.

## 카탈로그 작업 순서

```powershell
npm run catalog:validate -- --file data/catalog-products.draft.csv --as-of 2026-07-12
npm run catalog:import -- --file data/catalog-products.draft.csv --dry-run
npm run catalog:import -- --file data/catalog-products.draft.csv
npm run catalog:release -- --version 2026-07-27.1 --approve-warnings "검수자: 승인 사유"
```

`catalog:import`는 `seller_name + offer_id + variant_key`에서 만든 고유키로 upsert한다. `catalog:release`는 공개 가능한 상품 스냅샷을 묶어 불변 릴리스로 만들며, live 추천은 최신 published 릴리스만 읽는다.

공개 행에는 가격·재고, 배송·설치, 규격·구조, 반품·보증, 리뷰 표본의 그룹별 URL과 `confirmed` 근거가 모두 필요하다. 반품·파손·보증 요약, 리뷰 표본 1~10개, 위험별 언급 수, 20% 이상 재검수도 강제한다. 경고가 남으면 검수자와 승인 사유를 릴리스에 기록하지 않는 한 공개할 수 없다.

## 공개 전 사람 검수

1. 정확한 옵션·실판매 URL·현재가·재고·외경·수납방식·배송기간을 다시 확인한다.
2. 조건부 배송비·설치비는 0원 대신 `unknown`과 확인 문장을 저장한다.
3. 상업 정보는 7일, 고정 사양은 30일을 넘기지 않는다.
4. 리뷰는 상품별 최대 10개만 표본화하고 같은 위험이 2건 이상일 때만 반복 위험으로 등록한다.
5. 전체 리뷰 표본의 20%를 다른 사람이 재검수한다.
6. 이미지 사용권을 확인하지 못하면 `image_url`을 비워 구조 일러스트를 사용한다.
7. 검증 오류 0개, 경고에는 승인 기록이 있어야 한다.
8. 현재 MVP 공개 범위는 `bed_size=SS`뿐이다. 90×200 싱글 초안은 별도 검증 범위이므로 공개할 수 없다.

현재 30개 초안은 URL과 1차 관측값을 확보한 상태일 뿐 공개 기준을 아직 만족하지 않는다. 특히 재고·지역별 배송비·배송 가능일과 13개 상품의 치수 보완이 필요하다.

## 실행 모드

```dotenv
DATA_MODE=demo
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STUDY_TOKEN_SECRET=
```

- `demo`: 화면마다 예시 데이터 표시, 판매처·출처 이동 차단, fixture만 사용
- `live`: Supabase와 published 릴리스가 없으면 더미로 폴백하지 않고 오류 처리. 공개 후에도 가격·재고·배송 7일, 사양 30일을 넘긴 상품과 품절·재확인 상품은 새 추천에서 제외
- 이벤트·피드백 API는 DB 미설정을 성공으로 응답하지 않는다.

## 추천 재현성과 내부 QA

실데이터 추천은 `POST /api/recommendations`에서 run을 생성한다. 답변, 알고리즘 버전, 카탈로그 릴리스, 후보 전체 스냅샷을 저장하고 `/results/[runId]`가 그 스냅샷을 보여준다.

내부 QA 토큰은 서버 비밀키로 발급한다.

```powershell
$env:STUDY_TOKEN_SECRET="충분히-긴-서버-전용-비밀키"
npm run study:token -- internal-qa 7
```

출력 토큰을 `/study/<token>`으로 열면 HttpOnly 테스트 쿠키가 발급된다. 클라이언트가 `is_test`를 직접 지정할 수 없으며, 관리자 지표는 테스트 여정을 제외한다.

## 검증 명령

```powershell
npm run check
npm run catalog:test
npm run catalog:validate -- --file data/catalog-products.draft.csv --as-of 2026-07-12
npm run build
```

운영 전에는 390px, 768px, 1440px에서 질문 → 요약 → 결과 비교 → 상세 → 추가비용 확인 → 판매처 → 피드백 흐름을 확인한다. 데모에서는 판매처 이동이 403으로 차단되어야 한다.

## 사용자 테스트 기록 기준

- 사용성 테스트 5명: 3개 후보 차이를 30초 안에 설명 가능한지
- 비교실험 최소 20명
- 질문 완주율 70% 이상
- 후보 선정시간 중앙값 30% 이상 단축
- 조건 반영 만족도 4.0/5 이상
- 고려 상품 발견 60% 이상, 판매처 클릭 40% 이상

관리자 대시보드는 고유 `journey_id`로 결과 도달 전 퍼널을 계산하고, 상세·비교·추가비용·판매처·출처·피드백을 결과 이후 독립 분기율로 표시한다.
