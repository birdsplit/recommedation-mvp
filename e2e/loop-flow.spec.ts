import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoSeriousA11yViolations(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  const violations = result.violations.filter(
    (item) => item.impact === "serious" || item.impact === "critical"
  );
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test("반응 루프: 진입 → 반응 → 기준 확정 → 최종 후보와 접근성", async ({
  page,
}) => {
  // 랜딩에서 loop 팔로 배정하고 CTA로 진입한다.
  await page.goto("/?mode=loop");
  await page.getByRole("link", { name: "침대 후보 찾기" }).click();
  await expect(page).toHaveURL(/\/browse\/intake/);

  // intake 3단계 — 객관적 제약만 고른다.
  await page.getByRole("button", { name: "집 안 운반 서비스가 필요해요" }).click();
  await page.getByRole("button", { name: "직접 조립할 수 있어요" }).click();
  await page.getByRole("button", { name: "예산 조건 고르기" }).click();

  await page.getByRole("button", { name: "20만원 이하" }).click();
  await page.getByRole("button", { name: "배송 조건 고르기" }).click();

  await page.getByRole("button", { name: "2주 안" }).click();
  await page.getByRole("button", { name: "프레임만 필요해요" }).click();
  await page.getByRole("button", { name: "침대 둘러보기" }).click();

  // /browse — 검토한 침대 수(공개 10개)가 노출된다.
  await expect(page).toHaveURL(/\/browse(\?|$)/);
  await expect(
    page.getByRole("heading", { name: /검토한 침대 10개/ })
  ).toBeVisible();

  // 후보 2개를 '청소가 걱정돼요'로 제외한다.
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole("button", { name: "제외", exact: true }).first().click();
    await page.getByRole("button", { name: "청소가 걱정돼요" }).click();
    await page.getByRole("button", { name: "제외하기" }).click();
  }

  // 임계치(2)를 넘으면 확인 카드가 뜬다 → 필수 조건으로.
  await expect(
    page.getByText("하부 청소가 편한 침대가 중요하신가요?")
  ).toBeVisible();
  await page.getByRole("button", { name: "필수 조건으로" }).click();

  // 재정렬 설명 배너와 기준판의 필수 항목을 확인한다.
  await expect(page.getByText(/필수 조건으로 추가했어요/)).toBeVisible();
  const board = page.getByRole("region", { name: "내가 정한 기준" });
  await expect(board.getByText("필수", { exact: true })).toBeVisible();
  await expect(board.getByText("하부 청소 편의")).toBeVisible();

  // 후보 1개를 저장한다.
  await page.getByRole("button", { name: "저장", exact: true }).first().click();
  await page.getByRole("button", { name: "저장하기" }).click();

  // 최종 후보로 이동한다.
  await page.getByRole("button", { name: /최종 후보 보기/ }).click();
  await expect(page).toHaveURL(/\/browse\/shortlist/);

  // 최종 후보는 최대 3개이며 저장 배지가 보인다.
  const detailLinks = page.getByRole("link", { name: "자세히 판단하기" });
  const count = await detailLinks.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(3);
  await expect(page.getByText("저장한 후보").first()).toBeVisible();

  // 데모에서는 판매처 이동이 비활성화된다.
  await expect(
    page.getByRole("button", { name: "판매처 보기" }).first()
  ).toBeDisabled();

  await expectNoSeriousA11yViolations(page);
});
