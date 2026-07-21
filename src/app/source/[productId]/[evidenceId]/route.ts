import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/data-mode";
import { getOperationalProductState } from "@/lib/products";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/uuid";

export async function GET(
  req: Request,
  {
    params,
  }: { params: Promise<{ productId: string; evidenceId: string }> }
): Promise<Response> {
  if (isDemoMode()) {
    return Response.json(
      { error: "demo_mode", message: "데모에서는 출처 이동을 제공하지 않습니다." },
      { status: 403 }
    );
  }
  const { productId, evidenceId: evidenceRaw } = await params;
  if (!isUuid(productId) || !/^\d+$/.test(evidenceRaw) || !isSupabaseConfigured()) {
    return new Response(null, { status: 404 });
  }

  const operational = await getOperationalProductState(productId);
  if (
    !operational ||
    operational.status !== "public" ||
    operational.availability !== "in_stock"
  ) {
    return Response.json({ error: "product_unavailable" }, { status: 409 });
  }

  const db = supabaseAdmin();
  const runRaw = new URL(req.url).searchParams.get("run");
  const runId = isUuid(runRaw) ? runRaw : null;
  type EvidenceTarget = {
    id: number;
    product_id: string;
    field_group: string;
    source_url: string;
  };
  let evidence: EvidenceTarget | null = null;

  if (runId) {
    const { data: run } = await db
      .from("recommendation_runs")
      .select("result_snapshot")
      .eq("id", runId)
      .maybeSingle();
    const snapshot = run?.result_snapshot as
      | { candidates?: Array<{ product?: { id?: string; evidence?: EvidenceTarget[] } }> }
      | undefined;
    const product = snapshot?.candidates
      ?.map((candidate) => candidate.product)
      .find((candidate) => candidate?.id === productId);
    const target = product?.evidence?.find(
      (item) => item.id === Number(evidenceRaw)
    );
    if (target) evidence = { ...target, product_id: productId };
  }

  if (!evidence) {
    const { data, error } = await db
      .from("product_evidence")
      .select("id,product_id,field_group,source_url")
      .eq("id", Number(evidenceRaw))
      .eq("product_id", productId)
      .maybeSingle();
    if (error || !data) return new Response(null, { status: 404 });
    evidence = data as EvidenceTarget;
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(evidence.source_url);
    if (!['https:', 'http:'].includes(sourceUrl.protocol)) throw new Error("protocol");
  } catch {
    return new Response(null, { status: 409 });
  }

  const cookieStore = await cookies();
  const sessionRaw = cookieStore.get("sid")?.value ?? null;
  const journeyRaw = cookieStore.get("jid")?.value ?? null;
  const sessionId = isUuid(sessionRaw) ? sessionRaw : crypto.randomUUID();
  const journeyId = isUuid(journeyRaw) ? journeyRaw : crypto.randomUUID();
  const isTest = cookieStore.get("modoo_test")?.value === "1";
  const cohort = isTest ? cookieStore.get("modoo_cohort")?.value ?? null : null;

  const { error: eventError } = await db.from("events").insert({
    session_id: sessionId,
    journey_id: journeyId,
    run_id: runId,
    event_version: 2,
    cohort,
    is_test: isTest,
    event_type: "source_open",
    payload: {
      productId,
      evidenceId: evidence.id,
      fieldGroup: evidence.field_group,
      via: "source",
    },
  });
  if (eventError) console.error("source_open insert 실패:", eventError.message);

  const response = NextResponse.redirect(sourceUrl, 302);
  if (!isUuid(sessionRaw)) {
    response.cookies.set("sid", sessionId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  if (!isUuid(journeyRaw)) {
    response.cookies.set("jid", journeyId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}
