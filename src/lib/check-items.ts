/**
 * 판매처 이동 전 확인사항 목록 생성 (화면10).
 * 순수 함수 — 서버 컴포넌트와 클라이언트 양쪽에서 호출된다.
 */
export function buildCheckItems(opts: {
  unknownParts: string[];
  scheduledDelivery: boolean;
  hasExtraCostRisk: boolean;
}): string[] {
  const items = ["재고와 실제 배송일이 오늘 기준으로 맞는지"];
  if (opts.unknownParts.length > 0) {
    items.push(`${opts.unknownParts.join("·")} 금액이 얼마인지`);
  }
  if (opts.hasExtraCostRisk) {
    items.push("우리 지역 추가 배송비가 붙는지");
  } else {
    items.push("색상·옵션에 따라 가격이 달라지는지");
  }
  if (opts.scheduledDelivery) {
    items.push("원하는 날짜로 지정일 배송이 되는지");
  }
  return items.slice(0, 4);
}
