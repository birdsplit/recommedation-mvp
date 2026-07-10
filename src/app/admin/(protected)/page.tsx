import type { Metadata } from "next";
import Link from "next/link";
import { loadAdminFunnel, type FunnelRow } from "@/lib/admin-analytics";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "관리자 대시보드",
};

const numberFormat = new Intl.NumberFormat("ko-KR");

function rateLabel(row: FunnelRow): string {
  if (row.previousRate === null) return "—";
  return `${row.previousRate.toLocaleString("ko-KR", {
    maximumFractionDigits: 1,
  })}%`;
}

function FunnelTable({ rows }: { rows: FunnelRow[] }) {
  return (
    <div className="overflow-hidden rounded-[28px] bg-white shadow-card">
      <div className="border-b border-[#F1E8DE] px-5 py-4">
        <h2 className="text-[16px] font-extrabold">핵심 행동 퍼널</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-faint">
          고유 사용자 수가 아닌 기록된 이벤트 수예요. 상세 열람처럼 반복 가능한
          행동은 전 단계 대비 100%를 넘을 수 있어요.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[55%]" />
            <col className="w-[18%]" />
            <col className="w-[27%]" />
          </colgroup>
          <thead className="bg-peach-50 text-[11px] font-bold text-faint">
            <tr>
              <th scope="col" className="px-4 py-3">
                단계
              </th>
              <th scope="col" className="px-2 py-3 text-right">
                이벤트 수
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                전 단계 대비
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.eventType}
                className={index === 0 ? undefined : "border-t border-[#F4ECE4]"}
              >
                <th scope="row" className="px-4 py-3.5 text-[13px] font-bold">
                  <span className="mr-2 text-[11px] text-coral-700">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {row.label}
                </th>
                <td className="px-2 py-3.5 text-right text-[14px] font-extrabold tabular-nums">
                  {numberFormat.format(row.count)}
                </td>
                <td className="px-3 py-3.5 text-right">
                  <span className="text-[12px] font-bold tabular-nums text-sub">
                    {rateLabel(row)}
                  </span>
                  <div className="ml-auto mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-[#F1E8DE]">
                    <div
                      className="h-full rounded-full bg-coral-500"
                      style={{
                        width: `${Math.min(100, row.previousRate ?? 0)}%`,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SetupState() {
  return (
    <section className="rounded-[28px] border border-[#F2D7C8] bg-white p-6 shadow-card">
      <p className="text-[28px]" aria-hidden="true">
        🔌
      </p>
      <h2 className="mt-2 text-[17px] font-extrabold">데이터 연결이 필요해요</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-sub">
        <code className="font-bold">.env.local</code>에 Supabase URL과 service
        role 키를 설정한 뒤 서버를 다시 시작해 주세요. 새 프로젝트라면 먼저
        <code className="ml-1 font-bold">supabase/schema.sql</code>을 적용해야 해요.
      </p>
    </section>
  );
}

function ErrorState() {
  return (
    <section className="rounded-[28px] border border-[#F5C8BC] bg-white p-6 shadow-card">
      <p className="text-[28px]" aria-hidden="true">
        ⚠️
      </p>
      <h2 className="mt-2 text-[17px] font-extrabold">
        분석 데이터를 불러오지 못했어요
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-sub">
        잠시 뒤 새로고침해 주세요. 계속되면 Supabase 연결과
        <code className="mx-1 font-bold">events</code>테이블 적용 여부를 확인해
        주세요.
      </p>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="mb-4 rounded-[24px] bg-honey-50 px-5 py-4">
      <h2 className="text-[14px] font-extrabold text-honey-700">
        아직 기록된 이벤트가 없어요
      </h2>
      <p className="mt-1 text-[12px] leading-relaxed text-sub">
        사용자 여정을 한 번 완료하면 아래 퍼널에 행동 수와 단계별 비율이
        표시돼요.
      </p>
    </section>
  );
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const funnel = await loadAdminFunnel();
  const canExport = funnel.status === "ready";

  return (
    <main className="min-h-dvh px-5 pb-14 pt-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold text-coral-700">ADMIN</p>
          <h1 className="mt-1 text-[24px] font-extrabold">검증 대시보드</h1>
          <p className="mt-1 text-[13px] text-sub">
            추천 여정의 이탈 지점을 한눈에 확인해요.
          </p>
        </div>
        <Link
          href="/admin/products"
          className="shrink-0 rounded-full border border-[#EADFD2] bg-white px-3.5 py-2 text-[12px] font-bold shadow-soft"
        >
          상품 관리
        </Link>
      </div>

      <section className="my-5 rounded-[24px] bg-peach-50 p-4">
        <p className="text-[12px] font-bold text-faint">익명 데이터 내보내기</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {canExport ? (
            <>
              <a
                href="/api/admin/export/events"
                download
                className="rounded-full bg-white px-4 py-2.5 text-[12px] font-extrabold text-coral-700 shadow-soft"
              >
                이벤트 CSV
              </a>
              <a
                href="/api/admin/export/feedback"
                download
                className="rounded-full bg-white px-4 py-2.5 text-[12px] font-extrabold text-coral-700 shadow-soft"
              >
                피드백 CSV
              </a>
            </>
          ) : (
            <span
              aria-disabled="true"
              className="rounded-full bg-white/70 px-4 py-2.5 text-[12px] font-bold text-faint"
            >
              데이터 연결 후 CSV를 받을 수 있어요
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          연락처 없이 익명 세션 ID 기준으로 내려받아요.
        </p>
      </section>

      {funnel.status === "setup" && <SetupState />}
      {funnel.status === "error" && <ErrorState />}
      {funnel.status === "ready" && (
        <>
          {funnel.isEmpty && <EmptyState />}
          <FunnelTable rows={funnel.rows} />
        </>
      )}
    </main>
  );
}
