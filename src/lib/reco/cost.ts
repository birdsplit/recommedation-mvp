import type { Answers, CostBreakdown, Product } from "./types";

/**
 * 총비용 계산 (기획서 제품 원칙 3·7).
 * 모르는 금액은 절대 지어내지 않는다 — knownTotal에서 빼고 unknownParts로 알린다.
 */

/** 사용자의 Q2 답변 기준으로 설치(조립) 서비스 비용이 총비용에 포함돼야 하는지 */
export function needsInstallation(answers: Answers): boolean {
  return answers.carry === "carry_only" || answers.carry === "need_both";
}

export function computeCost(p: Product, answers: Answers): CostBreakdown {
  const unknownParts: string[] = [];
  let knownTotal = p.price + p.shipping_fee;

  const installationNeeded = needsInstallation(answers);
  let installationFee: number | null = null;
  if (installationNeeded) {
    if (p.installation_service === "included") {
      installationFee = 0;
    } else if (
      p.installation_service === "paid" &&
      p.installation_fee !== null
    ) {
      installationFee = p.installation_fee;
      knownTotal += p.installation_fee;
    } else if (p.installation_service !== "none") {
      // 'paid'인데 금액 미확인이거나 'unknown' — 금액은 판매처 확인 대상.
      // 'none'은 서비스가 없다고 확정된 것이므로 확인할 비용 자체가 없다
      // (직접 조립 가정은 carry 필터의 note와 reasons.ts 주의가 고지)
      unknownParts.push("설치·조립비");
    }
  }

  const mattressNeeded = answers.wantsMattress === true && !p.mattress_included;
  let mattressPrice: number | null = null;
  if (mattressNeeded) {
    if (p.mattress_price !== null) {
      mattressPrice = p.mattress_price;
      knownTotal += p.mattress_price;
    } else {
      unknownParts.push("매트리스 가격");
    }
  }

  return {
    price: p.price,
    shippingFee: p.shipping_fee,
    installationNeeded,
    installationFee,
    mattressNeeded,
    mattressPrice,
    knownTotal,
    unknownParts,
  };
}

export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}
