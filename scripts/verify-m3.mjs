import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다. 로컬에서는 `supabase status --output env` 값을 사용하세요."
  );
}

const port = Number(process.env.M3_PORT ?? 3310);
const appUrl = `http://127.0.0.1:${port}`;
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sessionId = randomUUID();
const reservedSessionId = randomUUID();
const serverOutput = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(appUrl);
      if (response.ok) return;
    } catch {
      // 서버가 뜰 때까지 재시도
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next.js 서버가 60초 안에 시작되지 않았습니다.\n${serverOutput.join("")}`);
}

async function postJson(pathname, body) {
  return fetch(`${appUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postEvent(eventType, payload = {}, sid = sessionId) {
  const response = await postJson("/api/events", {
    session_id: sid,
    event_type: eventType,
    payload,
  });
  assert(response.status === 204, `${eventType} 기록 실패: HTTP ${response.status}`);
}

async function cleanup() {
  await db.from("events").delete().in("session_id", [sessionId, reservedSessionId]);
  await db.from("feedback").delete().eq("session_id", sessionId);
}

const nextBin = path.resolve("node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});
for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    serverOutput.push(chunk);
    if (serverOutput.length > 100) serverOutput.shift();
  });
}

try {
  await waitForServer();
  await cleanup();

  const { data: products, count, error: productsError } = await db
    .from("products")
    .select("id", { count: "exact" })
    .eq("status", "public")
    .limit(1);
  assert(!productsError, `상품 조회 실패: ${productsError?.message}`);
  assert(count === 10, `공개 시드 상품은 10개여야 합니다(현재 ${count ?? 0}개).`);
  const productId = products?.[0]?.id;
  assert(productId, "판매처 이동에 사용할 공개 상품이 없습니다.");

  const eventPlan = [
    ["visit", { path: "/" }],
    ["start_click", { entry: "questions" }],
    ["question_answer", { step: 1, answer: "any" }],
    ["question_answer", { step: 2, answer: "both" }],
    ["question_answer", { step: 3, answer: "skipped" }],
    ["questions_complete", { answers: { s: "any", c: "both" } }],
    ["summary_view", { query: "s=any&c=both" }],
    ["results_view", { candidateIds: [productId] }],
    ["product_detail_view", { productId, rank: 1, tier: "great" }],
    ["compare_add", { productId, compareCount: 1 }],
    ["cost_check", { productId, region: "서울", elevator: "yes" }],
  ];
  for (const [eventType, payload] of eventPlan) {
    await postEvent(eventType, payload);
  }

  const outbound = await fetch(
    `${appUrl}/go/${productId}?rank=1&via=cost_check`,
    { headers: { Cookie: `sid=${sessionId}` }, redirect: "manual" }
  );
  assert(outbound.status === 302, `판매처 이동은 302여야 합니다: ${outbound.status}`);
  assert(outbound.headers.get("location"), "판매처 Location 헤더가 없습니다.");

  const feedback = {
    session_id: sessionId,
    q_time_saved: 5,
    q_conditions_reflected: 5,
    q_reasons_helpful: 4,
    q_found_candidate: true,
    q_would_reuse: true,
    q_worst_question: "없었어요",
    chosen_product_id: productId,
    post_purchase_optin: true,
  };
  let response = await postJson("/api/feedback", feedback);
  assert(response.status === 200, `피드백 저장 실패: HTTP ${response.status}`);
  response = await postJson("/api/feedback", { ...feedback, q_time_saved: 4 });
  assert(response.status === 200, `피드백 재저장 실패: HTTP ${response.status}`);
  await postEvent("feedback_submit", { choseProduct: true });

  const expectedOrder = [
    ...eventPlan.map(([eventType]) => eventType),
    "outbound_click",
    "feedback_submit",
  ];
  const { data: events, error: eventsError } = await db
    .from("events")
    .select("id,event_type,payload")
    .eq("session_id", sessionId)
    .order("id", { ascending: true });
  assert(!eventsError, `이벤트 조회 실패: ${eventsError?.message}`);
  assert(
    JSON.stringify(events?.map((row) => row.event_type)) ===
      JSON.stringify(expectedOrder),
    `이벤트 순서 불일치: ${events?.map((row) => row.event_type).join(" → ")}`
  );
  const outboundEvent = events?.find((row) => row.event_type === "outbound_click");
  assert(outboundEvent?.payload?.via === "cost_check", "outbound via가 누락됐습니다.");
  assert(outboundEvent?.payload?.rank === 1, "outbound rank가 누락됐습니다.");

  const { data: feedbackRows, error: feedbackError } = await db
    .from("feedback")
    .select("session_id,q_time_saved,chosen_product_id,post_purchase_optin")
    .eq("session_id", sessionId);
  assert(!feedbackError, `피드백 조회 실패: ${feedbackError?.message}`);
  assert(feedbackRows?.length === 1, "세션당 피드백은 한 행이어야 합니다.");
  assert(feedbackRows[0].q_time_saved === 4, "재제출 피드백이 갱신되지 않았습니다.");
  assert(feedbackRows[0].chosen_product_id === productId, "선택 상품 연결이 잘못됐습니다.");

  await postEvent("post_purchase_submit", { reservedContractTest: true }, reservedSessionId);
  const { count: reservedCount, error: reservedError } = await db
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("session_id", reservedSessionId)
    .eq("event_type", "post_purchase_submit");
  assert(!reservedError && reservedCount === 1, "예약 이벤트 타입을 기록할 수 없습니다.");

  const unsupported = await fetch(`${appUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}",
  });
  assert(unsupported.status === 415, `잘못된 content type 응답: ${unsupported.status}`);
  const oversized = await postJson("/api/events", {
    session_id: sessionId,
    event_type: "visit",
    payload: { text: "가".repeat(2000) },
  });
  assert(oversized.status === 413, `과대 이벤트 응답: ${oversized.status}`);
  const invalidFeedback = await postJson("/api/feedback", {
    ...feedback,
    q_time_saved: 6,
  });
  assert(invalidFeedback.status === 400, `잘못된 피드백 응답: ${invalidFeedback.status}`);

  if (process.env.SUPABASE_ANON_KEY) {
    const anon = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: anonProducts, error: anonError } = await anon
      .from("products")
      .select("id")
      .limit(1);
    assert(
      anonError || !anonProducts || anonProducts.length === 0,
      "anon 키로 products를 읽을 수 있어 RLS 경계가 열려 있습니다."
    );
  }

  console.log(
    `M3 검증 통과: 공개 상품 ${count}개, 실제 이벤트 ${expectedOrder.length}행/11종, 피드백 upsert 1행, 예약 이벤트 1종, API 오류 경계 정상`
  );
} catch (error) {
  console.error(error);
  console.error(serverOutput.join(""));
  process.exitCode = 1;
} finally {
  await cleanup();
  server.kill("SIGTERM");
}
