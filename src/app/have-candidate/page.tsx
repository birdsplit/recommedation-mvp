import { redirect } from "next/navigation";

/** 경로 A(이미 후보가 있는) 사용자를 반응 기반 추천 루프 진입으로 보낸다. */
export default function HaveCandidatePage(): never {
  redirect("/browse/intake");
}
