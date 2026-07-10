/** 시안 A의 침대 일러스트 — 랜딩 히어로용과 카드 이미지 플레이스홀더용 */

export function HeroBedIllustration() {
  return (
    <svg viewBox="0 0 320 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-auto w-full" role="img" aria-label="포근한 침대 일러스트">
      <ellipse cx="162" cy="110" rx="142" ry="84" fill="#FFEDE4" />
      <path d="M62 36l2.7 7.3 7.3 2.7-7.3 2.7L62 56l-2.7-7.3L52 46l7.3-2.7z" fill="#FFC5B1" />
      <path d="M262 74l2 5.4 5.4 2-5.4 2-2 5.4-2-5.4-5.4-2 5.4-2z" fill="#FF8A6E" />
      <circle cx="286" cy="46" r="4" fill="#FFD9CC" />
      <circle cx="36" cy="82" r="5" fill="#FFD9CC" />
      <path d="M238 30a15 15 0 0 1-19-19 15 15 0 1 0 19 19z" fill="#FFC5B1" transform="translate(0 14)" />
      <rect x="44" y="46" width="26" height="104" rx="13" fill="#FF9C7F" />
      <rect x="44" y="120" width="234" height="42" rx="14" fill="#F3E2CC" />
      <rect x="64" y="130" width="90" height="22" rx="9" fill="#FFF8EE" />
      <circle cx="109" cy="141" r="3.2" fill="#D8BD9C" />
      <rect x="168" y="130" width="90" height="22" rx="9" fill="#FFF8EE" />
      <circle cx="213" cy="141" r="3.2" fill="#D8BD9C" />
      <rect x="56" y="160" width="16" height="14" rx="7" fill="#E2C8A4" />
      <rect x="250" y="160" width="16" height="14" rx="7" fill="#E2C8A4" />
      <rect x="58" y="88" width="214" height="36" rx="17" fill="#FFFFFF" />
      <path d="M134 88h122a16 16 0 0 1 16 16v20H134z" fill="#FF6B4A" />
      <path d="M152 100c22-7 62-7 84 0" stroke="#FFD9CC" strokeWidth="5" strokeLinecap="round" />
      <rect x="72" y="62" width="54" height="30" rx="14" fill="#FFFFFF" stroke="#F0DFCC" strokeWidth="3" transform="rotate(-4 99 77)" />
    </svg>
  );
}

/** 카드용 침대 플레이스홀더 (상품 이미지가 없을 때) */
export function BedPlaceholder({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 240 130" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-auto w-[210px]" role="img" aria-label={`${label} 이미지 자리`}>
      <rect x="34" y="16" width="22" height="78" rx="11" fill="#FF9C7F" />
      <rect x="34" y="70" width="176" height="34" rx="11" fill="#EFDCC3" />
      <rect x="50" y="78" width="66" height="18" rx="7" fill="#FFF8EE" />
      <circle cx="83" cy="87" r="2.6" fill="#D8BD9C" />
      <rect x="126" y="78" width="66" height="18" rx="7" fill="#FFF8EE" />
      <circle cx="159" cy="87" r="2.6" fill="#D8BD9C" />
      <rect x="44" y="102" width="13" height="11" rx="5.5" fill="#DFC49E" />
      <rect x="190" y="102" width="13" height="11" rx="5.5" fill="#DFC49E" />
      <rect x="46" y="46" width="162" height="28" rx="13" fill="#FFFFFF" />
      <path d="M104 46h91a13 13 0 0 1 13 13v15H104z" fill="#FF6B4A" />
      <path d="M118 55c16-5 46-5 62 0" stroke="#FFD9CC" strokeWidth="4" strokeLinecap="round" />
      <rect x="56" y="26" width="42" height="24" rx="11" fill="#FFFFFF" stroke="#F0DFCC" strokeWidth="2.5" transform="rotate(-4 77 38)" />
    </svg>
  );
}

/** 작은 침대 썸네일 (비교함·리스트용) */
export function BedThumb() {
  return (
    <svg viewBox="0 0 64 40" fill="none" className="h-auto w-[52px]" aria-hidden="true">
      <rect x="8" y="6" width="7" height="24" rx="3.5" fill="#FF9C7F" />
      <rect x="8" y="22" width="48" height="10" rx="3.5" fill="#EFDCC3" />
      <rect x="11" y="14" width="45" height="9" rx="4.5" fill="#FFFFFF" />
      <path d="M28 14h24a4.5 4.5 0 0 1 4.5 4.5V23H28z" fill="#FF6B4A" />
    </svg>
  );
}
