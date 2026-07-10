import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
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

const port = Number(process.env.M4_PORT ?? 3311);
const appUrl = `http://127.0.0.1:${port}`;
const adminPassword = process.env.ADMIN_PASSWORD ?? `m4-${randomUUID()}`;
const adminCookieSecret =
  process.env.ADMIN_COOKIE_SECRET ?? randomBytes(48).toString("base64url");
const serverEnvironment = {
  ...process.env,
  ADMIN_PASSWORD: adminPassword,
  ADMIN_COOKIE_SECRET: adminCookieSecret,
};
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runId = randomUUID();
const eventSessionId = randomUUID();
const feedbackSessionId = randomUUID();
const productName = `M4 검증 상품 ${runId}`;
const updatedProductName = `M4 수정 상품 ${runId}`;
const invalidProductName = `M4 거부 상품 ${runId}`;
const sellerUrl = `https://example.com/m4-verification/${runId}`;
const csvSpecialValue = `=M4-${runId}, "따옴표"\n둘째 줄`;
const serverOutput = [];
let createdProductId = null;

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

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await request(`${appUrl}/admin/login`, {
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

function resolveLocation(response, expectedPathname, label) {
  const location = response.headers.get("location");
  assert(location, `${label}: Location 헤더가 없습니다.`);
  const url = new URL(location, appUrl);
  assert(
    url.pathname === expectedPathname,
    `${label}: ${expectedPathname} 대신 ${url.pathname}(으)로 이동했습니다.`
  );
  return url;
}

function cookiePair(setCookie) {
  assert(setCookie, "로그인 응답에 Set-Cookie 헤더가 없습니다.");
  return setCookie.split(";", 1)[0];
}

function assertLoginRedirect(response, label) {
  assert(
    [303, 307, 308].includes(response.status),
    `${label}: 로그인 redirect 대신 HTTP ${response.status} 응답을 반환했습니다.`
  );
  resolveLocation(response, "/admin/login", label);
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

function parseAttributes(source) {
  const attributes = new Map();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    attributes.set(
      match[1].toLowerCase(),
      decodeHtml(match[2] ?? match[3] ?? match[4] ?? "")
    );
  }
  return attributes;
}

function findForm(html, predicate, label) {
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const form = { attributes: parseAttributes(match[1]), body: match[2] };
    if (predicate(form)) return form;
  }
  throw new Error(`${label} 폼을 HTML에서 찾지 못했습니다.`);
}

function hiddenFields(form) {
  const fields = [];
  for (const match of form.body.matchAll(/<input\b([^>]*)>/gi)) {
    const attributes = parseAttributes(match[1]);
    if (attributes.get("type")?.toLowerCase() !== "hidden") continue;
    const name = attributes.get("name");
    if (name) fields.push([name, attributes.get("value") ?? ""]);
  }
  return fields;
}

async function submitHtmlForm({ pageUrl, form, cookie, fields }) {
  const body = new FormData();
  for (const [name, value] of hiddenFields(form)) body.append(name, value);
  for (const [name, value] of fields) {
    body.delete(name);
    if (Array.isArray(value)) {
      for (const item of value) body.append(name, item);
    } else if (value !== null && value !== undefined) {
      body.append(name, value);
    }
  }

  const action = form.attributes.get("action") || pageUrl;
  return request(new URL(action, pageUrl), {
    method: (form.attributes.get("method") || "get").toUpperCase(),
    headers: {
      Accept: "text/html",
      Cookie: cookie,
      Origin: appUrl,
      Referer: pageUrl,
    },
    body,
    redirect: "manual",
  });
}

function productFields(overrides = {}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const values = {
    name: productName,
    seller_name: "M4 검증 판매처",
    seller_url: sellerUrl,
    image_url: "",
    price: "123456",
    shipping_fee: "12000",
    installation_service: "none",
    installation_fee: "",
    mattress_included: null,
    mattress_price: "89000",
    delivery_days_min: "2",
    delivery_days_max: "4",
    scheduled_delivery: "on",
    width_cm: "110",
    length_cm: "200",
    height_cm: "30",
    bed_size: "SS",
    material: "M4 검증 소재",
    storage_type: "drawer",
    under_bed_clearance_cm: "",
    has_outlet: "on",
    has_headboard: "on",
    colors: "아이보리, 검정",
    storage_capacity: "medium",
    dust_blocking: "high",
    cleaning_ease: "easy",
    robot_vacuum_fit: "no",
    carry_difficulty: "medium",
    carry_service_available: "on",
    self_assembly: "medium",
    assembly_service_available: null,
    assembly_people: "2",
    assembly_tools: "육각렌치",
    disassembly_ease: "easy",
    review_risks: ["squeak", "extra_cost"],
    recommended_for: "M4 자동 검증",
    not_recommended_for: "실제 판매용 아님",
    data_confidence: "confirmed",
    source_note: "verify:m4 자동 생성 후 정리",
    last_verified_at: "2020-01-01",
    status: "hidden",
    ...overrides,
  };
  if (values.last_verified_at === "today") values.last_verified_at = today;
  return Object.entries(values);
}

async function getPage(pathname, cookie) {
  return request(`${appUrl}${pathname}`, {
    headers: cookie ? { Cookie: cookie } : undefined,
    redirect: "manual",
  });
}

async function cleanup() {
  await db.from("feedback").delete().in("session_id", [feedbackSessionId]);
  await db.from("events").delete().in("session_id", [eventSessionId]);
  if (createdProductId) {
    await db.from("feedback").delete().eq("chosen_product_id", createdProductId);
    await db.from("products").delete().eq("id", createdProductId);
  }
  await db.from("products").delete().eq("seller_url", sellerUrl);
}

const nextBin = path.resolve("node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
  cwd: process.cwd(),
  env: serverEnvironment,
  stdio: ["ignore", "pipe", "pipe"],
});

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

  const anonymousAdmin = await getPage("/admin");
  assert(
    [303, 307, 308].includes(anonymousAdmin.status),
    `미인증 /admin 응답이 redirect가 아닙니다: HTTP ${anonymousAdmin.status}`
  );
  resolveLocation(anonymousAdmin, "/admin/login", "미인증 관리자 진입");

  const loginPage = await getPage("/admin/login");
  assert(loginPage.status === 200, `로그인 화면 응답 실패: HTTP ${loginPage.status}`);
  const loginHtml = await loginPage.text();
  assert(loginHtml.includes('name="password"'), "로그인 화면에 비밀번호 입력란이 없습니다.");
  assert(loginHtml.includes('action="/api/admin/login"'), "로그인 폼 action이 올바르지 않습니다.");

  const badLogin = await request(`${appUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: `${adminPassword}-wrong` }),
    redirect: "manual",
  });
  assert(badLogin.status === 303, `잘못된 로그인 응답: HTTP ${badLogin.status}`);
  const badLocation = resolveLocation(badLogin, "/admin/login", "잘못된 로그인");
  assert(badLocation.searchParams.get("error") === "invalid", "잘못된 로그인 오류 코드가 없습니다.");
  assert(!badLogin.headers.get("set-cookie"), "잘못된 로그인에서 세션 쿠키가 발급됐습니다.");

  const goodLogin = await request(`${appUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: adminPassword }),
    redirect: "manual",
  });
  assert(goodLogin.status === 303, `올바른 로그인 응답: HTTP ${goodLogin.status}`);
  resolveLocation(goodLogin, "/admin", "올바른 로그인");
  const setCookie = goodLogin.headers.get("set-cookie");
  assert(/\bHttpOnly\b/i.test(setCookie ?? ""), "관리자 쿠키에 HttpOnly가 없습니다.");
  assert(/\bSameSite=Lax\b/i.test(setCookie ?? ""), "관리자 쿠키에 SameSite=Lax가 없습니다.");
  assert(
    /(?:^|;\s*)Path=\/(?:;|$)/i.test(setCookie ?? ""),
    "관리자 쿠키의 Path가 /가 아닙니다."
  );
  const adminCookie = cookiePair(setCookie);

  const tamperedCookie = `${adminCookie.slice(0, -1)}${adminCookie.endsWith("a") ? "b" : "a"}`;
  const tamperedAdmin = await getPage("/admin", tamperedCookie);
  assertLoginRedirect(tamperedAdmin, "변조 쿠키 관리자 대시보드");
  for (const pathname of ["/admin/products", "/admin/products/new"]) {
    const response = await getPage(pathname, tamperedCookie);
    assertLoginRedirect(response, `변조 쿠키 직접 접근 ${pathname}`);
  }

  const unauthorizedEventsCsv = await getPage("/api/admin/export/events");
  assert(
    unauthorizedEventsCsv.status === 401,
    `미인증 CSV 응답이 401이 아닙니다: ${unauthorizedEventsCsv.status}`
  );

  const invalidExport = await getPage("/api/admin/export/not-supported", adminCookie);
  assert(invalidExport.status === 400, `잘못된 CSV kind 응답: ${invalidExport.status}`);

  const { error: eventInsertError } = await db.from("events").insert({
    session_id: eventSessionId,
    event_type: "visit",
    payload: { note: csvSpecialValue },
  });
  assert(!eventInsertError, `CSV 검증 이벤트 준비 실패: ${eventInsertError?.message}`);
  const { error: feedbackInsertError } = await db.from("feedback").insert({
    session_id: feedbackSessionId,
    q_time_saved: 5,
    q_conditions_reflected: 4,
    q_reasons_helpful: 3,
    q_found_candidate: true,
    q_would_reuse: false,
    q_worst_question: csvSpecialValue,
    post_purchase_optin: false,
  });
  assert(!feedbackInsertError, `CSV 검증 피드백 준비 실패: ${feedbackInsertError?.message}`);

  for (const kind of ["events", "feedback"]) {
    const response = await getPage(`/api/admin/export/${kind}`, adminCookie);
    assert(response.status === 200, `${kind} CSV 응답 실패: HTTP ${response.status}`);
    assert(
      response.headers.get("content-type")?.startsWith("text/csv; charset=utf-8"),
      `${kind} CSV Content-Type이 올바르지 않습니다.`
    );
    const disposition = response.headers.get("content-disposition") ?? "";
    assert(disposition.startsWith("attachment;"), `${kind} CSV가 attachment가 아닙니다.`);
    assert(/filename="modoo-(events|feedback)-\d{8}\.csv"/.test(disposition), `${kind} CSV ASCII 파일명이 없습니다.`);
    assert(disposition.includes("filename*=UTF-8''"), `${kind} CSV UTF-8 파일명이 없습니다.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert(
      bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
      `${kind} CSV에 UTF-8 BOM이 없습니다.`
    );
    const csv = new TextDecoder("utf-8").decode(bytes);
    assert(csv.includes(runId), `${kind} CSV에 검증 행이 없습니다.`);
    if (kind === "feedback") {
      const expectedCell = `"'=M4-${runId}, ""따옴표""\n둘째 줄"`;
      assert(
        csv.includes(expectedCell),
        "feedback CSV가 쉼표·따옴표·줄바꿈 또는 수식 시작 문자를 안전하게 escape하지 않았습니다."
      );
    }
  }

  const dashboard = await getPage("/admin", adminCookie);
  assert(dashboard.status === 200, `인증 대시보드 응답 실패: HTTP ${dashboard.status}`);
  const dashboardHtml = await dashboard.text();
  assert(
    dashboardHtml.includes("/api/admin/export/events") &&
      dashboardHtml.includes("/api/admin/export/feedback") &&
      dashboardHtml.includes("/admin/products"),
    "관리자 대시보드의 CSV 또는 상품 관리 링크가 누락됐습니다."
  );

  const newProductPage = await getPage("/admin/products/new", adminCookie);
  assert(newProductPage.status === 200, `새 상품 화면 응답 실패: HTTP ${newProductPage.status}`);
  const newProductHtml = await newProductPage.text();
  const createForm = findForm(
    newProductHtml,
    (form) => form.body.includes('name="name"') && form.body.includes('name="seller_url"'),
    "새 상품"
  );

  const invalidCreate = await submitHtmlForm({
    pageUrl: `${appUrl}/admin/products/new`,
    form: createForm,
    cookie: adminCookie,
    fields: productFields({
      name: invalidProductName,
      seller_url: "javascript:alert(1)",
    }),
  });
  assert(
    invalidCreate.status === 200,
    `잘못된 상품 입력이 검증 화면으로 돌아오지 않았습니다: HTTP ${invalidCreate.status}`
  );
  const { count: invalidProductCount, error: invalidProductError } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("name", invalidProductName);
  assert(!invalidProductError, `거부 상품 조회 실패: ${invalidProductError?.message}`);
  assert(invalidProductCount === 0, "잘못된 상품 입력이 DB에 저장됐습니다.");

  const createResponse = await submitHtmlForm({
    pageUrl: `${appUrl}/admin/products/new`,
    form: createForm,
    cookie: adminCookie,
    fields: productFields(),
  });
  assert(
    [303, 307].includes(createResponse.status),
    `상품 생성 후 redirect되지 않았습니다: HTTP ${createResponse.status}`
  );
  const { data: createdProduct, error: createdProductError } = await db
    .from("products")
    .select("id,name,price,status,last_verified_at,review_risks")
    .eq("seller_url", sellerUrl)
    .maybeSingle();
  assert(!createdProductError, `생성 상품 조회 실패: ${createdProductError?.message}`);
  assert(createdProduct, "Server Action으로 상품이 생성되지 않았습니다.");
  createdProductId = createdProduct.id;
  assert(createdProduct.name === productName, "생성 상품명이 DB와 일치하지 않습니다.");
  assert(createdProduct.status === "hidden", "새 상품의 비공개 상태가 유지되지 않았습니다.");
  assert(createdProduct.last_verified_at === "2020-01-01", "새 상품 확인일이 저장되지 않았습니다.");
  assert(
    JSON.stringify(createdProduct.review_risks) === JSON.stringify(["squeak", "extra_cost"]),
    "복수 리뷰 리스크가 저장되지 않았습니다."
  );

  const createLocation = resolveLocation(
    createResponse,
    `/admin/products/${createdProductId}`,
    "상품 생성"
  );
  assert(createLocation.searchParams.get("saved") === "created", "상품 생성 완료 표시가 없습니다.");

  const editPath = `/admin/products/${createdProductId}`;
  const anonymousEditPage = await getPage(editPath);
  assertLoginRedirect(anonymousEditPage, "익명 상품 수정 화면 직접 접근");
  const tamperedEditPage = await getPage(editPath, tamperedCookie);
  assertLoginRedirect(tamperedEditPage, "변조 쿠키 상품 수정 화면 직접 접근");

  const editPage = await getPage(editPath, adminCookie);
  assert(editPage.status === 200, `상품 수정 화면 응답 실패: HTTP ${editPage.status}`);
  const editHtml = await editPage.text();
  assert(
    editHtml.includes("오늘로 확인일 갱신"),
    "상품 수정 화면에 오늘 날짜로 확인일을 갱신하는 컨트롤이 없습니다."
  );
  const editForm = findForm(
    editHtml,
    (form) => form.body.includes('name="name"') && form.body.includes('name="seller_url"'),
    "상품 수정"
  );
  const updateResponse = await submitHtmlForm({
    pageUrl: `${appUrl}${editPath}`,
    form: editForm,
    cookie: adminCookie,
    fields: productFields({
      name: updatedProductName,
      price: "234567",
      status: "public",
      last_verified_at: "today",
    }),
  });
  assert(
    [303, 307].includes(updateResponse.status),
    `상품 수정 후 redirect되지 않았습니다: HTTP ${updateResponse.status}`
  );

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const { data: updatedProduct, error: updatedProductError } = await db
    .from("products")
    .select("name,price,status,last_verified_at")
    .eq("id", createdProductId)
    .single();
  assert(!updatedProductError, `수정 상품 조회 실패: ${updatedProductError?.message}`);
  assert(updatedProduct.name === updatedProductName, "상품명 수정이 DB에 반영되지 않았습니다.");
  assert(updatedProduct.price === 234567, "상품가 수정이 DB에 반영되지 않았습니다.");
  assert(updatedProduct.status === "public", "상품 상태 수정이 DB에 반영되지 않았습니다.");
  assert(updatedProduct.last_verified_at === today, "검증일 갱신이 DB에 반영되지 않았습니다.");

  const productsPage = await getPage("/admin/products", adminCookie);
  assert(productsPage.status === 200, `상품 목록 응답 실패: HTTP ${productsPage.status}`);
  const productsHtml = await productsPage.text();
  assert(productsHtml.includes(updatedProductName), "수정한 상품이 관리자 목록에 표시되지 않습니다.");

  const soldOutForm = findForm(
    productsHtml,
    (form) => form.body.includes(`id="status-${createdProductId}"`),
    "상품 상태 즉시 변경"
  );
  let soldOutResponse;
  try {
    soldOutResponse = await submitHtmlForm({
      pageUrl: `${appUrl}/admin/products`,
      form: soldOutForm,
      cookie: adminCookie,
      fields: [["status", "sold_out"]],
    });
  } catch (error) {
    const { data: observedProduct } = await db
      .from("products")
      .select("status")
      .eq("id", createdProductId)
      .maybeSingle();
    throw new Error(
      `상품 상태 즉시 변경 요청이 완료되지 않았습니다. 제한 시간 뒤 DB 상태: ${observedProduct?.status ?? "조회 실패"}`,
      { cause: error }
    );
  }
  assert(
    [200, 303].includes(soldOutResponse.status),
    `상품 상태 즉시 변경 응답 실패: HTTP ${soldOutResponse.status}`
  );
  const { data: soldOutProduct, error: soldOutProductError } = await db
    .from("products")
    .select("status")
    .eq("id", createdProductId)
    .single();
  assert(!soldOutProductError, `품절 상태 조회 실패: ${soldOutProductError?.message}`);
  assert(soldOutProduct.status === "sold_out", "상태 즉시 변경이 DB에 반영되지 않았습니다.");

  const refreshedProductsPage = await getPage("/admin/products", adminCookie);
  assert(
    refreshedProductsPage.status === 200,
    `상태 변경 뒤 상품 목록 응답 실패: HTTP ${refreshedProductsPage.status}`
  );
  const publicForm = findForm(
    await refreshedProductsPage.text(),
    (form) => form.body.includes(`id="status-${createdProductId}"`),
    "상품 상태 공개 복원"
  );
  const publicResponse = await submitHtmlForm({
    pageUrl: `${appUrl}/admin/products`,
    form: publicForm,
    cookie: adminCookie,
    fields: [["status", "public"]],
  });
  assert(
    [200, 303].includes(publicResponse.status),
    `상품 상태 공개 복원 응답 실패: HTTP ${publicResponse.status}`
  );
  const { data: publicProduct, error: publicProductError } = await db
    .from("products")
    .select("status")
    .eq("id", createdProductId)
    .single();
  assert(!publicProductError, `공개 상태 조회 실패: ${publicProductError?.message}`);
  assert(publicProduct.status === "public", "상품 상태를 공개로 복원하지 못했습니다.");

  const logout = await request(`${appUrl}/api/admin/logout`, {
    method: "POST",
    headers: { Cookie: adminCookie, Origin: appUrl, Referer: `${appUrl}/admin` },
    redirect: "manual",
  });
  assert(logout.status === 303, `로그아웃 응답 실패: HTTP ${logout.status}`);
  resolveLocation(logout, "/admin/login", "로그아웃");
  const logoutCookie = logout.headers.get("set-cookie") ?? "";
  assert(/Max-Age=0/i.test(logoutCookie), "로그아웃에서 세션 쿠키를 만료시키지 않았습니다.");
  const editAfterLogout = await getPage(editPath);
  assertLoginRedirect(editAfterLogout, "로그아웃 후 상품 수정 화면 직접 접근");

  console.log(
    "M4 검증 통과: 관리자 인증·쿠키·직접 읽기 경계, 대시보드, 이벤트/피드백 CSV, 상품 입력 검증·생성·수정·상태 즉시 변경·확인일 갱신, 로그아웃 정상"
  );
} catch (error) {
  console.error(error);
  console.error(serverOutput.join(""));
  process.exitCode = 1;
} finally {
  await cleanup();
  await stopServer();
}
