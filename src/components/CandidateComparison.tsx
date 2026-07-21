import { STORAGE_TYPE_LABELS } from "@/lib/constants";
import { formatWon } from "@/lib/reco/cost";
import type { Recommendation } from "@/lib/reco/types";
import { TrackedLink } from "@/components/Track";

interface ComparisonRow {
  label: string;
  value: (rec: Recommendation) => string;
}

function carryAndAssembly(rec: Recommendation): string {
  const p = rec.product;
  const carry = p.unknown_fields?.includes("carry_service_available")
    ? "집 안 운반 방식 미확인"
    : p.carry_service_available
      ? "집 안 운반 서비스 있음"
      : p.carry_difficulty === null
        ? "운반 방식 미확인"
        : `직접 운반 ${p.carry_difficulty === "easy" ? "쉬움" : p.carry_difficulty === "medium" ? "보통" : "어려움"}`;
  const assembly = p.unknown_fields?.includes("assembly_service_available")
    ? "조립 서비스 여부 미확인"
    : p.assembly_service_available
      ? "조립 서비스 있음"
      : p.self_assembly === null
        ? "조립 방식 미확인"
        : p.self_assembly === "not_possible"
          ? "직접 조립 불가"
          : `직접 조립 ${p.self_assembly === "easy" ? "쉬움" : p.self_assembly === "medium" ? "보통" : "어려움"} · ${p.assembly_people}인`;
  return `${carry} · ${assembly}`;
}

const ROWS: ComparisonRow[] = [
  {
    label: "총비용",
    value: (rec) =>
      rec.cost.unknownParts.length === 0
        ? `확인된 ${formatWon(rec.cost.knownTotal)}`
        : `확인된 ${formatWon(rec.cost.knownTotal)} + ${rec.cost.unknownParts.join("·")} 미확인`,
  },
  {
    label: "배송기간",
    value: (rec) =>
      `${rec.product.delivery_days_min}~${rec.product.delivery_days_max}일`,
  },
  {
    label: "수납·하부",
    value: (rec) => {
      const p = rec.product;
      const clearance =
        p.under_bed_clearance_cm === null
          ? "하부 높이 미확인"
          : `하부 ${p.under_bed_clearance_cm}cm`;
      return `${STORAGE_TYPE_LABELS[p.storage_type]} · ${clearance}`;
    },
  },
  { label: "운반·조립", value: carryAndAssembly },
  {
    label: "가장 큰 장점",
    value: (rec) => rec.fitReasons[0]?.text ?? "확인된 장점 없음",
  },
  {
    label: "중요한 위험",
    value: (rec) => rec.cautions[0]?.text ?? "추가 확인 필요",
  },
];

/** 결과 첫 화면의 후보 3개 요약 비교. 첫 열을 고정해 모바일에서도 맥락을 잃지 않는다. */
export function CandidateComparison({
  candidates,
  runId,
}: {
  candidates: Recommendation[];
  runId?: string | null;
}) {
  if (candidates.length === 0) return null;

  return (
    <section aria-labelledby="candidate-comparison-title" className="mt-5">
      <div className="flex items-end justify-between gap-3 px-5">
        <div>
          <p className="text-[13px] font-bold text-coral-700">먼저 차이만 볼게요</p>
          <h2
            id="candidate-comparison-title"
            className="mt-1 text-[19px] font-extrabold"
          >
            후보 {candidates.length}개 한눈에 비교
          </h2>
        </div>
        <span className="text-[13px] font-semibold text-faint">
          ↔ 차이 항목 강조
        </span>
      </div>

      <div
        className="mx-5 mt-3 overflow-x-auto rounded-[24px] bg-white shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B382F]"
        role="region"
        aria-label="추천 후보 3개 비교표. 좌우로 스크롤해 모든 상품을 확인할 수 있습니다."
        tabIndex={0}
      >
        <table className="min-w-[680px] w-full table-fixed border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[116px] bg-[#FFFDF8] px-3 py-4 text-[13px] font-extrabold text-faint">
                비교 항목
              </th>
              {candidates.map((rec, index) => (
                <th
                  key={rec.product.id}
                  scope="col"
                  className="w-[188px] border-l border-[#F2E8DD] px-3 py-4 align-top"
                >
                  <span className="block text-[13px] font-extrabold text-coral-700">
                    후보 {index + 1}
                  </span>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-1 text-[13px] font-extrabold ${
                      rec.conditionStatus === "unknown"
                        ? "bg-honey-50 text-honey-700"
                        : "bg-leaf-50 text-leaf-700"
                    }`}
                  >
                    {rec.conditionStatus === "unknown"
                      ? "? 확인 필요 후보"
                      : "✓ 필수조건 확인"}
                  </span>
                  <span className="mt-1 block text-[13px] font-extrabold leading-snug">
                    {rec.product.name}
                  </span>
                  <span className="mt-1 block text-[13px] font-medium text-faint">
                    {rec.product.seller_name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const values = candidates.map(row.value);
              const differs = new Set(values).size > 1;
              return (
                <tr key={row.label}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-t border-[#F2E8DD] bg-[#FFFDF8] px-3 py-3 align-top text-[13px] font-extrabold text-sub"
                  >
                    {row.label}
                  </th>
                  {values.map((value, index) => (
                    <td
                      key={candidates[index].product.id}
                      className={`border-l border-t border-[#F2E8DD] px-3 py-3 align-top text-[13px] font-semibold leading-relaxed ${
                        differs ? "bg-peach-50" : "bg-white"
                      }`}
                    >
                      {differs && (
                        <span className="mb-1 block text-[13px] font-extrabold text-coral-700">
                          ↔ 차이
                        </span>
                      )}
                      {value}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 pt-4">
        <TrackedLink
          event="compare_add"
          payload={{ mode: "all_candidates", candidateCount: candidates.length }}
          runId={runId}
          href="#candidate-details"
          className="flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] py-4 text-[16px] font-extrabold text-white shadow-cta"
        >
          {candidates.length}개 자세히 비교하기
        </TrackedLink>
      </div>
    </section>
  );
}
