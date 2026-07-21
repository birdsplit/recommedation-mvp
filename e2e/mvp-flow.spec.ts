import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const DEMO_PRODUCT_ID = "00000000-0000-4000-8000-000000000003";

async function expectNoSeriousA11yViolations(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  const violations = result.violations.filter((item) =>
    item.impact === "serious" || item.impact === "critical"
  );
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test("질문 → 3개 비교 → 상세 → 추가비용 흐름과 접근성", async ({ page }) => {
  // ?mode=oneshot으로 arm A를 고정한다(50/50 배정이 흐름을 바꾸지 못하게).
  await page.goto("/?mode=oneshot");
  await expect(page.getByText("데모 데이터로 기능을 검증 중이에요.")).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.getByRole("link", { name: "침대 후보 찾기" }).click();
  await expect(page).toHaveURL(/\/q\/1/);
  await page.getByRole("button", { name: "상관없어요" }).click();
  await expect(page).toHaveURL(/\/q\/2\?/);
  await page.getByRole("button", { name: "직접 옮길 수 있어요" }).click();
  await page.getByRole("button", { name: "직접 조립할 수 있어요" }).click();
  await page.getByRole("button", { name: "예산과 배송 조건 고르기" }).click();
  await expect(page).toHaveURL(/\/q\/3\?/);
  await page.getByRole("button", { name: "아직 모르겠어요 — 건너뛰기" }).click();
  await expect(page).toHaveURL(/\/summary\?/);

  await expect(page.getByText("집 안 운반")).toBeVisible();
  await expect(page.getByText("조립", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "이 조건으로 3개 보기" }).click();
  await expect(page).toHaveURL(/\/results\?/);

  await expect(page.getByRole("heading", { name: "후보 3개 한눈에 비교" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("button", { name: "판매처 보기" }).first()).toBeDisabled();
  await expectNoSeriousA11yViolations(page);
  await expect(page).toHaveScreenshot("results.png", {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
  });

  await page.getByRole("link", { name: "자세히 판단하기" }).first().click();
  await expect(page.getByRole("heading", { name: "내 필수조건 충족표" })).toBeVisible();
  await expect(page.getByRole("button", { name: "정보 출처 열람" })).toBeDisabled();
  await page.getByRole("link", { name: "추가비용 가능성 확인" }).click();
  await expect(page.getByRole("heading", { name: "추가비용이 생길 수 있는 경우" })).toBeVisible();
  await expect(page.getByRole("button", { name: "판매처에서 자세히 보기" })).toBeDisabled();
});

test("데모 이동 차단과 DB 미설정 API가 성공을 위장하지 않음", async ({ request }) => {
  const go = await request.get(`/go/${DEMO_PRODUCT_ID}`);
  expect(go.status()).toBe(403);

  const ids = {
    session_id: "00000000-0000-4000-8000-000000000021",
    journey_id: "00000000-0000-4000-8000-000000000022",
  };
  const event = await request.post("/api/events", {
    data: {
      ...ids,
      run_id: null,
      event_version: 2,
      cohort: null,
      event_type: "results_view",
      payload: {},
    },
  });
  expect(event.status()).toBe(503);

  const feedback = await request.post("/api/feedback", {
    data: {
      ...ids,
      run_id: null,
      q_time_saved: 4,
      q_conditions_reflected: 4,
      q_reasons_helpful: 4,
      q_decision_confidence: 4,
      q_found_candidate: true,
      q_would_reuse: true,
      q_worst_question: "없었어요",
      chosen_product_id: null,
      post_purchase_optin: false,
    },
  });
  expect(feedback.status()).toBe(503);
});
