import { redirect } from "next/navigation";

/** URL 비교 입력 기능이 준비될 때까지 공개 진입점을 제공하지 않는다. */
export default function HaveCandidatePage(): never {
  redirect("/");
}
