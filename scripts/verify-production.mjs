import { randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const rawAppUrl = process.env.PRODUCTION_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const adminPassword = process.env.ADMIN_PASSWORD;

const missingVariables = [
  ["PRODUCTION_URL", rawAppUrl],
  ["SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)", serviceRoleKey],
  ["ADMIN_PASSWORD", adminPassword],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingVariables.length > 0) {
  throw new Error(`Required environment variables are missing: ${missingVariables.join(", ")}`);
}
if (process.env.PRODUCTION_SMOKE_CONFIRM !== "run-production-smoke") {
  throw new Error(
    "This check writes temporary production data. Set PRODUCTION_SMOKE_CONFIRM=run-production-smoke to continue."
  );
}

function normalizeProductionUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PRODUCTION_URL must be an absolute URL.");
  }
  const allowHttp = process.env.PRODUCTION_SMOKE_ALLOW_HTTP === "1";
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    throw new Error(
      "PRODUCTION_URL must use HTTPS. Set PRODUCTION_SMOKE_ALLOW_HTTP=1 only for an intentional HTTP target."
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("PRODUCTION_URL cannot contain credentials, a query, or a fragment.");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("PRODUCTION_URL must point to the deployment root.");
  }
  return url.origin;
}

const appUrl = normalizeProductionUrl(rawAppUrl);
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runId = randomUUID();
const eventSessionId = randomUUID();
const feedbackSessionId = randomUUID();
const productName = `Production smoke product ${runId}`;
const updatedProductName = `Production smoke updated ${runId}`;
const sellerUrl = `https://example.invalid/modoo-production-smoke/${runId}`;
const csvMarker = `production-smoke-${runId}`;
const normalQuery = "s=any&c=both&pb=total&d=any";
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
    headers: {
      "User-Agent": "modoo-production-smoke/1.0",
      ...(options.headers ?? {}),
    },
    signal: options.signal ?? AbortSignal.timeout(30_000),
  });
}

async function waitForDeployment() {
  const deadline = Date.now() + 90_000;
  let lastStatus = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await request(appUrl, {
        headers: { Accept: "text/html", "Cache-Control": "no-cache" },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      lastStatus = `HTTP ${response.status}`;
      if (response.status === 200) return;
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : "request failed";
    }
    await sleep(1_000);
  }
  throw new Error(`The deployment did not become ready within 90 seconds (${lastStatus}).`);
}

function appRequest(pathname, options = {}) {
  return request(new URL(pathname, appUrl), options);
}

async function getPage(pathname, cookie) {
  return appRequest(pathname, {
    headers: {
      Accept: "text/html",
      "Cache-Control": "no-cache",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: "manual",
  });
}

async function requireHtml(pathname, label, cookie) {
  const response = await getPage(pathname, cookie);
  assert(response.status === 200, `${label}: expected HTTP 200, got ${response.status}.`);
  return response.text();
}

function resolveLocation(response, expectedPathname, label) {
  const location = response.headers.get("location");
  assert(location, `${label}: Location header is missing.`);
  const url = new URL(location, appUrl);
  assert(
    url.pathname === expectedPathname,
    `${label}: expected redirect to ${expectedPathname}, got ${url.pathname}.`
  );
  return url;
}

function cookiePair(setCookie) {
  assert(setCookie, "The login response did not set an admin cookie.");
  return setCookie.split(";", 1)[0];
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
      .replace(/<!--([\s\S]*?)-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
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
  throw new Error(`${label}: form not found in the rendered HTML.`);
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
  const values = {
    name: productName,
    seller_name: "Production smoke verification",
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
    material: "Production smoke material",
    storage_type: "drawer",
    under_bed_clearance_cm: "",
    has_outlet: "on",
    has_headboard: "on",
    colors: "ivory, black",
    storage_capacity: "medium",
    dust_blocking: "high",
    cleaning_ease: "easy",
    robot_vacuum_fit: "no",
    carry_difficulty: "medium",
    carry_service_available: "on",
    self_assembly: "medium",
    assembly_service_available: null,
    assembly_people: "2",
    assembly_tools: "hex key",
    disassembly_ease: "easy",
    review_risks: ["squeak", "extra_cost"],
    recommended_for: "Automated production smoke verification",
    not_recommended_for: "Real purchase",
    data_confidence: "confirmed",
    source_note: "",
    last_verified_at: "2020-01-01",
    status: "hidden",
    ...overrides,
  };
  return Object.entries(values);
}

function productIdsFromResults(html) {
  const ids = [];
  const pattern = /href="\/products\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\?|\")/gi;
  for (const match of html.matchAll(pattern)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

async function verifyPublicFlow() {
  const landingHtml = await requireHtml("/", "Landing page");
  assert(/href="\/q\/1(?:\?|\")/.test(landingHtml), "Landing page does not link to question 1.");

  const questionPaths = ["/q/1", "/q/2?s=any", "/q/3?s=any&c=both"];
  for (const [index, pathname] of questionPaths.entries()) {
    const html = await requireHtml(pathname, `Question ${index + 1}`);
    assert(
      visibleText(html).includes(`${index + 1} / 3`),
      `Question ${index + 1} does not show the expected progress.`
    );
  }

  const summaryHtml = await requireHtml(`/summary?${normalQuery}`, "Answer summary");
  assert(
    /href="\/results\?/.test(summaryHtml),
    "Answer summary does not link to recommendation results."
  );

  const resultsHtml = await requireHtml(`/results?${normalQuery}`, "Recommendation results");
  const productIds = productIdsFromResults(resultsHtml);
  assert(productIds.length === 3, `Expected 3 recommendation products, got ${productIds.length}.`);

  const detailHtml = await requireHtml(
    `/products/${productIds[0]}?${normalQuery}`,
    "Product detail"
  );
  const { data: selectedProduct, error: selectedProductError } = await db
    .from("products")
    .select("id,name,seller_url,status")
    .eq("id", productIds[0])
    .single();
  assert(!selectedProductError, `Could not match the result product in Supabase: ${selectedProductError?.message}`);
  assert(selectedProduct.status === "public", "The result page exposed a non-public product.");
  assert(
    visibleText(detailHtml).includes(selectedProduct.name),
    "Product detail does not show the product returned by Supabase."
  );

  // The compare route is intentionally a client-only page whose Suspense fallback
  // renders no visible server text. A 200 response verifies the route shell; the
  // data contract is checked below and the hydrated UI is covered by browser QA.
  await requireHtml(`/compare?${normalQuery}`, "Compare page shell");
  const compareIds = productIds.slice(0, 2);
  const productsResponse = await appRequest(
    `/api/products?ids=${encodeURIComponent(compareIds.join(","))}`,
    { headers: { "Cache-Control": "no-cache" } }
  );
  assert(productsResponse.status === 200, `Compare products API returned HTTP ${productsResponse.status}.`);
  const productsBody = await productsResponse.json();
  assert(Array.isArray(productsBody.products), "Compare products API did not return a products array.");
  assert(
    JSON.stringify(productsBody.products.map((product) => product.id)) === JSON.stringify(compareIds),
    "Compare products API did not preserve the requested public product order."
  );

  return { productIds, selectedProduct };
}

async function verifyTracking(selectedProduct) {
  let response = await appRequest("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: eventSessionId,
      event_type: "visit",
      payload: { path: "/production-smoke", marker: csvMarker },
    }),
  });
  assert(response.status === 204, `Event API returned HTTP ${response.status}.`);

  response = await getPage(
    `/go/${selectedProduct.id}?rank=1&via=results`,
    `sid=${eventSessionId}`
  );
  assert(response.status === 302, `Outbound route returned HTTP ${response.status}.`);
  assert(
    response.headers.get("location") === selectedProduct.seller_url,
    "Outbound route did not redirect to the selected seller URL."
  );

  response = await appRequest("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: feedbackSessionId,
      q_time_saved: 5,
      q_conditions_reflected: 5,
      q_reasons_helpful: 5,
      q_found_candidate: true,
      q_would_reuse: true,
      q_worst_question: csvMarker,
      chosen_product_id: selectedProduct.id,
      post_purchase_optin: false,
    }),
  });
  assert(response.status === 200, `Feedback API returned HTTP ${response.status}.`);

  const { data: events, error: eventsError } = await db
    .from("events")
    .select("event_type,payload")
    .eq("session_id", eventSessionId)
    .order("id", { ascending: true });
  assert(!eventsError, `Could not read production smoke events: ${eventsError?.message}`);
  assert(
    JSON.stringify(events?.map((event) => event.event_type)) ===
      JSON.stringify(["visit", "outbound_click"]),
    "Production tracking rows were missing or out of order."
  );
  assert(events[0].payload?.marker === csvMarker, "The event payload marker was not stored.");

  const { data: feedbackRows, error: feedbackError } = await db
    .from("feedback")
    .select("chosen_product_id,q_worst_question")
    .eq("session_id", feedbackSessionId);
  assert(!feedbackError, `Could not read production smoke feedback: ${feedbackError?.message}`);
  assert(feedbackRows?.length === 1, "Production feedback was not stored exactly once.");
  assert(
    feedbackRows[0].chosen_product_id === selectedProduct.id &&
      feedbackRows[0].q_worst_question === csvMarker,
    "Production feedback did not preserve its product link and marker."
  );
}

async function loginAsAdmin() {
  const anonymousAdmin = await getPage("/admin");
  assert(
    [303, 307, 308].includes(anonymousAdmin.status),
    `Anonymous /admin returned HTTP ${anonymousAdmin.status} instead of redirecting.`
  );
  resolveLocation(anonymousAdmin, "/admin/login", "Anonymous admin access");

  const loginHtml = await requireHtml("/admin/login", "Admin login");
  assert(loginHtml.includes('name="password"'), "Admin login does not contain a password field.");
  assert(loginHtml.includes('action="/api/admin/login"'), "Admin login form action is invalid.");

  const login = await appRequest("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: adminPassword }),
    redirect: "manual",
  });
  assert(login.status === 303, `Admin login returned HTTP ${login.status}.`);
  resolveLocation(login, "/admin", "Admin login");
  const setCookie = login.headers.get("set-cookie") ?? "";
  assert(/\bHttpOnly\b/i.test(setCookie), "Production admin cookie is not HttpOnly.");
  assert(/\bSecure\b/i.test(setCookie), "Production admin cookie is not Secure.");
  assert(/\bSameSite=Lax\b/i.test(setCookie), "Production admin cookie is not SameSite=Lax.");
  return cookiePair(setCookie);
}

async function verifyCsvExports(adminCookie) {
  const unauthorized = await getPage("/api/admin/export/events");
  assert(unauthorized.status === 401, `Anonymous CSV export returned HTTP ${unauthorized.status}.`);

  for (const kind of ["events", "feedback"]) {
    const response = await getPage(`/api/admin/export/${kind}`, adminCookie);
    assert(response.status === 200, `${kind} CSV export returned HTTP ${response.status}.`);
    assert(
      response.headers.get("content-type")?.startsWith("text/csv; charset=utf-8"),
      `${kind} CSV export has an invalid Content-Type.`
    );
    assert(
      response.headers.get("content-disposition")?.startsWith("attachment;"),
      `${kind} CSV export is not an attachment.`
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert(
      bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
      `${kind} CSV export does not start with a UTF-8 BOM.`
    );
    const csv = new TextDecoder("utf-8").decode(bytes);
    assert(csv.includes(runId), `${kind} CSV export does not contain this run's marker.`);
  }
}

async function verifyAdminProductMutation(adminCookie) {
  const dashboardHtml = await requireHtml("/admin", "Admin dashboard", adminCookie);
  assert(
    dashboardHtml.includes("/admin/products") &&
      dashboardHtml.includes("/api/admin/export/events") &&
      dashboardHtml.includes("/api/admin/export/feedback"),
    "Admin dashboard is missing product or CSV links."
  );

  const newProductPage = `${appUrl}/admin/products/new`;
  const newProductHtml = await requireHtml("/admin/products/new", "New product", adminCookie);
  const createForm = findForm(
    newProductHtml,
    (form) => form.body.includes('name="name"') && form.body.includes('name="seller_url"'),
    "New product"
  );
  const createResponse = await submitHtmlForm({
    pageUrl: newProductPage,
    form: createForm,
    cookie: adminCookie,
    fields: productFields(),
  });
  assert(
    [303, 307].includes(createResponse.status),
    `Product creation returned HTTP ${createResponse.status}.`
  );

  const { data: createdProduct, error: createdProductError } = await db
    .from("products")
    .select("id,name,price,status,source_note,last_verified_at,review_risks")
    .eq("seller_url", sellerUrl)
    .maybeSingle();
  assert(!createdProductError, `Could not read the smoke product: ${createdProductError?.message}`);
  assert(createdProduct, "The production Server Action did not create the smoke product.");
  createdProductId = createdProduct.id;
  assert(createdProduct.name === productName, "Created product name does not match.");
  assert(createdProduct.status === "hidden", "Smoke product was not created hidden.");
  assert(createdProduct.source_note === null, "Hidden smoke draft unexpectedly has a source.");
  resolveLocation(createResponse, `/admin/products/${createdProductId}`, "Product creation");

  const draftProductsHtml = await requireHtml(
    "/admin/products",
    "Admin products with source-less draft",
    adminCookie
  );
  const publishDraftForm = findForm(
    draftProductsHtml,
    (form) => form.body.includes(`id="status-${createdProductId}"`),
    "Source-less draft status"
  );
  const publishDraftResponse = await submitHtmlForm({
    pageUrl: `${appUrl}/admin/products`,
    form: publishDraftForm,
    cookie: adminCookie,
    fields: [["status", "public"]],
  });
  assert(
    [303, 307].includes(publishDraftResponse.status),
    `Source-less public transition returned HTTP ${publishDraftResponse.status}.`
  );
  const publishDraftLocation = resolveLocation(
    publishDraftResponse,
    "/admin/products",
    "Source-less public transition"
  );
  assert(
    publishDraftLocation.searchParams.get("statusResult") === "source-required",
    "Source-less public transition did not return the source-required result."
  );
  const { data: guardedDraft, error: guardedDraftError } = await db
    .from("products")
    .select("status,source_note")
    .eq("id", createdProductId)
    .single();
  assert(!guardedDraftError, `Could not read the guarded smoke draft: ${guardedDraftError?.message}`);
  assert(
    guardedDraft.status === "hidden" && guardedDraft.source_note === null,
    "A source-less smoke draft became public."
  );

  const editPath = `/admin/products/${createdProductId}`;
  const editPageUrl = `${appUrl}${editPath}`;
  const editHtml = await requireHtml(editPath, "Edit product", adminCookie);
  const editForm = findForm(
    editHtml,
    (form) => form.body.includes('name="name"') && form.body.includes('name="seller_url"'),
    "Edit product"
  );
  const updateResponse = await submitHtmlForm({
    pageUrl: editPageUrl,
    form: editForm,
    cookie: adminCookie,
    fields: productFields({
      name: updatedProductName,
      price: "234567",
      source_note: csvMarker,
      last_verified_at: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      status: "hidden",
    }),
  });
  assert(
    [303, 307].includes(updateResponse.status),
    `Product update returned HTTP ${updateResponse.status}.`
  );

  const { data: updatedProduct, error: updatedProductError } = await db
    .from("products")
    .select("name,price,status,source_note")
    .eq("id", createdProductId)
    .single();
  assert(!updatedProductError, `Could not read the updated smoke product: ${updatedProductError?.message}`);
  assert(
      updatedProduct.name === updatedProductName &&
      updatedProduct.price === 234567 &&
      updatedProduct.status === "hidden" &&
      updatedProduct.source_note === csvMarker,
    "Production product update did not persist or exposed the smoke product."
  );

  const productsHtml = await requireHtml("/admin/products", "Admin products", adminCookie);
  assert(productsHtml.includes(updatedProductName), "Updated smoke product is missing from the admin list.");
  const soldOutForm = findForm(
    productsHtml,
    (form) => form.body.includes(`id="status-${createdProductId}"`),
    "Product status"
  );
  const soldOutResponse = await submitHtmlForm({
    pageUrl: `${appUrl}/admin/products`,
    form: soldOutForm,
    cookie: adminCookie,
    fields: [["status", "sold_out"]],
  });
  assert(
    [200, 303].includes(soldOutResponse.status),
    `Product status update returned HTTP ${soldOutResponse.status}.`
  );
  let { data: statusProduct, error: statusError } = await db
    .from("products")
    .select("status")
    .eq("id", createdProductId)
    .single();
  assert(!statusError, `Could not read sold-out smoke product: ${statusError?.message}`);
  assert(statusProduct.status === "sold_out", "Smoke product did not change to sold_out.");

  const refreshedProductsHtml = await requireHtml(
    "/admin/products",
    "Refreshed admin products",
    adminCookie
  );
  const hiddenForm = findForm(
    refreshedProductsHtml,
    (form) => form.body.includes(`id="status-${createdProductId}"`),
    "Product status restore"
  );
  const hiddenResponse = await submitHtmlForm({
    pageUrl: `${appUrl}/admin/products`,
    form: hiddenForm,
    cookie: adminCookie,
    fields: [["status", "hidden"]],
  });
  assert(
    [200, 303].includes(hiddenResponse.status),
    `Product status restore returned HTTP ${hiddenResponse.status}.`
  );
  ({ data: statusProduct, error: statusError } = await db
    .from("products")
    .select("status")
    .eq("id", createdProductId)
    .single());
  assert(!statusError, `Could not read restored smoke product: ${statusError?.message}`);
  assert(statusProduct.status === "hidden", "Smoke product did not return to hidden.");
}

async function logoutAdmin(adminCookie) {
  const logout = await appRequest("/api/admin/logout", {
    method: "POST",
    headers: { Cookie: adminCookie, Origin: appUrl, Referer: `${appUrl}/admin` },
    redirect: "manual",
  });
  assert(logout.status === 303, `Admin logout returned HTTP ${logout.status}.`);
  resolveLocation(logout, "/admin/login", "Admin logout");
  assert(/Max-Age=0/i.test(logout.headers.get("set-cookie") ?? ""), "Admin logout did not expire the cookie.");
}

async function cleanup() {
  const errors = [];
  const recordError = (label, error) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  recordError(
    "feedback session delete",
    (await db.from("feedback").delete().eq("session_id", feedbackSessionId)).error
  );
  recordError(
    "event session delete",
    (await db.from("events").delete().eq("session_id", eventSessionId)).error
  );
  if (createdProductId) {
    recordError(
      "product feedback delete",
      (await db.from("feedback").delete().eq("chosen_product_id", createdProductId)).error
    );
    recordError(
      "product id delete",
      (await db.from("products").delete().eq("id", createdProductId)).error
    );
  }
  recordError(
    "product seller URL delete",
    (await db.from("products").delete().eq("seller_url", sellerUrl)).error
  );

  for (const [label, table, column, value] of [
    ["feedback", "feedback", "session_id", feedbackSessionId],
    ["events", "events", "session_id", eventSessionId],
    ["product", "products", "seller_url", sellerUrl],
  ]) {
    const { count, error } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, value);
    recordError(`${label} cleanup check`, error);
    if (!error && count !== 0) errors.push(`${label}: ${count} temporary row(s) remain`);
  }
  return errors;
}

try {
  await waitForDeployment();

  const { count: publicProductCount, error: publicProductError } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("status", "public");
  assert(!publicProductError, `Could not query Supabase products: ${publicProductError?.message}`);
  assert(publicProductCount === 10, `Expected 10 public seed products, got ${publicProductCount ?? 0}.`);

  const { selectedProduct } = await verifyPublicFlow();
  await verifyTracking(selectedProduct);
  const adminCookie = await loginAsAdmin();
  await verifyCsvExports(adminCookie);
  await verifyAdminProductMutation(adminCookie);
  await logoutAdmin(adminCookie);

  console.log(
    "Production smoke passed: public 3-step flow, 3 results, detail/compare data, tracking, feedback, admin auth/CSV, hidden draft source guard, product update/status, and logout."
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  const cleanupErrors = await cleanup();
  if (cleanupErrors.length > 0) {
    console.error(`Production smoke cleanup failed: ${cleanupErrors.join("; ")}`);
    process.exitCode = 1;
  }
}
