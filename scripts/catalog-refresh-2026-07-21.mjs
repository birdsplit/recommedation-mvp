import { readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

const FILE = "data/catalog-products.csv";
const DATE = "2026-07-21";
const REVIEWER = "codex-official-source-audit-2026-07-21";

const iloomPolicy = {
  return_policy_summary:
    "배송 전일까지 무료 취소. 배송 당일~수령 후 7일 이내에는 품목별 반품비가 부과되며, 설치·조립 또는 비닐 포장 훼손 뒤 단순 변심 반품은 불가합니다(하자 예외).",
  damage_process_summary:
    "오염·손상·이상 또는 결함 상품은 반품할 수 있습니다. 공개 페이지에 별도 파손 접수 절차는 없어 일룸 고객센터 1577-5670 확인이 필요합니다.",
  warranty_summary:
    "소비자분쟁해결기준에 따라 1년 무상 A/S가 제공되며 고객 귀책 사유는 제외됩니다.",
};

const livartPolicy = {
  return_policy_summary:
    "수령 후 7일 이내 교환·반품을 신청할 수 있습니다. 설치·조립 후 단순 변심 반품은 제한될 수 있고 고객 부담 비용이 발생하며, 하자 상품은 예외입니다.",
  damage_process_summary:
    "파손·오배송·하자는 판매처 고객센터를 통해 접수하며 상품 상태 확인 후 교환·반품 절차가 진행됩니다.",
  warranty_summary:
    "리바트몰 회원 구매 상품은 공식 안내에 따른 3년 품질보증 대상이며, 비회원 구매 등 제외 조건은 구매 전 확인해야 합니다.",
};

const hanssemPolicy = {
  return_policy_summary:
    "단순 변심은 수령 후 7일 이내 반품 비용을 부담해 신청할 수 있습니다. 설치·개봉 상품은 상품별 회수·추가 비용이 생길 수 있고 침대는 추가 비용 조건이 있습니다.",
  damage_process_summary:
    "별도 파손 접수 절차는 공개 페이지에 명시되지 않았습니다. 표시·광고와 다르면 수령 후 3개월 또는 안 날부터 30일 이내 교환·반품을 청구하고 A/S 1588-0900으로 접수합니다.",
  warranty_summary:
    "상품 하자에 대해 구입일로부터 1년간 무상 A/S가 제공되며 고객 귀책은 유상 처리됩니다.",
};

const zinusPolicy = {
  return_policy_summary:
    "수령 후 7일 이내 신청할 수 있습니다. 단순 변심은 상품별 왕복 반품비가 부과되고, 조립 완료 프레임·훼손·포장 분실 상품은 반품이 제한됩니다.",
  damage_process_summary:
    "하자·불량 교환/반품 배송비는 판매처가 부담합니다. 설치 불가 또는 고객 귀책 미설치 회수 비용은 고객 부담입니다.",
  warranty_summary:
    "공식 상품 페이지에 고정 보증기간이 별도로 고지되지 않아 구매 전 고객센터 확인이 필요합니다.",
};

const acePolicy = {
  return_policy_summary:
    "수령 후 7일 이내 교환·반품할 수 있으며 단순 변심 비용은 고객 부담입니다. 설치 상품의 회수 가능 여부와 비용은 고객센터 확인이 필요합니다.",
  damage_process_summary:
    "제품 하자나 오배송의 교환·반품 비용은 판매처가 부담하며 에이스침대 고객센터 1599-7121로 접수합니다.",
  warranty_summary:
    "제품 결함은 구입일로부터 1년간 무상 A/S 대상이며, 이후에는 소비자분쟁해결기준에 따라 처리됩니다.",
};

const sofsysPolicy = {
  return_policy_summary:
    "전자상거래법과 소비자분쟁해결기준에 따라 수령 후 7일 이내 교환·반품할 수 있으며 단순 변심 비용은 고객 부담입니다. 조립·훼손 상품은 제한될 수 있습니다.",
  damage_process_summary:
    "파손·누락·불량은 사진 등 증빙과 함께 소프시스 고객센터 1644-2733으로 접수합니다.",
  warranty_summary:
    "공식 페이지에 고정 무상 보증기간이 별도로 게시되지 않아 소비자분쟁해결기준 적용 범위와 A/S 비용을 구매 전 확인해야 합니다.",
};

const englanderPolicy = {
  return_policy_summary:
    "수령 후 7일 이내 교환·반품을 신청할 수 있습니다. 설치 후 단순 변심은 반품이 제한되거나 회수·철거 비용이 부과될 수 있습니다.",
  damage_process_summary:
    "배송 중 파손·오배송·제품 하자는 설치 당일 상태를 확인해 잉글랜더 고객센터로 접수하며 판매처 확인 후 교환·A/S가 진행됩니다.",
  warranty_summary:
    "제품 하자는 구입일로부터 1년간 무상 A/S 대상이며 고객 귀책과 소모품은 유상 처리될 수 있습니다.",
};

const marketbPolicy = {
  return_policy_summary:
    "수령 후 7일 이내 교환·반품할 수 있습니다. 포장 개봉·조립·사용 또는 고객 귀책 훼손 가구는 단순 변심 반품이 제한됩니다.",
  damage_process_summary:
    "파손·누락·오배송은 사진 등 상태 자료를 준비해 마켓비 고객센터 031-943-8307로 접수합니다.",
  warranty_summary:
    "품질보증과 피해보상은 소비자분쟁해결기준에 따르며 고정 무상 보증기간은 상품별로 구매 전 확인해야 합니다.",
};

function reviewed({ sample = 0, rechecked = 0, counts = {}, risks = "", url }) {
  return {
    review_sample_count: String(sample),
    review_rechecked_count: String(rechecked),
    review_risk_counts: JSON.stringify(counts),
    review_risks: risks,
    review_verified_at: DATE,
    review_source_url: url,
    review_confidence: "confirmed",
  };
}

function installed({ min, max, scheduled = true } = {}) {
  return {
    delivery_days_min: String(min),
    delivery_days_max: String(max),
    scheduled_delivery: String(scheduled),
    installation_service: "included",
    installation_fee: "0",
    self_assembly: "not_possible",
    assembly_service_available: "true",
    assembly_people: "1",
  };
}

function diy({ min, max, paidInstall = false, installationFee = 0 } = {}) {
  return {
    delivery_days_min: String(min),
    delivery_days_max: String(max),
    scheduled_delivery: "false",
    installation_service: paidInstall ? "paid" : "none",
    installation_fee: String(installationFee),
    self_assembly: "easy",
    assembly_service_available: String(paidInstall),
    assembly_people: "1",
  };
}

const patches = {
  "iloom-HSRE01SS-3W1OS": {
    ...iloomPolicy,
    ...installed({ min: 10, max: 10 }),
    ...reviewed({
      sample: 0,
      url: "https://www.iloom.com/review/products/HSRE01SS/list.do?rownum=3&page=1&perPageNum=10&order=a",
    }),
    availability: "out_of_stock",
    status: "sold_out",
    price: "899000",
    shipping_fee: "0",
    width_cm: "119.6",
    length_cm: "206.9",
    height_cm: "95.2",
    material: "18T PB+HPM 포스트포밍; 스테인프리 패브릭; 18T PB+스펀지; 2T 스틸 프레임",
    storage_type: "none",
    mattress_included: "false",
    spec_source_url: "https://www.iloom.com/product/detail.do?productCd=HSRE01SS",
    evidence_notes:
      "공식 페이지 실행 상태가 showYn=N으로 구매 불가이며, JSON-LD에는 리뷰 2건으로 표시되지만 공식 리뷰 목록 API는 0건을 반환해 본문 표본도 확보하지 못했습니다. 공개에서 제외합니다.",
    review_confidence: "unknown",
  },
  "iloom-HBA411121-CZ": {
    ...iloomPolicy,
    ...installed({ min: 10, max: 10 }),
    ...reviewed({ sample: 0, url: "https://www.iloom.com/product/detail.do?productCd=HBA411121" }),
    price: "1009000",
    shipping_fee: "0",
    width_cm: "110.5",
    length_cm: "219.15",
    height_cm: "98.6",
    material:
      "18T PB+LPM 헤드·풋·패널; 15T PB+LPM 서랍·하부·벙커도어; TPU 손잡이; 매트리스 폴리혼방·우레탄폼·독립스프링",
    storage_type: "drawer",
    storage_capacity: "large",
    mattress_included: "true",
    spec_source_url: "https://cdn.iloom.com/upload/PDF_Itemlist/bedroom.pdf",
    evidence_notes:
      "공식 상품 페이지와 침실 카탈로그 PDF로 축 방향을 교차 확인했습니다. 공식 리뷰 목록 0건을 확인했습니다.",
  },
  "iloom-HSSE270-IVGYM": {
    ...iloomPolicy,
    ...installed({ min: 10, max: 10 }),
    ...reviewed({
      sample: 10,
      rechecked: 2,
      url: "https://www.iloom.com/review/products/HSSE270/list.do?rownum=3&page=1&perPageNum=10&order=a",
    }),
    price: "452000",
    shipping_fee: "0",
    width_cm: "114.9",
    length_cm: "204.1",
    height_cm: "91.5",
    storage_type: "legs_open",
    mattress_included: "false",
    spec_source_url: "https://cdn.iloom.com/upload/PDF_Itemlist/study.pdf?ver=260102",
    evidence_notes:
      "공식 PDF 규격과 공식 리뷰 최근 표본 10건을 확인했고, 허용 위험 코드가 2건 이상 반복되지 않았습니다.",
  },
  "iloom-IBM0021A-SO": {
    ...iloomPolicy,
    ...installed({ min: 10, max: 10 }),
    ...reviewed({ sample: 0, url: "https://www.iloom.com/product/detail.do?productCd=IBM0021A" }),
    price: "2490000",
    shipping_fee: "0",
    width_cm: "128",
    length_cm: "222.5",
    height_cm: "88.7",
    material: "22T PB+LPM 헤드; 28T SPB+LPM 베이스; 애쉬 원목·PP·스틸 다리; 메모리폼 매트리스",
    storage_type: "legs_open",
    mattress_included: "true",
    evidence_notes: "공식 상품 페이지의 가격·재고·설치배송·규격·소재와 공식 리뷰 0건을 확인했습니다.",
  },
  "iloom-HBA501101-SP": {
    ...iloomPolicy,
    ...installed({ min: 10, max: 10 }),
    ...reviewed({
      sample: 10,
      rechecked: 2,
      counts: { finish_poor: 1 },
      url: "https://www.iloom.com/review/products/HBA501101/list.do?rownum=3&page=1&perPageNum=10&order=a",
    }),
    price: "649000",
    shipping_fee: "0",
    width_cm: "114.1",
    length_cm: "217",
    height_cm: "110.05",
    material: "18T PB+LPM 헤드·바닥판·외부프레임; 알루미늄·플라스틱 LED",
    storage_type: "none",
    mattress_included: "false",
    evidence_notes:
      "공식 규격과 리뷰 표본 10건을 확인했습니다. 마감 불만 1건은 반복 위험 기준(2건)에 미달합니다.",
  },

  "livart-P100017510-oak": {
    ...livartPolicy,
    ...installed({ min: 4, max: 5 }),
    ...reviewed({
      sample: 2,
      rechecked: 2,
      url: "https://one.vreview.tv/api/embed/v2/e5bae7ba-09eb-467d-ba16-94497293d48e/reviews?product_remote_id=P100017510",
    }),
    price: "573000",
    shipping_fee: "0",
    width_cm: "114.1",
    length_cm: "204.9",
    height_cm: "120",
    storage_type: "none",
    mattress_included: "false",
    evidence_notes: "리바트 공식 상품 정보와 공식 VReview 본문 2건을 전부 확인했습니다.",
  },
  "livart-P100026884-natural": {
    ...livartPolicy,
    ...installed({ min: 4, max: 5 }),
    ...reviewed({
      sample: 10,
      rechecked: 2,
      url: "https://one.vreview.tv/api/embed/v2/e5bae7ba-09eb-467d-ba16-94497293d48e/reviews?product_remote_id=P100026884",
    }),
    price: "490000",
    shipping_fee: "0",
    width_cm: "115",
    length_cm: "205.5",
    material: "PB+LPM",
    storage_type: "drawer",
    mattress_included: "false",
    evidence_notes: "구매 가능한 공식 옵션과 공식 VReview 최신 표본 10건을 확인했습니다.",
  },
  "livart-P200199572-ss-white": {
    ...livartPolicy,
    ...installed({ min: 4, max: 5 }),
    ...reviewed({
      sample: 10,
      rechecked: 2,
      url: "https://one.vreview.tv/api/embed/v2/e5bae7ba-09eb-467d-ba16-94497293d48e/reviews?product_remote_id=P200199572",
    }),
    price: "795000",
    shipping_fee: "0",
    width_cm: "114",
    length_cm: "215.4",
    height_cm: "105",
    material: "PB+LPM",
    storage_type: "closed_base",
    mattress_included: "false",
    evidence_notes: "공식 규격과 하부 막힘 구조, 공식 VReview 최신 표본 10건을 확인했습니다.",
  },
  "livart-P200183576-ss-sand": {
    ...livartPolicy,
    ...installed({ min: 4, max: 5 }),
    ...reviewed({
      sample: 9,
      rechecked: 2,
      counts: { smell: 1, delivery_delay: 1 },
      url: "https://one.vreview.tv/api/embed/v2/e5bae7ba-09eb-467d-ba16-94497293d48e/reviews?product_remote_id=P200183576",
    }),
    price: "617000",
    shipping_fee: "0",
    width_cm: "113.4",
    length_cm: "213",
    storage_type: "none",
    mattress_included: "false",
    evidence_notes: "공식 VReview 본문 9건을 전부 확인했고 냄새·배송지연은 각각 1건으로 반복 기준 미달입니다.",
  },

  "hanssem-411763-ss-drawer-color-unverified": {
    ...hanssemPolicy,
    ...installed({ min: 1, max: 10 }),
    ...reviewed({ sample: 10, rechecked: 2, url: "https://store.hanssem.com/goods/411763" }),
    price: "349900",
    shipping_fee: "0",
    width_cm: "116",
    length_cm: "206.2",
    height_cm: "91.2",
    material: "E0 등급 자재; 메이플 우드결 또는 화이트 표면재",
    colors: "메이플|화이트",
    storage_type: "drawer",
    mattress_included: "false",
    delivery_source_url: "https://gateway.hanssem.com/hanssem/goods-service/api/v1/goods/411763/delivery",
    policy_source_url: "https://image2.hanssem.com/howiz/policy/00_return_hs.jpg",
    evidence_notes: "공식 상품·배송 API·리뷰 최신 표본 10건을 확인했습니다.",
  },
  "hanssem-411762-ss-standard-color-unverified": {
    ...hanssemPolicy,
    ...installed({ min: 1, max: 10 }),
    ...reviewed({
      sample: 10,
      rechecked: 2,
      counts: { finish_poor: 1 },
      url: "https://store.hanssem.com/goods/411762",
    }),
    price: "252900",
    shipping_fee: "0",
    width_cm: "116",
    length_cm: "206.2",
    height_cm: "91.2",
    material: "E0 등급 자재; 메이플 우드결 또는 화이트 표면재",
    colors: "메이플|화이트",
    storage_type: "none",
    mattress_included: "false",
    delivery_source_url: "https://gateway.hanssem.com/hanssem/goods-service/api/v1/goods/411762/delivery",
    policy_source_url: "https://image2.hanssem.com/howiz/policy/00_return_hs.jpg",
    evidence_notes: "공식 리뷰 표본의 마감 불만 1건은 반복 위험 기준에 미달합니다.",
  },
  "hanssem-505285-ss-front-storage-color-unverified": {
    ...hanssemPolicy,
    ...installed({ min: 1, max: 10 }),
    ...reviewed({ sample: 10, rechecked: 2, url: "https://store.hanssem.com/goods/505285" }),
    price: "359900",
    shipping_fee: "0",
    width_cm: "116",
    length_cm: "220.4",
    height_cm: "100.4",
    material: "E0 등급 자재; 메이플 우드결 또는 화이트 표면재",
    colors: "메이플|화이트",
    storage_type: "none",
    mattress_included: "false",
    has_outlet: "true",
    delivery_source_url: "https://gateway.hanssem.com/hanssem/goods-service/api/v1/goods/505285/delivery",
    policy_source_url: "https://image2.hanssem.com/howiz/policy/00_return_hs.jpg",
    evidence_notes: "헤드 수납은 확인했으나 침대 하부 수납은 없는 옵션입니다. 공식 리뷰 표본 10건을 확인했습니다.",
  },
  "hanssem-724132-ss-type-a-natural-oak": {
    ...hanssemPolicy,
    ...installed({ min: 1, max: 10 }),
    ...reviewed({ sample: 10, rechecked: 2, url: "https://mall.hanssem.com/goods/goodsDetailMall.do?gdsNo=724132" }),
    price: "369000",
    shipping_fee: "0",
    width_cm: "116",
    length_cm: "214.7",
    height_cm: "91.2",
    material: "E0 등급 목대 프레임; LPM 선함침지",
    colors: "내추럴오크|코튼그레이",
    storage_type: "none",
    mattress_included: "false",
    delivery_source_url: "https://gateway.hanssem.com/hanssem/goods-service/api/v1/goods/724132/delivery",
    policy_source_url: "https://image2.hanssem.com/howiz/policy/00_return_hs.jpg",
    evidence_notes: "하부 서랍은 별도 상품이고 대상 옵션에는 포함되지 않습니다. 공식 리뷰 표본 10건을 확인했습니다.",
  },

  "zinus-1000000217-ss-no-install": {
    ...zinusPolicy,
    ...diy({ min: 1, max: 3 }),
    ...reviewed({ sample: 0, url: "https://www.zinus.co.kr/goods/goods_view.php?goodsNo=1000000217" }),
    availability: "out_of_stock",
    status: "sold_out",
    price: "205000",
    shipping_fee: "0",
    width_cm: "113",
    length_cm: "206",
    height_cm: "105",
    material: "분체도장 메탈 프레임; 아카시아 원목 패널; 합판 슬랫",
    storage_type: "legs_open",
    under_bed_clearance_cm: "30.6",
    mattress_included: "false",
    warranty_summary: "제조상 결함에 대해 구입일로부터 5년 품질보증이 제공됩니다.",
    evidence_notes: "공식 옵션 API에서 SS 미설치 옵션 재고 0과 판매 불가 상태를 확인해 품절로 제외합니다.",
  },
  "zinus-1000001084-min-option-unverified": {
    ...zinusPolicy,
    ...installed({ min: 3, max: 10 }),
    ...reviewed({ sample: 10, rechecked: 2, url: "https://www.zinus.co.kr/goods/goods_view.php?goodsNo=1000001084" }),
    variant_key: "ss-regular-cream-white",
    option_name: "크림화이트 / 일반형 / SS / 수도권·지방 설치배송",
    price: "499000",
    shipping_fee: "0",
    width_cm: "116",
    length_cm: "235.5",
    height_cm: "105",
    material: "PB+LPM+PP",
    storage_type: "closed_base",
    mattress_included: "false",
    spec_source_url: "https://remaster.speedgabia.com/zinus/frame/rbf/rbf11.jpg",
    evidence_notes: "공식 옵션 API 재고 999인 특정 SS 일반형 조합으로 고정하고, 공식 상세 이미지와 리뷰 10건을 확인했습니다.",
  },
  "zinus-1000001082-min-option-unverified": {
    ...zinusPolicy,
    ...installed({ min: 3, max: 10 }),
    ...reviewed({
      sample: 10,
      rechecked: 2,
      counts: { drawer_awkward: 2 },
      risks: "drawer_awkward",
      url: "https://www.zinus.co.kr/goods/goods_view.php?goodsNo=1000001082",
    }),
    variant_key: "ss-regular-cream-white",
    option_name: "크림화이트 / 일반형 / SS / 수도권·지방 설치배송",
    price: "374000",
    shipping_fee: "0",
    width_cm: "116",
    length_cm: "208.1",
    height_cm: "102",
    material: "PB+LPM+PP",
    storage_type: "closed_base",
    mattress_included: "false",
    spec_source_url: "https://remaster.speedgabia.com/zinus/frame/rbf/rbf11.jpg",
    evidence_notes: "공식 옵션 API 재고 99인 특정 SS 일반형 조합으로 고정했습니다. 리뷰 표본에서 수납 조작 불편이 2건 반복됐습니다.",
  },

  "ace-BRA1432-ss-regular-oak": {
    ...acePolicy,
    ...installed({ min: 10, max: 15 }),
    ...reviewed({
      sample: 2,
      rechecked: 1,
      url: "https://acebedmall.co.kr/front/review/ajaxReviewList.do?goodsNo=G2202221008_2340&pageGb=admin&page=1",
    }),
    price: "543720",
    shipping_fee: "0",
    width_cm: "114",
    length_cm: "209.9",
    height_cm: "89.8",
    material: "MDF",
    storage_type: "none",
    mattress_included: "false",
    delivery_source_url: "https://acebedmall.co.kr/front/img/product/delivery-detail.jpg",
    policy_source_url: "https://acebedmall.co.kr/front/img/product/delivery-detail.jpg",
    evidence_notes: "공식몰 판매중 상태·필수정보·배송/정책 이미지와 판매 SKU 리뷰 2건을 확인했습니다.",
  },
  "ace-BRA1437-ss-walnut-natural": {
    ...acePolicy,
    ...installed({ min: 10, max: 15 }),
    ...reviewed({
      sample: 0,
      url: "https://acebedmall.co.kr/front/review/ajaxReviewList.do?goodsNo=G1707191227_1004&pageGb=admin&page=1",
    }),
    price: "877680",
    shipping_fee: "0",
    width_cm: "114",
    length_cm: "213.3",
    height_cm: "100.8",
    material: "MDF+무늬목",
    storage_type: "none",
    mattress_included: "false",
    delivery_source_url: "https://acebedmall.co.kr/front/img/product/delivery-detail.jpg",
    policy_source_url: "https://acebedmall.co.kr/front/img/product/delivery-detail.jpg",
    evidence_notes: "공식몰 판매중 상태·필수정보·배송/정책 이미지와 판매 SKU 리뷰 0건을 확인했습니다.",
  },

  "sofsys-6117-ss-white": {
    ...sofsysPolicy,
    ...diy({ min: 1, max: 3, paidInstall: true, installationFee: 30000 }),
    ...reviewed({ sample: 6, rechecked: 2, url: "https://sofsys.co.kr/product/detail.html?product_no=6117" }),
    availability: "out_of_stock",
    status: "sold_out",
    price: "110900",
    shipping_fee: "0",
    width_cm: "110",
    length_cm: "203",
    height_cm: "18.5",
    material: "소나무 슬랫+분체도장 스틸",
    storage_type: "legs_open",
    under_bed_clearance_cm: "18.5",
    mattress_included: "false",
    evidence_notes: "공식 옵션 선택에서 SS는 품절이고 Q만 구매 가능해 공개에서 제외합니다. 공식 리뷰 6건을 확인했습니다.",
  },
  "sofsys-6910-ss-oak-platform": {
    ...sofsysPolicy,
    ...diy({ min: 3, max: 7 }),
    ...reviewed({ sample: 0, url: "https://sofsys.co.kr/product/detail.html?product_no=6910" }),
    price: "142900",
    shipping_fee: "20000",
    width_cm: "110.5",
    length_cm: "204",
    height_cm: "9",
    material: "소나무+E0 PB+LPM",
    storage_type: "closed_base",
    mattress_included: "false",
    evidence_notes: "공식 상품 규격·SS 재고·배송 조건과 공식 리뷰 0건을 확인했습니다.",
  },
  "sofsys-6827-ss-organic-set": {
    ...sofsysPolicy,
    ...diy({ min: 1, max: 3 }),
    ...reviewed({ sample: 0, url: "https://sofsys.co.kr/product/detail.html?product_no=6827" }),
    price: "346900",
    shipping_fee: "30000",
    width_cm: "110",
    length_cm: "203",
    height_cm: "39",
    material: "소나무 슬랫+분체도장 스틸 프레임; 오가닉 SS 매트리스",
    storage_type: "legs_open",
    mattress_included: "true",
    evidence_notes: "오가닉 매트리스 SS+심플 프레임 SS 조합을 공식 옵션에서 고정했고 공식 리뷰 0건을 확인했습니다.",
  },
  "sofsys-6829-ss-basic-set": {
    ...sofsysPolicy,
    ...diy({ min: 1, max: 3 }),
    ...reviewed({ sample: 0, url: "https://sofsys.co.kr/product/detail.html?product_no=6829" }),
    price: "282900",
    shipping_fee: "30000",
    width_cm: "110",
    length_cm: "203",
    height_cm: "39.5",
    material: "소나무 슬랫+분체도장 스틸 프레임; 베이직 SS 매트리스",
    storage_type: "legs_open",
    mattress_included: "true",
    evidence_notes: "베이직 매트리스 SS+심플 프레임 SS 조합을 공식 옵션에서 고정했고 공식 리뷰 0건을 확인했습니다.",
  },

  "englander-2640-ss-mdf-platform": {
    ...englanderPolicy,
    ...installed({ min: 7, max: 15, scheduled: false }),
    ...reviewed({ sample: 10, rechecked: 2, url: "https://englander.co.kr/goods/goods_view.php?goodsNo=2640#reviews" }),
    price: "179000",
    shipping_fee: "30000",
    width_cm: "120",
    length_cm: "207",
    height_cm: "80",
    material: "MDF",
    storage_type: "closed_base",
    mattress_included: "false",
    evidence_notes: "공식 SS 옵션·규격·수도권 배송비와 공식 리뷰 표본 10건을 확인했습니다.",
  },
  "englander-3494-ss-merbau-platform": {
    ...englanderPolicy,
    ...installed({ min: 7, max: 15, scheduled: false }),
    ...reviewed({
      sample: 10,
      rechecked: 2,
      counts: { squeak: 1, finish_poor: 1, delivery_delay: 1 },
      url: "https://englander.co.kr/goods/goods_view.php?goodsNo=3494#reviews",
    }),
    price: "179000",
    shipping_fee: "30000",
    width_cm: "120",
    length_cm: "207",
    height_cm: "80",
    material: "MDF+멀바우 무늬 표면재",
    storage_type: "closed_base",
    mattress_included: "false",
    evidence_notes: "공식 리뷰 표본의 소음·마감·배송지연은 각각 1건으로 반복 기준 미달입니다.",
  },
  "englander-5289-ss-storage-oak": {
    ...englanderPolicy,
    ...installed({ min: 7, max: 15, scheduled: false }),
    ...reviewed({ sample: 10, rechecked: 2, url: "https://englander.co.kr/goods/goods_view.php?goodsNo=5289#reviews" }),
    price: "329000",
    shipping_fee: "40000",
    width_cm: "114.5",
    length_cm: "214.5",
    height_cm: "101",
    material: "고무나무 노출부+MDF+PB",
    storage_type: "drawer",
    mattress_included: "false",
    has_outlet: "true",
    evidence_notes: "공식 SS 수납 옵션·규격·수도권 배송비와 공식 리뷰 표본 10건을 확인했습니다.",
  },
  "englander-5357-ss-storage-walnut": {
    ...englanderPolicy,
    ...installed({ min: 7, max: 15, scheduled: false }),
    ...reviewed({
      sample: 10,
      rechecked: 2,
      counts: { smell: 1 },
      url: "https://englander.co.kr/goods/goods_view.php?goodsNo=5357#reviews",
    }),
    price: "349000",
    shipping_fee: "40000",
    width_cm: "115",
    length_cm: "214.5",
    height_cm: "101",
    material: "고무나무 노출부+MDF+PB",
    storage_type: "drawer",
    mattress_included: "false",
    has_outlet: "true",
    evidence_notes: "공식 리뷰 표본의 냄새 언급 1건은 반복 위험 기준에 미달합니다.",
  },
  "englander-5470-ss-storage-tambour": {
    ...englanderPolicy,
    ...installed({ min: 7, max: 15, scheduled: false }),
    ...reviewed({
      sample: 10,
      rechecked: 2,
      counts: { smell: 1, finish_poor: 1 },
      url: "https://englander.co.kr/goods/goods_view.php?goodsNo=5470#reviews",
    }),
    option_name: "매트리스 제외 SS / 3단 서랍 수납+시크릿 벙커 수납",
    price: "309000",
    shipping_fee: "40000",
    width_cm: "114.5",
    length_cm: "214",
    height_cm: "100.5",
    material: "목재+MDF+PB",
    storage_type: "drawer",
    mattress_included: "false",
    has_outlet: "true",
    evidence_notes: "필수 SS 3단 서랍+벙커 옵션을 선택한 최종가 309,000원과 공식 리뷰 표본 10건을 확인했습니다.",
  },

  "marketb-6675-ss-daybed-pine": {
    ...marketbPolicy,
    ...diy({ min: 1, max: 1, paidInstall: true, installationFee: 39000 }),
    ...reviewed({
      sample: 10,
      rechecked: 2,
      counts: {
        assembly_hard: 3,
        manual_poor: 3,
        missing_parts: 2,
        finish_poor: 3,
        smell: 1,
        delivery_delay: 1,
        drawer_awkward: 1,
        wobble: 1,
      },
      risks: "assembly_hard|finish_poor|manual_poor|missing_parts",
      url: "https://marketb.kr/product/detail.html?product_no=6675",
    }),
    price: "225000",
    shipping_fee: "14000",
    width_cm: "119",
    length_cm: "210",
    height_cm: "65",
    material: "소나무 원목",
    storage_type: "legs_open",
    under_bed_clearance_cm: "23.5",
    mattress_included: "false",
    self_assembly: "medium",
    evidence_notes: "공식 VReview 10건을 전수 표본으로 확인했습니다. 조립·설명서·부품·마감 위험이 2건 이상 반복됩니다.",
  },
  "marketb-26956-ss-fabric-delta": {
    ...marketbPolicy,
    ...diy({ min: 1, max: 1, paidInstall: true, installationFee: 40000 }),
    ...reviewed({ sample: 1, rechecked: 1, url: "https://marketb.kr/product/detail.html?product_no=26956" }),
    price: "330000",
    shipping_fee: "0",
    width_cm: "118",
    length_cm: "206",
    height_cm: "99",
    material: "PB+MDF+패브릭",
    storage_type: "legs_open",
    mattress_included: "false",
    self_assembly: "medium",
    evidence_notes: "공식 규격·배송/설치 옵션과 공식 리뷰 1건을 확인했습니다.",
  },
  "marketb-40844-ss-fabric-nersen": {
    ...marketbPolicy,
    ...diy({ min: 1, max: 1, paidInstall: true, installationFee: 29000 }),
    ...reviewed({ sample: 0, url: "https://marketb.kr/product/detail.html?product_no=40844" }),
    price: "339000",
    shipping_fee: "33000",
    width_cm: "121.5",
    length_cm: "222",
    height_cm: "106.5",
    material: "소나무+합판+스틸+패브릭",
    storage_type: "legs_open",
    mattress_included: "false",
    evidence_notes: "공식 규격·배송/설치 옵션과 공식 리뷰 0건을 확인했습니다.",
  },
  "marketb-39151-ss-drawer-ondor": {
    ...marketbPolicy,
    ...installed({ min: 1, max: 3 }),
    ...reviewed({ sample: 0, url: "https://marketb.kr/product/detail.html?product_no=39151" }),
    price: "1090000",
    shipping_fee: "100000",
    width_cm: "112",
    length_cm: "217",
    height_cm: "101",
    material: "고무나무+MDF+LED·USB 헤드; 황토 보드+기능성 패브릭",
    storage_type: "drawer",
    mattress_included: "true",
    has_outlet: "true",
    evidence_notes: "공식 규격·설치배송·황토 보드 포함 SS 옵션과 공식 리뷰 0건을 확인했습니다.",
  },
};

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const original = await readFile(FILE, "utf8");
const records = parse(original, {
  bom: true,
  columns: true,
  skip_empty_lines: true,
  relax_column_count: false,
});
const columns = Object.keys(records[0]);
const seen = new Set();

for (const row of records) {
  const patch = patches[row.internal_key];
  if (!patch) throw new Error(`No audit patch for ${row.internal_key}`);
  seen.add(row.internal_key);
  Object.assign(row, {
    availability: "in_stock",
    status: "public",
    shipping_fee_confidence: "confirmed",
    bed_size: "SS",
    assembly_people: "1",
    commercial_verified_at: DATE,
    spec_verified_at: DATE,
    verified_by: REVIEWER,
    data_confidence: "confirmed",
    evidence_confidence: "confirmed",
    image_url: "",
    commercial_source_url: row.seller_url,
    delivery_source_url: row.seller_url,
    spec_source_url: row.seller_url,
    policy_source_url: row.seller_url,
    review_source_url: row.seller_url,
    commercial_confidence: "confirmed",
    delivery_confidence: "confirmed",
    spec_confidence: "confirmed",
    policy_confidence: "confirmed",
    review_confidence: "confirmed",
    review_sample_count: "0",
    review_risk_counts: "{}",
    review_verified_at: DATE,
    review_rechecked_count: "0",
    review_risks: "",
  }, patch);
  row.source_url = row.seller_url;
  row.source_note = `2026-07-21 공식 판매처·공식 리뷰 경로 재검수. ${row.evidence_notes}`;
}

const missing = Object.keys(patches).filter((key) => !seen.has(key));
if (missing.length) throw new Error(`Unknown audit keys: ${missing.join(", ")}`);
if (records.length !== 31) throw new Error(`Expected 31 products, got ${records.length}`);

const output = `\uFEFF${[
  columns.join(","),
  ...records.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
].join("\r\n")}\r\n`;
await writeFile(FILE, output, "utf8");

const publicCount = records.filter((row) => row.status === "public").length;
const excluded = records.filter((row) => row.status !== "public");
console.log(`Refreshed ${records.length} rows: ${publicCount} public, ${excluded.length} excluded.`);
for (const row of excluded) console.log(`- ${row.internal_key}: ${row.status} / ${row.availability}`);
