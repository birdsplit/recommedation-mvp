import process from "node:process";
import {
  parseCommonArgs,
  printValidation,
  readAndValidateCatalog,
} from "./catalog-lib.mjs";

const USAGE = `Usage: npm run catalog:validate -- [--file PATH] [--as-of YYYY-MM-DD]

Validates CSV syntax, required fields, duplicate offer/variant keys, real public
URLs, freshness (commercial 7 days/spec 30 days), and catalog distribution.
This command never connects to or changes Supabase.`;

try {
  const options = parseCommonArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
  } else {
    const result = await readAndValidateCatalog(options.file, {
      asOf: options.asOf,
    });
    printValidation(result);
    if (result.errors.length > 0) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
