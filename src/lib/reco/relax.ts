import type {
  Answers,
  Budget,
  DeliveryAnswer,
  Product,
  RelaxSuggestion,
} from "./types";
import { computeCost } from "./cost";
import { passesAll, runChecks } from "./filter";

/**
 * 빈 결과·후보 부족 시 조건 완화 제안 (기획서 §7.5).
 * 조건 하나만 바꿔 재계산하고, 실제로 후보가 늘어나는 제안만 보여준다.
 * 임의의 상품을 대신 추천하지 않는다.
 */

function countPassing(products: Product[], answers: Answers): number {
  return products.filter(
    (p) =>
      p.status === "public" &&
      passesAll(runChecks(p, answers, computeCost(p, answers)))
  ).length;
}

const DELIVERY_ORDER: DeliveryAnswer[] = [
  "this_week",
  "two_weeks",
  "one_month",
  "any",
];

const DELIVERY_RELAX_LABELS: Record<DeliveryAnswer, string> = {
  this_week: "일주일 안",
  two_weeks: "2주 안",
  one_month: "한 달 안",
  any: "상관없음",
};

const BUDGET_ORDER: Budget[] = [100000, 200000, 300000, null];

export function buildRelaxSuggestions(
  products: Product[],
  answers: Answers,
  currentCount: number
): RelaxSuggestion[] {
  const suggestions: RelaxSuggestion[] = [];

  // 배송일 완화 — 다음 구간부터 차례로, 처음으로 후보가 늘어나는 구간을 제안
  if (answers.delivery !== "any") {
    const rest = DELIVERY_ORDER.slice(
      DELIVERY_ORDER.indexOf(answers.delivery) + 1
    );
    for (const next of rest) {
      const relaxed: Answers = { ...answers, delivery: next };
      const gained = countPassing(products, relaxed) - currentCount;
      if (gained > 0) {
        suggestions.push({
          label:
            next === "any"
              ? "배송 시기를 열어두면"
              : `배송일을 ${DELIVERY_RELAX_LABELS[next]}으로 늘리면`,
          gained,
          relaxed,
        });
        break;
      }
    }
  }

  // 예산 완화
  if (answers.budget !== null) {
    const rest = BUDGET_ORDER.slice(BUDGET_ORDER.indexOf(answers.budget) + 1);
    for (const next of rest) {
      const relaxed: Answers = { ...answers, budget: next };
      const gained = countPassing(products, relaxed) - currentCount;
      if (gained > 0) {
        suggestions.push({
          label:
            next === null
              ? "예산을 열어두면"
              : `예산을 ${next / 10000}만원까지 늘리면`,
          gained,
          relaxed,
        });
        break;
      }
    }
  }

  // 수납 조건 완화
  if (answers.storage !== "any") {
    const relaxed: Answers = { ...answers, storage: "any" };
    const gained = countPassing(products, relaxed) - currentCount;
    if (gained > 0) {
      suggestions.push({ label: "수납 조건을 빼면", gained, relaxed });
    }
  }

  // 운반·조립 서비스 조건 완화
  if (answers.carry !== "both_ok" && answers.carry !== "friend_help") {
    const relaxed: Answers = { ...answers, carry: "both_ok" };
    const gained = countPassing(products, relaxed) - currentCount;
    if (gained > 0) {
      suggestions.push({
        label: "운반·조립을 직접 해결할 수 있다면",
        gained,
        relaxed,
      });
    }
  }

  return suggestions.sort((a, b) => b.gained - a.gained).slice(0, 3);
}
