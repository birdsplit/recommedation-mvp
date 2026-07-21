# 모두의침대 MVP 실데이터 운영 가이드

## 현재 상태 (2026-07-21)

- 카탈로그: 슈퍼싱글 31개, 공식 판매처 8곳
- 공개 가능: 28개, 판매처 8곳, 수납 방식 4종
- 공개 제외: 현재 구매 불가/해당 SS 옵션 품절 3개(그중 일룸 1개는 리뷰 집계와 공개 본문도 불일치)
- 이미지: 판매처 이미지의 재사용권을 확인하지 못해 전부 공란
- 근거: 가격·재고·배송·규격·정책·리뷰마다 공식 판매처 URL과 확인일을 저장
- 검수표: `data/review-checklist.ko.csv` 31행, 자동 변환본 `data/review-checklist.csv` 31행

공개 28개는 `data/catalog-products.csv`에서 `status=public`입니다. 제외 3개는 사실을 추정해 채우지 않았으며 모두 현재 구매 불가가 확인되어 `sold_out`으로 유지합니다.

## 사람이 보는 파일

`data/review-checklist.ko.csv`를 엑셀이나 구글 스프레드시트로 엽니다. 한국어 열만 확인하면 되며, 상세 작성법은 `docs/사람용-상품-검수표-작성법.md`에 있습니다.

```powershell
npm run review:check
npm run review:sync
```

`review:check`는 공개 표시와 필수 확인값, 리뷰 표본 및 20% 재검수를 검사합니다. `review:sync`는 한국어 표를 자동화용 `data/review-checklist.csv`로 변환합니다. 카탈로그 자체를 수정하지는 않습니다.

## 데이터 검증과 임포트

아래 명령은 프로젝트 루트에서 순서대로 실행합니다.

```powershell
npm run catalog:test
npm run catalog:validate -- --as-of 2026-07-21
npm run catalog:import -- --as-of 2026-07-21 --dry-run
npm run catalog:import -- --as-of 2026-07-21
```

`catalog:import`는 `seller_name + offer_id + variant_key`로 upsert합니다. 다시 실행해도 같은 옵션을 중복 생성하지 않습니다.

## 릴리스

운영 기본 게이트는 공개 상품 30개 이상입니다. 이번 공식 재검수에서 확인된 공개 가능 상품은 28개이므로 기본 명령은 경고와 함께 멈춥니다. 품절 2개와 리뷰 본문 미확보 1개를 억지로 공개하지 않고 28개를 의도적으로 릴리스할 때만 다음과 같이 예외 사유를 기록합니다.

```powershell
npm run catalog:release -- --version 2026-07-21.2 --as-of 2026-07-21 --dry-run --allow-partial --approve-warnings "Codex: 공식 검수 완료 28개 공개; 현재 구매 불가/SS 품절 3개 제외"
npm run catalog:release -- --version 2026-07-21.2 --as-of 2026-07-21 --allow-partial --approve-warnings "Codex: 공식 검수 완료 28개 공개; 현재 구매 불가/SS 품절 3개 제외"
```

`allow-partial`은 공개 기준을 낮추는 기능이 아니라, 30개 목표 미달 사유를 릴리스 기록에 남기는 예외입니다. 각 상품의 필수 사실 검증은 그대로 적용됩니다.

## Supabase 마이그레이션

새 코드가 참조하는 테이블·열을 원격 DB에 먼저 만듭니다.

```powershell
npx supabase link --project-ref <운영-project-ref>
npx supabase migration list
npx supabase db push
npx supabase migration list
```

첫 번째 `migration list`에서 로컬에만 있는 마이그레이션을 확인한 뒤 `db push`를 실행합니다. 두 번째 목록에서 로컬과 원격 버전이 모두 일치해야 합니다. 운영 프로젝트 ref와 DB 암호는 저장소에 기록하지 않습니다.

마이그레이션 → 카탈로그 임포트 → 릴리스 순서가 안전합니다. Git push 자체는 CSV 검수 전에 할 수도 있지만, live 배포가 새 코드를 읽기 시작하기 전에는 세 단계가 모두 끝나 있어야 합니다.

## 프로덕션 배포 전 체크

1. 원격 Supabase 마이그레이션 일치
2. 카탈로그 검증 오류 0개
3. 운영 DB 임포트 성공
4. 검수 사유가 기록된 published 릴리스 존재
5. 배포 환경의 `DATA_MODE=live`, Supabase URL·서비스 키, study secret 설정
6. `npm run check:full` 성공
7. 배포 뒤 `npm run verify:production -- <운영 URL>` 성공

live 모드는 published 릴리스가 없거나 DB 설정이 없으면 데모로 조용히 대체하지 않고 오류를 냅니다. 따라서 CSV와 마이그레이션은 “Git push의 문법적 선행조건”은 아니지만 “정상 live 배포의 선행조건”입니다.

## 운영 갱신 주기

- 가격·재고·배송: 7일 이내 재확인
- 규격·리뷰: 30일 이내 재확인
- 공식 리뷰가 0건이면 공식 화면/API가 0을 명확히 반환한 근거를 유지
- 같은 위험이 표본 2건 이상에 나타날 때만 추천 화면에 반복 위험으로 노출
- 판매처 이미지 사용권을 확인하지 못하면 `image_url`을 계속 비움

`scripts/catalog-refresh-2026-07-21.mjs`는 이번 전수 검수 반영 내역을 재현하는 감사용 스크립트입니다. 향후 가격 갱신은 새 확인일로 별도 스크립트나 직접 검수 패치를 만들고, 과거 확인일을 오늘 날짜로 단순 변경하지 않습니다.
