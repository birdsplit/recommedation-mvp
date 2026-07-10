# 모두의침대 MVP — 작업 인수인계 (2026-07-11)

## 현재 상태

- 작업 위치: `C:\codes\modoo\recommendation_mvp`
- 브랜치: `main`
- M4 기준 커밋: `523036b Complete M4 admin operations and verification`
- M5 로컬 마무리: 현재 `HEAD` (`README`, `verify:m5`, 접근성 QA, 시안·기본 에셋 정리 — `git log -1`로 확인)
- 스택: Next.js 16.2.10 App Router, React 19, TypeScript, Tailwind CSS v4, Supabase, Vitest
- 수락 기준: [`침대_구매의사결정_MVP_앱_기획서.md`](%EC%B9%A8%EB%8C%80_%EA%B5%AC%EB%A7%A4%EC%9D%98%EC%82%AC%EA%B2%B0%EC%A0%95_MVP_%EC%95%B1_%EA%B8%B0%ED%9A%8D%EC%84%9C.md)의 §9, §11.1, §19

M0–M5 로컬 구현과 반복 검증은 완료되었습니다. 운영 문서와 최종 수락 검증기 `verify:m5`가 작업 트리에 추가되었고, 외부 클라우드 적용·배포만 남았습니다.

## 완료된 마일스톤

- 기반·추천 엔진·초기 화면: `9a06b66 Add full MVP implementation (M0–M2): user flow, recommendation engine, and core infrastructure`
- M2 사용자 여정 완성·강화: `307a18f Complete and harden the M2 user flow`
  - 랜딩 → 질문 3개 → 요약 → 결과 → 상세 → 비교 → 총비용 → 판매처 이동 → 피드백
  - 빈 결과 완화, 비교함 상태, 모바일 390px, 세션/리다이렉트 오류 경계 검증
- M3 실제 데이터 기록: `8814bbd Add repeatable M3 tracking verification`
  - 실제 이벤트 11종, 예약 이벤트 1종, 피드백 upsert, 오류 응답 경계를 반복 검증하는 `verify:m3`
- M4 관리자 운영: `523036b Complete M4 admin operations and verification`
  - HMAC 관리자 인증, 페이지·Server Action·CSV 직접 권한 경계
  - 상품 전체 필드 생성/수정, 상태 즉시 변경, 14일 확인일 경고와 오늘 갱신
  - 퍼널 대시보드, 이벤트/피드백 CSV, 반복 통합 검증 `verify:m4`

## 현재 검증 증거

- `npm run check`: ESLint, TypeScript, 테스트 파일 8개·테스트 93개 통과
- `npm run build`: Next.js 16 프로덕션 빌드 통과
- `npm run verify:m3`: 공개 상품, 실제 이벤트 11종, `post_purchase_submit` 예약 계약, 피드백 upsert, API 오류 경계 통과
- `npm run verify:m4`: 인증·쿠키 변조 방어·직접 읽기 경계, 상품 CRUD/상태/확인일, 퍼널/CSV, 로그아웃 통과
- `npm run verify:m5`: §19 핵심 여정, 후보 부족 시 실제 분모·완화, 후보 3개 결정성, 빈 결과 완화, 품절·비공개 제외, 판매처 측정·피드백 통과

통합 검증기는 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`를 현재 셸 환경변수로 받아 임시 Next 개발 서버를 띄웁니다. `.env.local`을 자동으로 읽지 않으며 운영 DB를 대상으로 실행하면 안 됩니다. 자세한 실행법은 루트 [`README.md`](../README.md)에 있습니다.

## 남은 외부 배포 작업

1. 클라우드 Supabase에 migration과 최초 seed를 적용합니다.
2. 현재 `HEAD`를 GitHub 원격에 push하고 Vercel 환경변수 4개를 설정해 배포합니다.
3. 배포 URL에서 추천 여정, 이벤트/피드백 저장, 관리자 상품 수정, CSV를 스모크 테스트합니다.

클라우드 Supabase와 Vercel 배포는 사용자 계정·프로젝트 선택과 운영 비밀값이 필요하므로 외부 설정 없이는 완료할 수 없습니다.

## 다음 작업 시작 순서

```powershell
cd C:\codes\modoo\recommendation_mvp
npm install
npx supabase start
npx supabase db reset
npx supabase status -o env
npm run check
npm run build
```

통합 검증을 실행할 때는 `status`의 `API_URL`과 `SERVICE_ROLE_KEY`를 각각 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`로 현재 PowerShell 세션에 넣은 뒤 `npm run verify:m3`, `npm run verify:m4`, `npm run verify:m5`를 실행합니다.

## 보안·운영 불변조건

- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용입니다. Git, `NEXT_PUBLIC_` 환경변수, 클라이언트 번들, 로그에 노출하지 않습니다.
- 모든 관리자 데이터 페이지와 Server Action, `/api/admin/export/*`는 자체적으로 관리자 쿠키를 검증해야 합니다. 보호 layout만 권한 경계로 의존하지 않습니다.
- 로컬 `npx supabase db reset`은 파괴적입니다. 운영 프로젝트에 `--linked`로 실행하지 않습니다.
- `supabase/seed.sql`과 `src/lib/seed-data.ts`의 상품 데이터는 동기화 상태를 유지합니다.
- 추천 결과에는 `public` 상품만 포함하고 비추천 티어는 상위 후보에 노출하지 않습니다.
- 알 수 없는 비용을 숫자로 만들어 합계에 넣지 않습니다.
- `npm audit fix --force`를 실행하지 않습니다. 현재 자동 수정은 Next.js를 9.3.3으로 강제 다운그레이드합니다.
- 사용자 소유 미추적 파일 `docs/recursive-dreaming-clover.md`는 수정·삭제·스테이지하지 않습니다.

## 작업 트리 주의

의도된 미추적 파일은 `docs/recursive-dreaming-clover.md` 하나입니다. 이 파일은 사용자 자료로 보존하고, 후속 커밋 범위를 잡을 때 명시적으로 제외합니다.
