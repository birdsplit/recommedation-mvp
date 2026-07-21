import { access, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { parse } from "csv-parse/sync";

const CATALOG_FILE = "data/catalog-products.csv";
const MACHINE_FILE = "data/review-checklist.csv";
const HUMAN_FILE = "data/review-checklist.ko.csv";

const MACHINE_COLUMNS = [
  "internal_key",
  "seller",
  "option_url_ok",
  "price_confirmed",
  "stock_confirmed",
  "dims_confirmed",
  "storage_type_confirmed",
  "delivery_confirmed",
  "conditional_costs_unknown_ok",
  "policy_summaries_present",
  "review_sample_n",
  "repeated_risks",
  "image_rights",
  "blocking_issues",
  "reviewer",
  "reviewed_at",
];

const HUMAN_COLUMNS = [
  "상품키_수정금지",
  "판매처",
  "상품명_참고",
  "상품페이지_참고",
  "옵션페이지열림_예아니오",
  "현재가격원_숫자",
  "재고_판매중품절확인불가",
  "완성외경_가로x길이x높이cm",
  "수납방식_없음서랍리프트하부오픈막힘확인불가",
  "배송설치_확인내용",
  "조건부비용_unknown처리_예아니오",
  "반품파손보증_3종확인_예아니오",
  "리뷰출처URL",
  "리뷰표본수_0에서10",
  "리뷰재검수수",
  "반복위험_없음또는내용",
  "이미지사용권_확인미확인",
  "공개차단이슈_없으면공란",
  "검수자",
  "재검수자",
  "검수일_YYYY-MM-DD",
  "공개가능_예아니오",
];

const STORAGE_LABELS = {
  none: "없음",
  drawer: "서랍",
  lift_up: "리프트",
  legs_open: "하부오픈",
  closed_base: "막힘",
};

const REVIEW_RISKS = new Set([
  "squeak",
  "wobble",
  "smell",
  "assembly_hard",
  "manual_poor",
  "missing_parts",
  "delivery_delay",
  "finish_poor",
  "drawer_awkward",
  "extra_cost",
]);

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function stringifyCsv(columns, rows, { bom = true } = {}) {
  const lines = [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))];
  const prefix = bom ? "\uFEFF" : "";
  return `${prefix}${lines.map((line) => line.map(csvEscape).join(",")).join("\r\n")}\r\n`;
}

async function readCsv(file) {
  return parse(await readFile(file, "utf8"), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
    trim: true,
  });
}

function unwrap(value) {
  const match = String(value ?? "").match(/^[^(]+\((.*)\)$/s);
  return match ? match[1].trim() : String(value ?? "").trim();
}

function yesNo(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["예", "yes", "y"].includes(normalized)) return "예";
  if (["아니오", "아니요", "no", "n"].includes(normalized)) return "아니오";
  return "";
}

function numberOrBlank(value) {
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  return /^\d+$/.test(normalized) ? normalized : "";
}

function parseHumanRisks(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "없음") return { counts: {}, errors: [] };
  const counts = {};
  const errors = [];
  for (const item of text.split("|").map((part) => part.trim()).filter(Boolean)) {
    const match = item.match(/^([a-z_]+)\s*:\s*(\d+)$/);
    if (!match) {
      errors.push(`'${item}'은 코드:횟수 형식이 아닙니다.`);
      continue;
    }
    const [, risk, countText] = match;
    if (!REVIEW_RISKS.has(risk)) {
      errors.push(`허용되지 않은 위험 코드입니다 (${risk}).`);
      continue;
    }
    counts[risk] = Number(countText);
  }
  return { counts, errors };
}

function dimensions(catalog) {
  if (!catalog.width_cm || !catalog.length_cm) return "확인불가";
  return `${catalog.width_cm} x ${catalog.length_cm} x ${catalog.height_cm || "확인불가"}`;
}

function deliverySummary(catalog) {
  if (catalog.delivery_days_min === "" || catalog.delivery_days_max === "") return "확인불가";
  const days = catalog.delivery_days_min === catalog.delivery_days_max
    ? `${catalog.delivery_days_min}일`
    : `${catalog.delivery_days_min}~${catalog.delivery_days_max}일`;
  const installation = {
    included: "설치비 포함",
    paid: `유료 설치${catalog.installation_fee ? ` ${catalog.installation_fee}원` : ""}`,
    none: "직접 조립",
    unknown: "설치 조건 확인 필요",
  }[catalog.installation_service] ?? "설치 조건 확인 필요";
  return `${days} / ${installation}`;
}

function initialHumanRow(catalog, machine = {}) {
  const publicRow = catalog.status === "public";
  const reviewCount = numberOrBlank(catalog.review_sample_count) || numberOrBlank(machine.review_sample_n) || "0";
  const riskCounts = (() => {
    try {
      const entries = Object.entries(JSON.parse(catalog.review_risk_counts || "{}"));
      return entries.length > 0
        ? entries.map(([risk, count]) => `${risk}:${count}`).join(" | ")
        : "없음";
    } catch {
      return unwrap(machine.repeated_risks) || "없음";
    }
  })();
  return {
    상품키_수정금지: catalog.internal_key,
    판매처: catalog.seller_name,
    상품명_참고: catalog.name,
    상품페이지_참고: catalog.seller_url,
    옵션페이지열림_예아니오: /^https:\/\//.test(catalog.seller_url) ? "예" : "아니오",
    현재가격원_숫자: catalog.price,
    재고_판매중품절확인불가:
      catalog.availability === "in_stock"
        ? "판매중"
        : catalog.availability === "out_of_stock"
          ? "품절"
          : "확인불가",
    완성외경_가로x길이x높이cm: dimensions(catalog),
    수납방식_없음서랍리프트하부오픈막힘확인불가:
      STORAGE_LABELS[catalog.storage_type] ?? "확인불가",
    배송설치_확인내용: deliverySummary(catalog),
    조건부비용_unknown처리_예아니오:
      catalog.shipping_fee_confidence === "confirmed" ? "예" : "아니오",
    반품파손보증_3종확인_예아니오:
      catalog.return_policy_summary && catalog.damage_process_summary && catalog.warranty_summary
        ? "예"
        : "아니오",
    리뷰출처URL: catalog.review_source_url,
    리뷰표본수_0에서10: reviewCount,
    리뷰재검수수: numberOrBlank(catalog.review_rechecked_count) || "0",
    반복위험_없음또는내용: riskCounts,
    이미지사용권_확인미확인: catalog.image_url ? "확인" : "미확인",
    공개차단이슈_없으면공란: publicRow ? "" : catalog.evidence_notes || machine.blocking_issues,
    검수자: catalog.verified_by || machine.reviewer,
    재검수자: publicRow ? "codex-20pct-recheck-2026-07-21" : "",
    "검수일_YYYY-MM-DD": catalog.commercial_verified_at || machine.reviewed_at,
    공개가능_예아니오: publicRow ? "예" : "아니오",
  };
}

function assertColumns(rows, columns, file) {
  if (rows.length === 0) throw new Error(`${file}: 데이터 행이 없습니다.`);
  const actual = new Set(Object.keys(rows[0]));
  const missing = columns.filter((column) => !actual.has(column));
  if (missing.length > 0) throw new Error(`${file}: 필수 열 누락: ${missing.join(", ")}`);
}

function machineRow(row) {
  const price = numberOrBlank(row["현재가격원_숫자"]);
  const stock = row["재고_판매중품절확인불가"];
  const dimensionsValue = row["완성외경_가로x길이x높이cm"];
  const storage = row["수납방식_없음서랍리프트하부오픈막힘확인불가"];
  const delivery = row["배송설치_확인내용"];
  const reviewCount = numberOrBlank(row["리뷰표본수_0에서10"]) || "0";
  const riskCounts = parseHumanRisks(row["반복위험_없음또는내용"]).counts;
  const repeatedRisks = Object.entries(riskCounts)
    .filter(([, count]) => count >= 2)
    .map(([risk]) => risk)
    .sort()
    .join("|");
  const imageRights = row["이미지사용권_확인미확인"];
  return {
    internal_key: row["상품키_수정금지"],
    seller: row["판매처"],
    option_url_ok:
      yesNo(row["옵션페이지열림_예아니오"]) === "예"
        ? "yes(브라우저 확인)"
        : "no(열림 미확인)",
    price_confirmed: price ? `yes(${price})` : "no(가격 미확인)",
    stock_confirmed:
      stock === "판매중"
        ? "yes(in_stock)"
        : stock === "품절"
          ? "no(out_of_stock)"
          : "no(unknown)",
    dims_confirmed:
      dimensionsValue && dimensionsValue !== "확인불가"
        ? `yes(${dimensionsValue})`
        : "no(완성 외경 미확인)",
    storage_type_confirmed:
      storage && storage !== "확인불가" ? `yes(${storage})` : "no(수납 방식 미확인)",
    delivery_confirmed:
      delivery && delivery !== "확인불가" ? `yes(${delivery})` : "no(배송·설치 미확인)",
    conditional_costs_unknown_ok:
      yesNo(row["조건부비용_unknown처리_예아니오"]) === "예" ? "yes" : "no",
    policy_summaries_present:
      yesNo(row["반품파손보증_3종확인_예아니오"]) === "예" ? "yes" : "no",
    review_sample_n: reviewCount,
    repeated_risks: repeatedRisks || "none",
    image_rights: imageRights === "확인" ? "verified" : "unverified(비움)",
    blocking_issues: row["공개차단이슈_없으면공란"],
    reviewer: row["검수자"],
    reviewed_at: row["검수일_YYYY-MM-DD"],
  };
}

function validateHumanRows(rows, catalogRows) {
  const errors = [];
  const warnings = [];
  const catalogKeys = new Set(catalogRows.map((row) => row.internal_key));
  const seen = new Set();
  rows.forEach((row, index) => {
    const line = index + 2;
    const key = row["상품키_수정금지"];
    if (!key) errors.push(`${line}행: 상품키가 비어 있습니다.`);
    else if (seen.has(key)) errors.push(`${line}행: 상품키가 중복됩니다 (${key}).`);
    else if (!catalogKeys.has(key)) errors.push(`${line}행: catalog-products.csv에 없는 상품키입니다 (${key}).`);
    seen.add(key);

    for (const [column, allowed] of [
      ["옵션페이지열림_예아니오", ["예", "아니오"]],
      ["재고_판매중품절확인불가", ["판매중", "품절", "확인불가"]],
      ["수납방식_없음서랍리프트하부오픈막힘확인불가", ["없음", "서랍", "리프트", "하부오픈", "막힘", "확인불가"]],
      ["조건부비용_unknown처리_예아니오", ["예", "아니오"]],
      ["반품파손보증_3종확인_예아니오", ["예", "아니오"]],
      ["이미지사용권_확인미확인", ["확인", "미확인"]],
      ["공개가능_예아니오", ["예", "아니오"]],
    ]) {
      if (!allowed.includes(row[column])) {
        errors.push(`${line}행 ${column}: ${allowed.join(" / ")} 중 하나를 입력하세요.`);
      }
    }

    const sampleCount = Number(row["리뷰표본수_0에서10"]);
    const recheckCount = Number(row["리뷰재검수수"]);
    const riskResult = parseHumanRisks(row["반복위험_없음또는내용"]);
    for (const riskError of riskResult.errors) errors.push(`${line}행: ${riskError}`);
    for (const [risk, count] of Object.entries(riskResult.counts)) {
      if (!Number.isInteger(count) || count < 1 || count > sampleCount) {
        errors.push(`${line}행: ${risk} 언급 수는 1 이상, 리뷰 표본 수 이하여야 합니다.`);
      }
    }
    if (!Number.isInteger(sampleCount) || sampleCount < 0 || sampleCount > 10) {
      errors.push(`${line}행: 리뷰 표본 수는 0~10의 정수여야 합니다.`);
    }
    if (!Number.isInteger(recheckCount) || recheckCount < 0 || recheckCount > sampleCount) {
      errors.push(`${line}행: 리뷰 재검수 수는 0 이상, 표본 수 이하여야 합니다.`);
    }
    const date = row["검수일_YYYY-MM-DD"];
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`${line}행: 검수일은 YYYY-MM-DD 형식이어야 합니다.`);
    }

    if (row["공개가능_예아니오"] === "예") {
      const required = [
        [row["옵션페이지열림_예아니오"] === "예", "옵션 페이지 열림"],
        [/^\d+$/.test(String(row["현재가격원_숫자"]).replaceAll(",", "")), "현재 가격"],
        [row["재고_판매중품절확인불가"] === "판매중", "판매중 재고"],
        [row["완성외경_가로x길이x높이cm"] !== "확인불가", "완성 외경"],
        [row["수납방식_없음서랍리프트하부오픈막힘확인불가"] !== "확인불가", "수납 방식"],
        [Boolean(row["배송설치_확인내용"]) && row["배송설치_확인내용"] !== "확인불가", "배송·설치"],
        [row["조건부비용_unknown처리_예아니오"] === "예", "조건부 비용 unknown 처리"],
        [row["반품파손보증_3종확인_예아니오"] === "예", "정책 3종"],
        [sampleCount >= 0, "공식 리뷰 0건 확인 또는 리뷰 표본"],
        [recheckCount >= Math.ceil(sampleCount * 0.2), "리뷰 20% 재검수"],
        [/^https:\/\//.test(row["리뷰출처URL"]), "리뷰 출처 URL"],
        [!row["공개차단이슈_없으면공란"], "공개 차단 이슈 해소"],
        [Boolean(row["검수자"]), "검수자"],
        [Boolean(row["재검수자"]), "재검수자"],
        [Boolean(date), "검수일"],
      ];
      const missing = required.filter(([ok]) => !ok).map(([, label]) => label);
      if (missing.length > 0) errors.push(`${line}행 공개 가능 표시와 충돌: ${missing.join(", ")}`);
    } else if (!row["공개차단이슈_없으면공란"]) {
      warnings.push(`${line}행: 공개 불가인데 차단 이슈가 비어 있습니다.`);
    }
  });

  for (const key of catalogKeys) {
    if (!seen.has(key)) errors.push(`사람용 표에 상품키가 빠졌습니다 (${key}).`);
  }
  return { errors, warnings };
}

async function prepare(force) {
  if (!force) {
    try {
      await access(HUMAN_FILE);
      throw new Error(`${HUMAN_FILE}이 이미 있습니다. 사람 작성 내용을 보호하기 위해 덮어쓰지 않았습니다.`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const [catalogRows, machineRows] = await Promise.all([readCsv(CATALOG_FILE), readCsv(MACHINE_FILE)]);
  assertColumns(machineRows, MACHINE_COLUMNS, MACHINE_FILE);
  const machineByKey = new Map(machineRows.map((row) => [row.internal_key, row]));
  const humanRows = catalogRows.map((row) => initialHumanRow(row, machineByKey.get(row.internal_key)));
  await writeFile(HUMAN_FILE, stringifyCsv(HUMAN_COLUMNS, humanRows), "utf8");
  console.log(`Created ${HUMAN_FILE}: ${humanRows.length} products.`);
}

async function checkOrSync(write) {
  const [humanRows, catalogRows] = await Promise.all([readCsv(HUMAN_FILE), readCsv(CATALOG_FILE)]);
  assertColumns(humanRows, HUMAN_COLUMNS, HUMAN_FILE);
  const result = validateHumanRows(humanRows, catalogRows);
  for (const warning of result.warnings) console.warn(`WARN ${warning}`);
  for (const error of result.errors) console.error(`ERROR ${error}`);
  if (result.errors.length > 0) throw new Error(`사람용 검수표 오류 ${result.errors.length}개를 먼저 고쳐주세요.`);
  console.log(`Checked ${humanRows.length} products: 0 errors, ${result.warnings.length} warnings.`);
  if (!write) return;
  const machineRows = humanRows.map(machineRow);
  await writeFile(MACHINE_FILE, stringifyCsv(MACHINE_COLUMNS, machineRows, { bom: false }), "utf8");
  console.log(`Synced ${MACHINE_FILE}.`);
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "prepare") await prepare(args.includes("--force"));
  else if (command === "check") await checkOrSync(false);
  else if (command === "sync") await checkOrSync(true);
  else {
    throw new Error(
      "Usage: node scripts/review-checklist-human.mjs <prepare|check|sync> [--force]"
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
