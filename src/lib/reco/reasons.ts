import type { Tier } from "@/lib/constants";
import type {
  Answers,
  ConditionCheck,
  CostBreakdown,
  Product,
  Reason,
} from "./types";
import { formatWon } from "./cost";
import { DELIVERY_BUCKET_DAYS } from "./filter";
import { canAssemble, usesAssemblyService, type ScoreResult } from "./score";

/**
 * 추천 근거 생성 (기획서 §9.4) — 결정적 한국어 템플릿.
 * 어떤 상품·답변 조합에서도 맞는 이유 2개 + 주의 1개 이상 + 최종 한 문장이 나온다.
 */

function pickTop(pool: Reason[], count: number): Reason[] {
  const seen = new Set<string>();
  const result: Reason[] = [];
  for (const r of [...pool].sort((a, b) => b.weight - a.weight)) {
    if (seen.has(r.core)) continue;
    seen.add(r.core);
    result.push(r);
    if (result.length === count) break;
  }
  return result;
}

export function buildFitReasons(
  p: Product,
  answers: Answers,
  cost: CostBreakdown
): Reason[] {
  const pool: Reason[] = [];
  const deliveryKnown = !p.unknown_fields?.some(
    (field) => field === "delivery_days_min" || field === "delivery_days_max"
  );

  // 수납 조건 일치 (질문 1과 직결 — 가장 강한 이유)
  if (answers.storage === "big_items" && p.storage_type === "lift_up") {
    pool.push({
      weight: 10,
      core: "대형 수납",
      text: "침대 밑을 통째로 들어 올려 이불·계절옷 같은 큰 짐을 넣을 수 있어요",
    });
  }
  if (answers.storage === "drawers" && p.storage_type === "drawer") {
    pool.push({
      weight: 10,
      core: "서랍 수납",
      text: "서랍 수납으로 자잘한 짐을 깔끔하게 정리할 수 있어요",
    });
  }
  if (answers.storage === "robot_vacuum" && p.robot_vacuum_fit === "ok") {
    const height =
      p.under_bed_clearance_cm !== null
        ? `${p.under_bed_clearance_cm}cm 열려 있어`
        : "충분히 열려 있어";
    pool.push({
      weight: 10,
      core: "로봇청소기 청소",
      text: `하부가 ${height} 로봇청소기가 드나들 수 있어요`,
    });
  }
  if (
    answers.storage === "closed" &&
    (p.dust_blocking === "high" ||
      (["closed_base", "lift_up", "drawer"].includes(p.storage_type) &&
        p.dust_blocking !== "low"))
  ) {
    pool.push({
      weight: 10,
      core: "먼지 차단",
      // 차단력이 '보통'인 상품에 완전 밀폐처럼 읽히는 문구를 쓰지 않는다
      text:
        p.dust_blocking === "high"
          ? "하부가 막혀 있어 침대 밑에 먼지가 쌓이지 않아요"
          : "하부가 막힌 구조라 먼지 유입이 적은 편이에요",
    });
  }

  // 예산 안 (질문 3)
  if (answers.budget !== null) {
    if (
      answers.priceBasis === "total" &&
      cost.knownTotal <= answers.budget &&
      cost.unknownParts.length === 0
    ) {
      const comfortable = cost.knownTotal <= answers.budget * 0.8;
      pool.push({
        weight: 9,
        core: "총비용",
        text: comfortable
          ? `배송비까지 총 ${formatWon(cost.knownTotal)}으로 예산보다 여유 있게 저렴해요`
          : `배송비 포함 총 ${formatWon(cost.knownTotal)}으로 예산 안에 들어와요`,
      });
    }
    if (answers.priceBasis === "product_only" && p.price <= answers.budget) {
      pool.push({
        weight: 9,
        core: "가격",
        text: `상품가 ${formatWon(p.price)}으로 예산 안이에요`,
      });
    }
  }

  // 매트리스 (질문 3 선택)
  if (
    answers.wantsMattress === true &&
    p.mattress_included &&
    !p.unknown_fields?.includes("mattress_included")
  ) {
    pool.push({
      weight: 8,
      core: "매트리스 포함",
      text: "매트리스가 포함돼 있어 따로 고를 필요가 없어요",
    });
  }

  // 배송 여유
  if (answers.delivery !== "any" && deliveryKnown) {
    const limit = DELIVERY_BUCKET_DAYS[answers.delivery];
    if (p.delivery_days_max + 7 <= limit) {
      pool.push({
        weight: 8,
        core: "빠른 배송",
        text: `배송이 ${p.delivery_days_min}~${p.delivery_days_max}일로 원하는 기한보다 여유 있어요`,
      });
    }
  } else if (answers.delivery === "any" && deliveryKnown && p.delivery_days_max <= 7) {
    pool.push({
      weight: 6,
      core: "빠른 배송",
      text: `주문하면 ${p.delivery_days_min}~${p.delivery_days_max}일 안에 도착해요`,
    });
  }

  // 운반·조립 조건 일치 (질문 2)
  if (
    answers.carry === "service" &&
    p.carry_service_available &&
    !p.unknown_fields?.includes("carry_service_available")
  ) {
    pool.push({
      weight: 7,
      core: "운반 서비스",
      text: "집 안까지 옮겨주는 운반 서비스가 있어요",
    });
  }
  if (
    usesAssemblyService(answers) &&
    p.assembly_service_available &&
    !p.unknown_fields?.includes("assembly_service_available")
  ) {
    pool.push({
      weight: 7,
      core: "조립 서비스",
      text: "조립 서비스가 있어 직접 조립하지 않아도 돼요",
    });
  }
  if (canAssemble(answers) && p.self_assembly === "easy") {
    pool.push({
      weight: 6,
      core: "쉬운 조립",
      text: `혼자서도 어렵지 않게 조립할 수 있어요 (${p.assembly_tools ?? "기본 공구"})`,
    });
  }

  // 부가 선호 (§9.2)
  if (p.disassembly_ease === "easy") {
    pool.push({
      weight: 5,
      core: "이사 편의",
      text: "분해·재조립이 쉬워 이사할 때 부담이 적어요",
    });
  }
  if (answers.storage === "any" && p.robot_vacuum_fit === "ok") {
    pool.push({
      weight: 4,
      core: "청소 편의",
      text: "하부가 트여 있어 청소기가 쉽게 들어가요",
    });
  }
  if (answers.storage === "any" && p.dust_blocking === "high") {
    pool.push({
      weight: 3,
      core: "먼지 차단",
      text: "하부가 막혀 있어 먼지 관리가 편해요",
    });
  }

  // 폴백 — 어떤 조합에서도 2개를 보장
  if (p.recommended_for) {
    pool.push({
      weight: 2,
      core: "생활 조건",
      text: `이런 분께 잘 맞아요 — ${p.recommended_for}`,
    });
  }
  pool.push({
    weight: 1,
    core: "상품 규격",
    text:
      p.bed_size === "SS"
        ? "슈퍼싱글(SS) 규격이라 같은 규격의 매트리스를 고르기 쉬워요"
        : `${p.bed_size} 규격 프레임이에요 — 매트리스 규격을 함께 확인하세요`,
  });
  if (deliveryKnown) {
    pool.push({
      weight: 1,
      core: "배송 일정",
      text: `주문하면 ${p.delivery_days_min}~${p.delivery_days_max}일 안에 받을 수 있어요`,
    });
  } else {
    pool.push({
      weight: 1,
      core: "상품 규격",
      text: `${p.seller_name}에서 판매하는 ${p.bed_size} 규격 프레임이에요`,
    });
  }

  return pickTop(pool, 2);
}

export function buildCautions(
  p: Product,
  answers: Answers,
  cost: CostBreakdown,
  scoreResult: ScoreResult
): Reason[] {
  const pool: Reason[] = [];

  if (cost.unknownParts.length > 0) {
    pool.push({
      weight: 10,
      core: "추가 비용",
      // '금액은'으로 끝을 고정해 항목명에 따른 조사(은/는) 오류를 피한다
      text: `${cost.unknownParts.join("·")} 금액은 판매처에서 확인해야 해요 — 위 총비용에 포함되지 않았어요`,
    });
  }

  if (
    answers.storage === "robot_vacuum" &&
    p.robot_vacuum_fit === "check_height"
  ) {
    const height =
      p.under_bed_clearance_cm !== null
        ? `하부 ${p.under_bed_clearance_cm}cm`
        : "하부 높이";
    pool.push({
      weight: 9,
      core: "하부 높이",
      text: `${height} — 쓰시는 로봇청소기 높이를 꼭 확인하세요`,
    });
  }

  if (answers.carry === "friend" && p.carry_difficulty === "hard") {
    pool.push({
      weight: 8,
      core: "운반 인력",
      text: "혼자 옮기기 무거운 제품이에요 — 친구 일정을 미리 확인하세요",
    });
  }

  // 리뷰 리스크 — 감점이 클수록 앞에 (감점 0으로 상쇄된 리스크는 주의에서 제외)
  const assemble = canAssemble(answers);
  for (const { risk, penalty } of scoreResult.riskHits) {
    if (penalty <= 0) continue;
    const weight = 4 + penalty; // penalty 1~3 → weight 5~7
    switch (risk) {
      case "squeak":
        pool.push({
          weight,
          core: "삐걱임",
          text: assemble
            ? "삐걱임 리뷰가 있어요 — 나사를 조여주면 잡히는 수준이에요"
            : "삐걱임 리뷰가 있어요 — 소음에 민감하다면 피하는 게 좋아요",
        });
        break;
      case "wobble":
        pool.push({
          weight,
          core: "흔들림",
          text: assemble
            ? "흔들림 리뷰가 있어요 — 수평 조절과 나사 보강으로 줄일 수 있어요"
            : "흔들림 리뷰가 있어요",
        });
        break;
      case "smell":
        pool.push({
          weight,
          core: "초기 냄새",
          text: "초기 냄새 리뷰가 있어요 — 며칠 환기가 필요할 수 있어요",
        });
        break;
      case "assembly_hard":
        pool.push({
          weight,
          core: "조립 난이도",
          text: `조립이 어렵다는 리뷰가 있어요 — ${p.assembly_people}인 조립 권장${p.assembly_tools ? `, ${p.assembly_tools}` : ""}`,
        });
        break;
      case "manual_poor":
        pool.push({
          weight,
          core: "설명서",
          text: "설명서가 부실하다는 리뷰가 있어요 — 조립 영상을 미리 찾아보세요",
        });
        break;
      case "missing_parts":
        pool.push({
          weight,
          core: "부품 구성",
          text: "부품 누락 리뷰가 있어요 — 도착하면 부품부터 확인하세요",
        });
        break;
      case "delivery_delay":
        pool.push({
          weight,
          core: "배송 지연",
          text: "배송 지연 리뷰가 있어요 — 일정이 급하면 주문 전에 문의하세요",
        });
        break;
      case "finish_poor":
        pool.push({
          weight,
          core: "마감",
          text: "마감이 아쉽다는 리뷰가 있어요 — 수령 시 모서리를 확인하세요",
        });
        break;
      case "drawer_awkward":
        pool.push({
          weight,
          core: "서랍 사용성",
          text: "서랍이 불편하다는 리뷰가 있어요 — 여는 방향과 위치를 확인하세요",
        });
        break;
      case "extra_cost":
        pool.push({
          weight,
          core: "추가 배송비",
          text: "지역에 따라 추가 배송비가 붙을 수 있어요 — 주문 전 확인하세요",
        });
        break;
    }
  }

  // 배송 기한에 딱 맞는 경우
  if (answers.delivery !== "any") {
    const limit = DELIVERY_BUCKET_DAYS[answers.delivery];
    if (p.delivery_days_max === limit) {
      pool.push({
        weight: 6,
        core: "배송 기한",
        text: "최대 배송일이 기한에 딱 맞아요 — 지연되면 늦을 수 있어요",
      });
    }
  }

  if (p.data_confidence === "estimated") {
    pool.push({
      weight: 3,
      core: "추정 정보",
      text: "일부 정보는 추정값이에요 — 구매 전 판매처에서 확인하세요",
    });
  }

  // 폴백 — 최소 1개 보장 (core는 '확인'으로 끝나지 않는 명사구여야
  // 최종 한 문장 템플릿과 겹치지 않는다)
  pool.push({
    weight: 1,
    core: "재고·배송 일정",
    text: "구매 전 판매처에서 재고와 배송 일정을 최종 확인하세요",
  });

  return pickTop(pool, 3);
}

export function buildFinalJudgment(
  tier: Tier,
  fitReasons: Reason[],
  cautions: Reason[],
  checks: ConditionCheck[]
): string {
  if (tier === "not_fit") {
    const failed = checks
      .filter((c) => c.required && c.status === "not_met")
      .map((c) => c.label)
      .join(", ");
    return `지금 조건(${failed})과 맞지 않는 상품이에요.`;
  }
  const fit1 = fitReasons[0]?.core ?? "조건";
  const fit2 = fitReasons[1]?.core;
  const caution = cautions[0]?.core ?? "재고·배송 일정";
  if (tier === "great") {
    // 최상급("가장")은 쓰지 않는다 — great 상품이 동시에 여럿 노출될 수 있다
    const fits = fit2 ? `${fit1}·${fit2}` : fit1;
    return `${fits} 면에서 지금 조건과 잘 맞는 선택이에요. 구매 전 ${caution}도 확인해 주세요.`;
  }
  const hasUnknown = checks.some(
    (item) => item.required && item.status === "unknown"
  );
  return hasUnknown
    ? `${fit1} 면에서는 잘 맞지만, 일부 조건 정보와 ${caution} 확인이 필요한 후보예요.`
    : `${fit1} 면에서는 잘 맞지만, ${caution} 확인이 필요한 후보예요.`;
}
