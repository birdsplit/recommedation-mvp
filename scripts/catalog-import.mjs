import process from "node:process";
import {
  comparableProduct,
  createCatalogClient,
  loadCatalogEnvironment,
  parseCommonArgs,
  printValidation,
  PRODUCT_WRITE_FIELDS,
  readAndValidateCatalog,
  stableStringify,
} from "./catalog-lib.mjs";

const USAGE = `Usage: npm run catalog:import -- [--file PATH] [--as-of YYYY-MM-DD] [--dry-run] [--retire-missing]

Upserts products by internal_key and evidence by product/source. --dry-run reads
Supabase and prints create/update/hide counts without writing. Missing rows are
left untouched unless --retire-missing is explicitly supplied.`;

function summarize(label, rows) {
  console.log(`${label}: ${rows.length}`);
  for (const row of rows.slice(0, 20)) {
    console.log(`  - ${row.internal_key}${row.name ? ` (${row.name})` : ""}`);
  }
  if (rows.length > 20) console.log(`  ... and ${rows.length - 20} more`);
}

async function run() {
  const options = parseCommonArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const catalog = await readAndValidateCatalog(options.file, {
    asOf: options.asOf,
  });
  printValidation(catalog);
  if (catalog.errors.length > 0) {
    throw new Error("Catalog import stopped because validation failed.");
  }

  loadCatalogEnvironment();
  const db = createCatalogClient();
  const selectFields = ["id", ...PRODUCT_WRITE_FIELDS].join(",");
  const { data: existingData, error: existingError } = await db
    .from("products")
    .select(selectFields)
    .order("internal_key", { ascending: true });
  if (existingError) throw new Error(`Could not read products: ${existingError.message}`);

  const existing = existingData ?? [];
  const byInternalKey = new Map(existing.map((product) => [product.internal_key, product]));
  const incomingKeys = new Set(catalog.rows.map(({ product }) => product.internal_key));
  const creates = [];
  const updates = [];
  const unchanged = [];
  for (const { product } of catalog.rows) {
    const prior = byInternalKey.get(product.internal_key);
    if (!prior) creates.push(product);
    else if (stableStringify(comparableProduct(prior)) !== stableStringify(comparableProduct(product))) {
      updates.push(product);
    } else unchanged.push(product);
  }
  const hides = options.retireMissing
    ? existing.filter(
        (product) => product.status === "public" && !incomingKeys.has(product.internal_key)
      )
    : [];

  summarize("Create", creates);
  summarize("Update", updates);
  summarize("Unchanged", unchanged);
  summarize("Hide missing", hides);
  if (options.dryRun) {
    console.log("Dry run complete; Supabase was not changed.");
    return;
  }

  const writes = [...creates, ...updates];
  if (writes.length > 0) {
    const { error } = await db
      .from("products")
      .upsert(writes, { onConflict: "internal_key" });
    if (error) throw new Error(`Product upsert failed: ${error.message}`);
  }
  if (hides.length > 0) {
    const { error } = await db
      .from("products")
      .update({ status: "hidden" })
      .in("id", hides.map(({ id }) => id));
    if (error) throw new Error(`Missing product hide failed: ${error.message}`);
  }

  const { data: productIds, error: productIdsError } = await db
    .from("products")
    .select("id,internal_key")
    .in("internal_key", [...incomingKeys]);
  if (productIdsError) throw new Error(`Product id lookup failed: ${productIdsError.message}`);
  const idsByKey = new Map((productIds ?? []).map((row) => [row.internal_key, row.id]));
  if (idsByKey.size !== incomingKeys.size) {
    throw new Error("Not every imported product could be linked to a database id.");
  }

  const evidenceRows = catalog.rows.flatMap(({ product, evidence }) =>
    evidence.map((item) => ({
      product_id: idsByKey.get(product.internal_key),
      ...item,
    }))
  );
  const { error: evidenceError } = await db
    .from("product_evidence")
    .upsert(evidenceRows, { onConflict: "product_id,field_group" });
  if (evidenceError) throw new Error(`Evidence upsert failed: ${evidenceError.message}`);

  console.log(
    `Import complete: ${creates.length} created, ${updates.length} updated, ` +
      `${unchanged.length} unchanged, ${hides.length} hidden.`
  );
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
