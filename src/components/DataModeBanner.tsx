export function DataModeBanner({ mode }: { mode: "demo" | "live" }) {
  const isDemo = mode === "demo";

  return (
    <aside
      role="status"
      aria-label="상품 데이터 운영 상태"
      className={`border-b px-5 py-2.5 ${
        isDemo
          ? "border-[#EBCB91] bg-[#FFF4D9] text-[#68430A]"
          : "border-[#B9DFC5] bg-leaf-50 text-[#135D35]"
      }`}
      data-data-mode={mode}
    >
      <div className="flex items-start justify-center gap-2 text-[13px] leading-relaxed">
        <span aria-hidden="true" className="mt-px shrink-0">
          {isDemo ? "🧪" : "✓"}
        </span>
        <p>
          <strong className="font-extrabold">
            {isDemo ? "데모 데이터로 기능을 검증 중이에요." : "실데이터로 운영 중이에요."}
          </strong>{" "}
          {isDemo
            ? "화면의 상품은 예시이며 판매처 이동은 제공하지 않아요."
            : "공개 상품의 출처와 확인일을 바탕으로 추천해요."}
        </p>
      </div>
    </aside>
  );
}
