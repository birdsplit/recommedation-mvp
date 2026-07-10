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

const port = Number(process.env.M5_PORT ?? 3312);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`M5_PORT가 올바른 TCP 포트가 아닙니다: ${process.env.M5_PORT}`);
}

const appUrl = `http://127.0.0.1:${port}`;
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const runId = randomUUID();
const outboundSessionId = randomUUID();
const feedbackSessionId = randomUUID();
const testSellerName = `M5 자동 검증 ${runId}`;
const testSellerUrlPrefix = `https://example.com/m5-verification/${runId}`;
const normalQuery = "s=any&c=both&pb=total&d=any";
const impossibleQuery = "s=big&c=svc&b=100000&pb=total&d=1w&m=1";
const serverOutput = [];
const testProductIds = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function request(input, options = {}) {
  return fetch(input, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(30_000),
  });
}

async function waitForServer(server) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `Next.js 서버가 준비되기 전에 종료됐습니다.\n${serverOutput.join("")}`
      );
    }
    try {
      const response = await request(appUrl, {
        signal: AbortSignal.timeout(3_000),
      });
      if (response.ok) return;
    } catch {
      // 개발 서버가 준비될 때까지 재시도한다.
    }
    await sleep(500);
  }
  throw new Error(
    `Next.js 서버가 60초 안에 시작되지 않았습니다.\n${serverOutput.join("")}`
  );
}

async function getPage(pathname, options = {}) {
  return request(`${appUrl}${pathname}`, {
    ...options,
    headers: {
      Accept: "text/html",
      "Cache-Control": "no-cache",
      ...(options.headers ?? {}),
    },
    redirect: options.redirect ?? "manual",
  });
}

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/g, (_match, decimal) =>
      String.fromCodePoint(Number(decimal))
    )
    .replace(/&#x([\da-f]+);/gi, (_match, hexadecimal) =>
      String.fromCodePoint(Number.parseInt(hexadecimal, 16))
    );
}

function visibleText(fragment) {
  return decodeHtml(
    fragment
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function articleBlocks(html) {
  return [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map(
    (match) => match[0]
  );
}

function productIdFromCard(card, index) {
  const match = /href="\/products\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\?|\")/i.exec(
    card
  );
  assert(match, `추천 카드 ${index + 1}에서 상품 상세 ID를 찾지 못했습니다.`);
  return match[1];
}

function assertCandidateCards(html, label) {
  const cards = articleBlocks(html);
  assert(cards.length === 3, `${label}: 추천 후보가 정확히 3개가 아닙니다(${cards.length}개).`);

  const ids = cards.map(productIdFromCard);
  assert(new Set(ids).size === 3, `${label}: 추천 후보 ID가 중복됐습니다.`);
  cards.forEach((card, index) => {
    const text = visibleText(card);
    assert(text.includes(`추천 ${index + 1} / 3`), `${label}: 카드 ${index + 1}의 추천 순위가 없습니다.`);
    assert(text.includes("예상 총비용"), `${label}: 카드 ${index + 1}의 총비용 항목이 없습니다.`);
    assert(text.includes("잘 맞는 이유"), `${label}: 카드 ${index + 1}의 맞는 이유가 없습니다.`);
    assert(
      /<div class="[^"]*bg-honey-50[^"]*px-3\.5 py-3[^"]*">[\s\S]*?<\/div>/i.test(card),
      `${label}: 카드 ${index + 1}의 주의 정보가 없습니다.`
    );
    assert(text.includes("출처:"), `${label}: 카드 ${index + 1}의 정보 출처가 없습니다.`);
    assert(
      /\d{4}\.\d{1,2}\.\d{1,2}\s+확인/.test(text),
      `${label}: 카드 ${index + 1}의 마지막 확인일이 없습니다.`
    );
  });

  return {
    ids,
    visibleCards: cards.map(visibleText),
  };
}

async function requireHtml(pathname, label) {
  const response = await getPage(pathname);
  assert(response.status === 200, `${label}: HTTP ${response.status}`);
  return response.text();
}

async function loadProductsApi(ids, label) {
  const response = await request(
    `${appUrl}/api/products?ids=${encodeURIComponent(ids.join(","))}`,
    { headers: { "Cache-Control": "no-cache" } }
  );
  assert(response.status === 200, `${label}: /api/products HTTP ${response.status}`);
  const body = await response.json();
  assert(Array.isArray(body.products), `${label}: products 배열이 없습니다.`);
  return body.products;
}

async function updateStatus(id, status) {
  const { data, error } = await db
    .from("products")
    .update({ status })
    .eq("id", id)
    .select("id,status")
    .single();
  assert(!error, `${id} 상태를 ${status}(으)로 바꾸지 못했습니다: ${error?.message}`);
  assert(data.status === status, `${id}의 DB 상태가 ${status}(이)가 아닙니다.`);
}

async function prepareSyntheticCandidates() {
  const { data: template, error: templateError } = await db
    .from("products")
    .select("*")
    .eq("status", "public")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  assert(!templateError && template, `공개 상품 템플릿 조회 실패: ${templateError?.message}`);

  const base = { ...template };
  delete base.id;
  delete base.created_at;
  delete base.updated_at;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const rows = [
    { suffix: "A", price: 50_001 },
    { suffix: "B", price: 50_002 },
  ].map(({ suffix, price }) => ({
    ...base,
    name: `M5 검증 후보 ${suffix} ${runId}`,
    seller_name: testSellerName,
    seller_url: `${testSellerUrlPrefix}/${suffix.toLowerCase()}`,
    image_url: null,
    price,
    shipping_fee: 0,
    installation_service: "none",
    installation_fee: null,
    mattress_included: false,
    mattress_price: 90_000,
    delivery_days_min: 1,
    delivery_days_max: 2,
    scheduled_delivery: true,
    storage_type: "none",
    storage_capacity: "none",
    dust_blocking: "high",
    cleaning_ease: "easy",
    robot_vacuum_fit: "no",
    carry_difficulty: "easy",
    carry_service_available: false,
    self_assembly: "easy",
    assembly_service_available: false,
    assembly_people: 1,
    assembly_tools: "공구 동봉",
    disassembly_ease: "easy",
    review_risks: [],
    has_outlet: true,
    has_headboard: true,
    recommended_for: "M5 자동 검증용 공개 후보",
    not_recommended_for: "실제 판매용 아님",
    data_confidence: "confirmed",
    source_note: "M5 자동 검증 출처",
    last_verified_at: today,
    status: "public",
  }));

  const { data, error } = await db
    .from("products")
    .insert(rows)
    .select("id,name,seller_url,status");
  assert(!error, `M5 후보 상품 준비 실패: ${error?.message}`);
  assert(data?.length === 2, `M5 후보 상품이 2개 생성되지 않았습니다.`);
  testProductIds.push(...data.map((product) => product.id));
  return data;
}

async function cleanup() {
  const errors = [];
  const feedbackResult = await db
    .from("feedback")
    .delete()
    .eq("session_id", feedbackSessionId);
  if (feedbackResult.error) errors.push(`feedback: ${feedbackResult.error.message}`);

  const eventsResult = await db
    .from("events")
    .delete()
    .eq("session_id", outboundSessionId);
  if (eventsResult.error) errors.push(`events: ${eventsResult.error.message}`);

  if (testProductIds.length > 0) {
    const productsResult = await db
      .from("products")
      .delete()
      .in("id", testProductIds);
    if (productsResult.error) errors.push(`products: ${productsResult.error.message}`);
  }
  return errors;
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

async function stopServer() {
  if (!server.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/pid", String(server.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true }
      );
      killer.once("error", () => {
        server.kill();
        resolve();
      });
      killer.once("exit", resolve);
    });
    return;
  }
  server.kill("SIGTERM");
}

try {
  await waitForServer(server);

  const partialHtml = await requireHtml(
    "/results?s=any&c=both&b=100000&pb=total&d=any",
    "후보 부족 결과"
  );
  const partialCards = articleBlocks(partialHtml);
  assert(partialCards.length === 1, `10만원 총비용 조건의 유효 후보가 1개가 아닙니다(${partialCards.length}개).`);
  assert(
    visibleText(partialCards[0]).includes("추천 1 / 1"),
    "후보가 부족할 때 카드 순위 분모가 실제 후보 수와 다릅니다."
  );
  const partialText = visibleText(partialHtml);
  assert(
    partialText.includes("후보가 1개뿐이에요") &&
      /후보\s+\d+\s*개\s+추가/.test(partialText),
    "후보가 1개뿐일 때 조건 완화 제안이 없습니다."
  );

  const syntheticCandidates = await prepareSyntheticCandidates();

  const flowStartedAt = Date.now();
  const landingHtml = await requireHtml("/", "무로그인 랜딩");
  const landingText = visibleText(landingHtml);
  assert(landingText.includes("로그인 없이 바로"), "랜딩에 무로그인 시작 안내가 없습니다.");
  assert(/href="\/q\/1"/.test(landingHtml), "랜딩에서 첫 질문으로 시작할 수 없습니다.");

  const questionPlan = [
    ["/q/1", "1 / 3", "침대 밑 공간"],
    ["/q/2?s=any", "2 / 3", "운반과 조립"],
    ["/q/3?s=any&c=both", "3 / 3", "예산과 필요한 시기"],
  ];
  for (const [pathname, progress, heading] of questionPlan) {
    const html = await requireHtml(pathname, `질문 ${progress}`);
    const text = visibleText(html);
    assert(text.includes(progress), `${pathname}: 3단계 진행 표시가 없습니다.`);
    assert(text.includes(heading), `${pathname}: 질문 내용이 올바르지 않습니다.`);
  }

  const summaryHtml = await requireHtml(`/summary?${normalQuery}`, "조건 요약");
  const summaryText = visibleText(summaryHtml);
  assert(summaryText.includes("내 조건 확인"), "질문 뒤 조건 요약 화면이 없습니다.");
  assert(summaryText.includes("이 조건으로 3개 보기"), "조건 요약에서 결과로 갈 수 없습니다.");

  const resultsPath = `/results?${normalQuery}`;
  const firstResultsHtml = await requireHtml(resultsPath, "정상 추천 결과 1차");
  const firstSnapshot = assertCandidateCards(firstResultsHtml, "정상 추천 결과 1차");
  assert(
    syntheticCandidates.every((candidate) => firstSnapshot.ids.includes(candidate.id)),
    "상태 전환용 공개 검증 후보가 추천 결과에 포함되지 않았습니다."
  );
  assert(
    Date.now() - flowStartedAt < 120_000,
    "무로그인 랜딩부터 결과까지 로컬 HTTP 흐름이 2분을 넘겼습니다."
  );

  const secondResultsHtml = await requireHtml(resultsPath, "정상 추천 결과 반복");
  const secondSnapshot = assertCandidateCards(secondResultsHtml, "정상 추천 결과 반복");
  assert(
    JSON.stringify(secondSnapshot.ids) === JSON.stringify(firstSnapshot.ids),
    "/results 반복 요청에서 후보 또는 순서가 달라졌습니다."
  );
  assert(
    JSON.stringify(secondSnapshot.visibleCards) ===
      JSON.stringify(firstSnapshot.visibleCards),
    "/results 반복 요청에서 표시 비용·근거 정보가 달라졌습니다."
  );

  const impossibleHtml = await requireHtml(
    `/results?${impossibleQuery}`,
    "불가능 조합 추천 결과"
  );
  const impossibleText = visibleText(impossibleHtml);
  assert(articleBlocks(impossibleHtml).length === 0, "불가능 조합에 임의 후보가 추천됐습니다.");
  assert(
    impossibleText.includes("지금 조건에 맞는 침대가 없어요"),
    "불가능 조합의 빈 결과 안내가 없습니다."
  );
  assert(
    impossibleText.includes("조건을 조금 바꿔볼까요?") ||
      impossibleText.includes("조건을 두 곳 이상 넓혀야 후보가 생겨요"),
    "불가능 조합에 조건 완화 방안이 없습니다."
  );
  assert(
    /href="\/(?:results\?|q\/[123]\?)/.test(impossibleHtml),
    "조건 완화 제안에서 실제 조건 수정 경로로 이동할 수 없습니다."
  );

  const [soldOutId, hiddenId] = testProductIds;
  await updateStatus(soldOutId, "sold_out");
  const soldOutResults = await requireHtml(resultsPath, "품절 제외 결과");
  const soldOutIds = assertCandidateCards(soldOutResults, "품절 제외 결과").ids;
  assert(!soldOutIds.includes(soldOutId), "품절 상품이 추천 결과에 남았습니다.");
  const soldOutApi = await loadProductsApi(
    [soldOutId, hiddenId],
    "품절 비교 API 제외"
  );
  assert(
    JSON.stringify(soldOutApi.map((product) => product.id)) ===
      JSON.stringify([hiddenId]),
    "비교 API가 품절 ID를 조용히 제외하거나 요청 순서를 유지하지 못했습니다."
  );

  await updateStatus(soldOutId, "public");
  await updateStatus(hiddenId, "hidden");
  const hiddenResults = await requireHtml(resultsPath, "비공개 제외 결과");
  const hiddenIds = assertCandidateCards(hiddenResults, "비공개 제외 결과").ids;
  assert(!hiddenIds.includes(hiddenId), "비공개 상품이 추천 결과에 남았습니다.");
  const hiddenApi = await loadProductsApi(
    [hiddenId, soldOutId],
    "비공개 비교 API 제외"
  );
  assert(
    JSON.stringify(hiddenApi.map((product) => product.id)) ===
      JSON.stringify([soldOutId]),
    "비교 API가 비공개 ID를 우아하게 제외하지 못했습니다."
  );

  await updateStatus(hiddenId, "public");
  const restoredResults = await requireHtml(resultsPath, "상태 복원 결과");
  const restoredIds = assertCandidateCards(restoredResults, "상태 복원 결과").ids;
  assert(
    JSON.stringify(restoredIds) === JSON.stringify(firstSnapshot.ids),
    "상품 상태 복원 뒤 원래 추천 후보와 순서가 돌아오지 않았습니다."
  );

  const outboundId = firstSnapshot.ids[0];
  const { data: outboundProduct, error: outboundProductError } = await db
    .from("products")
    .select("seller_url")
    .eq("id", outboundId)
    .single();
  assert(!outboundProductError, `판매처 이동 상품 조회 실패: ${outboundProductError?.message}`);
  const outbound = await getPage(`/go/${outboundId}?rank=1&via=results`, {
    headers: { Cookie: `sid=${outboundSessionId}` },
  });
  assert(outbound.status === 302, `판매처 이동이 302가 아닙니다: HTTP ${outbound.status}`);
  assert(
    outbound.headers.get("location") === outboundProduct.seller_url,
    "판매처 이동 Location이 상품 URL과 다릅니다."
  );
  const { data: outboundEvents, error: outboundEventsError } = await db
    .from("events")
    .select("event_type,payload")
    .eq("session_id", outboundSessionId);
  assert(!outboundEventsError, `판매처 이벤트 조회 실패: ${outboundEventsError?.message}`);
  assert(outboundEvents?.length === 1, "판매처 클릭 이벤트가 정확히 한 건 기록되지 않았습니다.");
  assert(outboundEvents[0].event_type === "outbound_click", "판매처 이벤트 종류가 다릅니다.");
  assert(
    outboundEvents[0].payload?.productId === outboundId &&
      outboundEvents[0].payload?.rank === 1 &&
      outboundEvents[0].payload?.via === "results",
    "판매처 이벤트의 최소 product/rank/via 계약이 지켜지지 않았습니다."
  );

  const feedbackResponse = await request(`${appUrl}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: feedbackSessionId,
      q_time_saved: 5,
      q_conditions_reflected: 5,
      q_reasons_helpful: 5,
      q_found_candidate: true,
      q_would_reuse: true,
      q_worst_question: "none",
      chosen_product_id: outboundId,
      post_purchase_optin: false,
    }),
  });
  assert(feedbackResponse.status === 200, `결과 피드백 저장 실패: HTTP ${feedbackResponse.status}`);
  const { data: feedbackRows, error: feedbackRowsError } = await db
    .from("feedback")
    .select("chosen_product_id,q_time_saved")
    .eq("session_id", feedbackSessionId);
  assert(!feedbackRowsError, `결과 피드백 조회 실패: ${feedbackRowsError?.message}`);
  assert(feedbackRows?.length === 1, "결과 피드백이 한 행으로 저장되지 않았습니다.");
  assert(
    feedbackRows[0].chosen_product_id === outboundId &&
      feedbackRows[0].q_time_saved === 5,
    "결과 피드백의 최소 상품 연결·척도 계약이 지켜지지 않았습니다."
  );

  console.log(
    "M5 검증 통과: 무로그인 3단계 질문·2분 내 결과, 후보 1개 분모·완화와 후보 3개 비용·근거·주의·신뢰정보, 결정성·필수필터, 품절/비공개 제외·비교 API, 판매처 측정·피드백 정상"
  );
} catch (error) {
  console.error(error);
  console.error(serverOutput.join(""));
  process.exitCode = 1;
} finally {
  const cleanupErrors = await cleanup();
  await stopServer();
  if (cleanupErrors.length > 0) {
    console.error(`M5 검증 데이터 정리 실패: ${cleanupErrors.join("; ")}`);
    process.exitCode = 1;
  }
}
