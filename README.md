# 모두의침대 MVP

자취생이 수납·운반/조립·예산/배송 조건에 답하면 슈퍼싱글 침대 프레임 후보를 최대 3개로 좁혀 주는 모바일 우선 구매 의사결정 MVP입니다. 가격만 정렬하지 않고 총비용, 맞는 이유와 주의점, 배송·설치 조건, 정보 출처와 확인일을 함께 보여 줍니다.

사용자는 로그인 없이 추천 여정을 이용합니다. 관리자는 `/admin`에서 상품 정보와 공개 상태를 관리하고, 익명 행동 퍼널을 확인하거나 이벤트·피드백 CSV를 내려받을 수 있습니다.

- 기획 기준: [침대 구매 의사결정 MVP 앱 기획서](docs/%EC%B9%A8%EB%8C%80_%EA%B5%AC%EB%A7%A4%EC%9D%98%EC%82%AC%EA%B2%B0%EC%A0%95_MVP_%EC%95%B1_%EA%B8%B0%ED%9A%8D%EC%84%9C.md)
- 현재 작업 상태: [인수인계 문서](docs/handoff.md)

## 기술 스택

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS v4, Pretendard Variable
- Supabase Postgres (`service_role`을 사용하는 서버 전용 데이터 접근)
- Vitest, ESLint
- Vercel 배포 기준

## 사전 준비

- Node.js 20.9 이상과 npm
- Docker Desktop 또는 호환 Docker daemon
- Supabase CLI. 이 저장소에서는 전역 설치 없이 `npx supabase ...`를 사용합니다.
- 클라우드 배포 시 Supabase, GitHub, Vercel 계정

설치 상태를 확인합니다.

```powershell
node --version
npm --version
docker --version
npx supabase --version
```

## 로컬 실행

### 1. 패키지 설치

```powershell
npm install
```

### 2. 로컬 Supabase 준비

Docker를 실행한 뒤 프로젝트 루트에서 다음 명령을 실행합니다. 포트와 활성 서비스는 [`supabase/config.toml`](supabase/config.toml)에 정의되어 있습니다.

```powershell
npx supabase start
npx supabase db reset
npx supabase status -o env
```

`db reset`은 로컬 DB를 삭제하고 [`supabase/migrations/20260711000000_initial_schema.sql`](supabase/migrations/20260711000000_initial_schema.sql)과 [`supabase/seed.sql`](supabase/seed.sql)을 다시 적용합니다. 개발 데이터가 지워지므로 사용 중인 로컬 DB에서만 실행하고, 운영 프로젝트에 `--linked` 옵션을 붙여 실행하지 마세요.

`status -o env` 출력 중 앱에 필요한 값은 두 개입니다.

| Supabase CLI 출력 | 앱 환경변수 |
|---|---|
| `API_URL` | `SUPABASE_URL` |
| `SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` |

현재 로컬 API 기본 주소는 `http://127.0.0.1:55321`이지만, 포트가 바뀌면 `status` 출력값을 우선합니다.

### 3. 환경변수 설정

```powershell
Copy-Item .env.example .env.local
```

`.env.local`에 다음 네 값을 채웁니다.

```dotenv
SUPABASE_URL=http://127.0.0.1:55321
SUPABASE_SERVICE_ROLE_KEY=<supabase status의 SERVICE_ROLE_KEY>
ADMIN_PASSWORD=<충분히 긴 관리자 비밀번호>
ADMIN_COOKIE_SECRET=<독립적으로 생성한 랜덤 서명 키>
```

관리자 비밀번호와 쿠키 서명 키는 서로 다른 값으로 생성하세요. 다음 명령을 각각 한 번씩 실행하면 URL-safe 랜덤 문자열을 만들 수 있습니다.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

> `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회할 수 있는 서버 비밀키입니다. Git에 커밋하거나 브라우저 코드·로그·스크린샷에 넣지 말고, 절대 `NEXT_PUBLIC_` 접두사를 붙이지 마세요. `.env.local`은 Git에서 제외되어 있습니다.

### 4. 앱 실행

```powershell
npm run dev
```

- 사용자 화면: [http://localhost:3000](http://localhost:3000)
- 관리자 로그인: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)
- 관리자 대시보드: [http://localhost:3000/admin](http://localhost:3000/admin)
- 상품 관리: [http://localhost:3000/admin/products](http://localhost:3000/admin/products)

Supabase 환경변수가 없어도 사용자 추천 화면은 코드 내 시드로 동작합니다. 이 경우 이벤트·피드백은 저장되지 않고 관리자 데이터 화면은 설정 안내를 표시하므로, 전체 검증에는 Supabase 연결이 필요합니다.

## 빌드와 검증

### 정적 검사와 단위 테스트

```powershell
npm run check
npm run build
npm run start
```

- `check`: ESLint → TypeScript → Vitest를 순서대로 실행
- `build`: Next.js 프로덕션 빌드와 Route 타입 검증
- `start`: 성공한 빌드를 프로덕션 모드로 실행

### DB 통합 검증

`verify:m3`, `verify:m4`, `verify:m5`는 별도 Node 프로세스이므로 `.env.local`을 자동으로 읽지 않습니다. 먼저 현재 PowerShell 프로세스에 로컬 Supabase 값을 넣으세요.

```powershell
$status = npx supabase status -o json | ConvertFrom-Json
$env:SUPABASE_URL = $status.API_URL
$env:SUPABASE_SERVICE_ROLE_KEY = $status.SERVICE_ROLE_KEY

npm run verify:m3
npm run verify:m4
npm run verify:m5
```

| 명령 | 검증 범위 |
|---|---|
| `npm run verify:m3` | 실제 이벤트 11종의 기록 순서, 피드백 upsert, 예약 이벤트 타입, API 오류 경계 |
| `npm run verify:m4` | 관리자 인증·직접 읽기 경계, 상품 생성/수정/상태 변경, 퍼널, 이벤트·피드백 CSV, 로그아웃 |
| `npm run verify:m5` | §19 핵심 여정, 실제 후보 수 표시·후보 3개 결정성·빈 결과 완화, 품절·비공개 제외, 판매처 측정과 피드백 |

세 통합 검증기는 로컬 Next 개발 서버를 임시 포트에 띄우고 검증 행을 정리합니다. 운영 Supabase에 연결해 실행하지 말고 로컬 또는 전용 테스트 프로젝트에서만 사용하세요.

## 관리자 기능과 경로

- `/admin/login`: 환경변수 비밀번호로 로그인
- `/admin`: 익명 이벤트 퍼널과 CSV 진입점
- `/admin/products`: 전체 상품, 공개 상태, 마지막 확인일 관리
- `/admin/products/new`, `/admin/products/[id]`: 상품 등록·수정
- `/api/admin/export/events`, `/api/admin/export/feedback`: 인증된 UTF-8 BOM CSV 다운로드

관리자 세션은 HMAC 서명된 `httpOnly`, `SameSite=Lax` 쿠키이며 운영 모드에서는 `Secure`가 적용됩니다. 모든 관리자 데이터 페이지, Server Action, CSV Route Handler가 쿠키를 다시 검증합니다.

## 이벤트 데이터

[`src/lib/constants.ts`](src/lib/constants.ts)의 이벤트 12종과 DB 제약이 동일해야 합니다.

`visit`, `start_click`, `question_answer`, `questions_complete`, `summary_view`, `results_view`, `product_detail_view`, `compare_add`, `cost_check`, `outbound_click`, `feedback_submit`, `post_purchase_submit`

현재 사용자 화면에서 발생하는 이벤트는 앞의 11종입니다. `post_purchase_submit`은 구매 후 검증 기능을 위한 예약 타입으로 API와 스키마 계약만 유지하며, 제출 화면은 아직 없습니다. 이벤트와 피드백은 개인정보 없이 익명 세션 ID로 저장합니다.

## 클라우드 Supabase 적용

새 클라우드 프로젝트에는 다음 두 방법 중 하나만 사용하세요.

### Supabase CLI 권장 경로

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run
npx supabase db push --include-seed
```

마지막 명령은 아직 적용되지 않은 migration과 설정된 seed를 원격 DB에 반영합니다. 현재 seed는 검증용 더미 10개이며 멱등적이지 않으므로 새 프로젝트에서 최초 한 번만 `--include-seed`를 사용하세요. 이후 스키마 변경은 새 migration을 추가하고 `db push`만 실행합니다.

### SQL Editor 대안

CLI를 연결하지 않을 경우 Supabase SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql)을 실행한 뒤 [`supabase/seed.sql`](supabase/seed.sql)을 최초 한 번 실행합니다. 이미 CLI migration을 적용했으면 같은 SQL을 다시 실행하지 마세요.

적용 후 Project Settings의 API 정보에서 프로젝트 URL과 `service_role` 키를 가져와 운영 환경변수에 사용합니다. `anon` 또는 publishable 키로 대체하지 마세요.

## Vercel 배포

1. 배포할 커밋을 GitHub 원격 저장소에 push합니다.
2. Vercel에서 저장소를 Import하고 Framework Preset이 Next.js인지 확인합니다.
3. Vercel Project Settings → Environment Variables에 아래 네 값을 등록합니다.
   - `SUPABASE_URL`: 클라우드 Supabase URL
   - `SUPABASE_SERVICE_ROLE_KEY`: 클라우드 `service_role` 키
   - `ADMIN_PASSWORD`: 로컬과 별도로 관리할 강한 운영 비밀번호
   - `ADMIN_COOKIE_SECRET`: 독립적으로 생성한 운영 서명 키
4. Production 환경에 배포하고 `/`, `/admin/login`, 추천 여정, 판매처 이동, 피드백, 관리자 상품 수정과 CSV를 스모크 테스트합니다.

Preview 배포가 운영 DB를 변경하면 안 되는 경우 Preview에는 별도 Supabase 프로젝트를 연결하거나 민감 환경변수를 등록하지 마세요. 비밀값을 바꾼 뒤에는 재배포해야 하며, `ADMIN_COOKIE_SECRET`을 바꾸면 기존 관리자 세션이 모두 무효화됩니다.

## 운영 주의사항

- [`supabase/seed.sql`](supabase/seed.sql)과 [`src/lib/seed-data.ts`](src/lib/seed-data.ts)는 같은 10개 상품을 유지해야 하며 `npm run check`의 스키마 동기화 테스트가 이를 감시합니다.
- 사용자 추천에는 `status='public'` 상품만 포함됩니다. `hidden`, `sold_out`, `needs_check`는 추천 결과에서 제외됩니다.
- 알 수 없는 설치비·매트리스 가격을 임의로 합산하지 않습니다.
- 현재 `npm audit`에는 Next.js 내부 PostCSS 경로의 moderate 경고 2건이 남아 있습니다. `npm audit fix --force`는 Next.js를 `9.3.3`으로 강제 다운그레이드하므로 실행하지 마세요. 해결 버전이 나오면 별도 브랜치에서 Next.js를 정상 업그레이드하고 전체 검증을 다시 수행합니다.
