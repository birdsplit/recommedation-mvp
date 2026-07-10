import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  AdminDataSetupError,
  createExportCsv,
  exportContentDisposition,
  isExportKind,
  loadExportRows,
} from "@/lib/admin-analytics";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string }> }
): Promise<Response> {
  if (!(await isAdminAuthenticated())) {
    return Response.json(
      { error: "관리자 인증이 필요합니다." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { kind } = await params;
  if (!isExportKind(kind)) {
    return Response.json(
      { error: "지원하지 않는 내보내기 종류입니다." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const rows = await loadExportRows(kind);
    const csv = createExportCsv(kind, rows);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": exportContentDisposition(kind),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AdminDataSetupError) {
      return Response.json(
        { error: "Supabase 데이터 연결이 필요합니다." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    console.error(`${kind} CSV 내보내기 실패:`, error);
    return Response.json(
      { error: "CSV를 만드는 중 오류가 발생했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
