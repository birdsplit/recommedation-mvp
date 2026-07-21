import { createHmac } from "node:crypto";

const secret = process.env.STUDY_TOKEN_SECRET;
if (!secret || secret.length < 16) {
  console.error("STUDY_TOKEN_SECRET(16자 이상)를 설정해 주세요.");
  process.exit(1);
}

const cohort = process.argv[2] ?? "internal-qa";
const days = Number(process.argv[3] ?? "7");
if (!/^[\w.-]{1,80}$/.test(cohort) || !Number.isFinite(days) || days <= 0) {
  console.error("사용법: npm run study:token -- <cohort> <valid-days>");
  process.exit(1);
}

const encoded = Buffer.from(
  JSON.stringify({
    exp: Math.floor(Date.now() / 1_000 + days * 24 * 60 * 60),
    cohort,
  })
).toString("base64url");
const signature = createHmac("sha256", secret)
  .update(encoded)
  .digest("base64url");

console.log(`${encoded}.${signature}`);
