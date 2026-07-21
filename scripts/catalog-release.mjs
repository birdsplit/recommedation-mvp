import process from "node:process";
import {
  createCatalogClient,
  hashCatalog,
  loadCatalogEnvironment,
  parseCommonArgs,
  validateReleaseProducts,
} from "./catalog-lib.mjs";

const USAGE = `Usage: npm run catalog:release -- --version VERSION [--as-of YYYY-MM-DD] [--dry-run] [--allow-partial] [--approve-warnings "REVIEWER: REASON"]

Snapshots all eligible public/in-stock products into an immutable release and
atomically publishes it. Default acceptance is at least 30 products from 6
sellers. --allow-partial is intended only for deliberate development checks.`;

async function run() {
  const options = parseCommonArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (!options.version?.trim()) throw new Error("--version is required.");
  if (options.version.length > 120) throw new Error("--version must be 120 characters or fewer.");
  if (options.warningApproval && options.warningApproval.length > 500) {
    throw new Error("--approve-warnings must be 500 characters or fewer.");
  }

  loadCatalogEnvironment();
  const db = createCatalogClient();
  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("status", "public")
    .eq("availability", "in_stock")
    .order("internal_key", { ascending: true });
  if (error) throw new Error(`Could not read release candidates: ${error.message}`);
  const products = data ?? [];
  const validation = validateReleaseProducts(products, {
    asOf: options.asOf,
    allowPartial: options.allowPartial,
  });
  for (const warning of validation.warnings) console.warn(`WARN ${warning}`);
  for (const validationError of validation.errors) console.error(`ERROR ${validationError}`);
  if (validation.errors.length > 0) throw new Error("Catalog release validation failed.");
  if (validation.warnings.length > 0 && !options.warningApproval) {
    throw new Error(
      'Catalog warnings require an approval record. Use --approve-warnings "REVIEWER: REASON".'
    );
  }

  const ids = products.map(({ id }) => id);
  const { data: evidence, error: evidenceError } = await db
    .from("product_evidence")
    .select(
      "id,product_id,field_group,field_names,source_url,confidence,verified_at,verified_by,notes"
    )
    .in("product_id", ids);
  if (evidenceError) throw new Error(`Could not verify product evidence: ${evidenceError.message}`);
  const requiredEvidenceGroups = ["catalog", "commercial", "delivery", "spec", "policy", "review"];
  const evidenceByProduct = new Map();
  const evidenceRowsByProduct = new Map();
  for (const row of evidence ?? []) {
    if (!evidenceByProduct.has(row.product_id)) evidenceByProduct.set(row.product_id, new Map());
    evidenceByProduct.get(row.product_id).set(row.field_group, row.confidence);
    if (!evidenceRowsByProduct.has(row.product_id)) evidenceRowsByProduct.set(row.product_id, []);
    evidenceRowsByProduct.get(row.product_id).push({
      id: row.id,
      field_group: row.field_group,
      field_names: row.field_names,
      source_url: row.source_url,
      confidence: row.confidence,
      verified_at: row.verified_at,
      verified_by: row.verified_by,
      notes: row.notes,
    });
  }
  const evidenceErrors = [];
  for (const product of products) {
    const groups = evidenceByProduct.get(product.id) ?? new Map();
    for (const group of requiredEvidenceGroups) {
      if (!groups.has(group)) evidenceErrors.push(`${product.internal_key}: ${group} 근거 누락`);
      else if (group !== "catalog" && groups.get(group) !== "confirmed") {
        evidenceErrors.push(`${product.internal_key}: ${group} 근거가 confirmed가 아님`);
      }
    }
  }
  if (evidenceErrors.length > 0) {
    throw new Error(`Catalog evidence validation failed:\n${evidenceErrors.join("\n")}`);
  }

  const enrichedProducts = products.map((product) => ({
    ...product,
    evidence: (evidenceRowsByProduct.get(product.id) ?? []).sort((left, right) =>
      left.field_group.localeCompare(right.field_group)
    ),
  }));

  const dataHash = hashCatalog(enrichedProducts);
  console.log(
    `Release ${options.version}: ${products.length} products, ${validation.sellers} sellers, sha256 ${dataHash}.`
  );
  if (options.dryRun) {
    console.log("Dry run complete; no release was created or published.");
    return;
  }

  const { data: sameVersion, error: versionError } = await db
    .from("catalog_releases")
    .select("id,version,data_hash,status")
    .eq("version", options.version)
    .maybeSingle();
  if (versionError) throw new Error(`Could not check release version: ${versionError.message}`);
  if (sameVersion?.data_hash !== undefined && sameVersion.data_hash !== dataHash) {
    throw new Error(`Release version ${options.version} already exists with different data.`);
  }
  if (sameVersion?.status === "published") {
    console.log("Identical release is already published; nothing changed.");
    return;
  }
  if (sameVersion?.status === "retired") {
    throw new Error("A retired release version is immutable and cannot be reused.");
  }

  const { data: sameHash, error: hashError } = await db
    .from("catalog_releases")
    .select("id,version,status")
    .eq("data_hash", dataHash)
    .maybeSingle();
  if (hashError) throw new Error(`Could not check release hash: ${hashError.message}`);
  if (sameHash && sameHash.id !== sameVersion?.id) {
    throw new Error(`The same catalog data already exists as release ${sameHash.version}.`);
  }

  let release = sameVersion;
  if (!release) {
    const { data: created, error: createError } = await db
      .from("catalog_releases")
      .insert({
        version: options.version,
        data_hash: dataHash,
        status: "draft",
        product_count: products.length,
        approved_by: options.warningApproval
          ? options.warningApproval.split(":", 1)[0].trim().slice(0, 120)
          : null,
        warning_approval: options.warningApproval?.trim() ?? null,
      })
      .select("id,version,data_hash,status")
      .single();
    if (createError) throw new Error(`Could not create release: ${createError.message}`);
    release = created;
  }
  if (release && options.warningApproval) {
    const { error: approvalError } = await db
      .from("catalog_releases")
      .update({
        approved_by: options.warningApproval.split(":", 1)[0].trim().slice(0, 120),
        warning_approval: options.warningApproval.trim(),
      })
      .eq("id", release.id)
      .eq("status", "draft");
    if (approvalError) throw new Error(`Could not record warning approval: ${approvalError.message}`);
  }

  const { error: clearError } = await db
    .from("catalog_release_products")
    .delete()
    .eq("release_id", release.id);
  if (clearError) throw new Error(`Could not reset draft release: ${clearError.message}`);
  const snapshots = enrichedProducts.map((product, index) => ({
    release_id: release.id,
    product_id: product.id,
    position: index + 1,
    product_snapshot: product,
  }));
  const { error: snapshotError } = await db
    .from("catalog_release_products")
    .insert(snapshots);
  if (snapshotError) throw new Error(`Could not snapshot release products: ${snapshotError.message}`);

  const { error: publishError } = await db.rpc("publish_catalog_release", {
    p_release_id: release.id,
  });
  if (publishError) throw new Error(`Could not publish release: ${publishError.message}`);
  console.log(`Published catalog release ${options.version}.`);
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
