"use client";

import { useActionState, useState, type ReactNode } from "react";
import {
  PRODUCT_STATUS_LABELS,
  REVIEW_RISKS,
  ROBOT_FIT_LABELS,
  STORAGE_TYPE_LABELS,
} from "@/lib/constants";
import type { ProductFormValues } from "@/lib/admin-products";
import type { ProductActionState } from "@/app/admin/(protected)/products/actions";

type ProductFormAction = (
  state: ProductActionState,
  formData: FormData
) => Promise<ProductActionState>;

interface ProductFormProps {
  action: ProductFormAction;
  values: ProductFormValues;
  mode: "create" | "edit";
  today: string;
  metadata?: {
    id: string;
    createdAt: string;
    updatedAt: string;
  };
}

const INITIAL_STATE: ProductActionState = {
  status: "idle",
  message: "",
  fieldErrors: {},
};

const INPUT_CLASS =
  "mt-1.5 min-h-11 w-full rounded-xl border border-[#E7DBC9] bg-white px-3.5 text-sm outline-none transition focus:border-coral-500 focus:ring-2 focus:ring-coral-500/10 disabled:bg-slate-50";
const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-24 py-3 leading-6`;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

function FormSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-3xl bg-white p-5 shadow-card">
      <legend className="sr-only">{title}</legend>
      <p className="text-[13px] font-extrabold tracking-wide text-coral-600">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-extrabold">{title}</h2>
      {description && <p className="mt-1 text-[13px] leading-5 text-sub">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-[13px] font-extrabold text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-[13px] leading-5 text-faint">{hint}</p>}
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-[13px] font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function TextInput({
  name,
  label,
  value,
  error,
  hint,
  required,
  type = "text",
  placeholder,
  maxLength,
}: {
  name: string;
  label: string;
  value: string | null;
  error?: string;
  hint?: string;
  required?: boolean;
  type?: "text" | "url";
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <Field label={label} name={name} error={error} hint={hint}>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

function NumberInput({
  name,
  label,
  value,
  error,
  hint,
  required,
  min = 0,
  max,
}: {
  name: string;
  label: string;
  value: number | null;
  error?: string;
  hint?: string;
  required?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label} name={name} error={error} hint={hint}>
      <input
        id={name}
        name={name}
        type="number"
        defaultValue={value ?? ""}
        required={required}
        min={min}
        max={max}
        step={1}
        inputMode="numeric"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

function SelectInput({
  name,
  label,
  value,
  error,
  hint,
  options,
  allowUnknown = false,
}: {
  name: string;
  label: string;
  value: string | null;
  error?: string;
  hint?: string;
  options: ReadonlyArray<readonly [string, string]>;
  allowUnknown?: boolean;
}) {
  return (
    <Field label={label} name={name} error={error} hint={hint}>
      <select
        id={name}
        name={name}
        defaultValue={value ?? ""}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={INPUT_CLASS}
      >
        {allowUnknown && <option value="">미확인</option>}
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </Field>
  );
}

function CheckField({
  name,
  label,
  checked,
  error,
  description,
}: {
  name: string;
  label: string;
  checked: boolean;
  error?: string;
  description?: string;
}) {
  return (
    <div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-[#E7DBC9] px-3.5 py-3">
        <input
          type="checkbox"
          name={name}
          defaultChecked={checked}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${name}-error` : undefined}
          className="mt-0.5 size-4 accent-coral-600"
        />
        <span>
          <span className="block text-[13px] font-extrabold">{label}</span>
          {description && <span className="mt-0.5 block text-[13px] text-sub">{description}</span>}
        </span>
      </label>
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-[13px] font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function TextArea({
  name,
  label,
  value,
  error,
  hint,
  maxLength,
}: {
  name: string;
  label: string;
  value: string | null;
  error?: string;
  hint?: string;
  maxLength: number;
}) {
  return (
    <Field label={label} name={name} error={error} hint={hint}>
      <textarea
        id={name}
        name={name}
        defaultValue={value ?? ""}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={TEXTAREA_CLASS}
      />
    </Field>
  );
}

export function ProductForm({
  action,
  values,
  mode,
  today,
  metadata,
}: ProductFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const [verifiedDate, setVerifiedDate] = useState(values.last_verified_at);
  const [maximumVerifiedDate, setMaximumVerifiedDate] = useState(today);
  const error = (name: string) => state.fieldErrors[name];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {metadata && (
        <section className="rounded-2xl bg-white px-4 py-3 text-[13px] leading-5 text-faint shadow-soft">
          <p className="break-all"><strong className="text-sub">ID</strong> {metadata.id}</p>
          <p><strong className="text-sub">등록</strong> {metadata.createdAt}</p>
          <p><strong className="text-sub">수정</strong> {metadata.updatedAt}</p>
        </section>
      )}

      {state.status === "error" && (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"
          role="alert"
        >
          {state.message}
          {Object.keys(state.fieldErrors).length > 0 && (
            <span className="mt-1 block text-[13px] font-medium">
              표시된 항목을 고친 뒤 다시 저장해 주세요.
            </span>
          )}
        </div>
      )}

      <FormSection eyebrow="01 · BASIC" title="기본 정보">
        <TextInput
          name="name"
          label="상품명"
          value={values.name}
          error={error("name")}
          required
          maxLength={200}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput
            name="seller_name"
            label="판매처"
            value={values.seller_name}
            error={error("seller_name")}
            required
            maxLength={200}
          />
          <SelectInput
            name="status"
            label="상품 상태"
            value={values.status}
            error={error("status")}
            options={Object.entries(PRODUCT_STATUS_LABELS)}
          />
        </div>
        <TextInput
          name="seller_url"
          label="판매 링크"
          value={values.seller_url}
          error={error("seller_url")}
          type="url"
          placeholder="https://"
          required
        />
        <TextInput
          name="image_url"
          label="이미지 주소"
          value={values.image_url}
          error={error("image_url")}
          type="url"
          placeholder="https:// (선택)"
          hint="비워 두면 사용자 화면에서 기본 침대 그림을 표시합니다."
        />
      </FormSection>

      <FormSection eyebrow="02 · COST" title="비용·매트리스">
        <div className="grid grid-cols-2 gap-3">
          <NumberInput
            name="price"
            label="상품가 (원)"
            value={values.price}
            error={error("price")}
            required
            max={POSTGRES_INTEGER_MAX}
          />
          <NumberInput
            name="shipping_fee"
            label="기본 배송비 (원)"
            value={values.shipping_fee}
            error={error("shipping_fee")}
            required
            max={POSTGRES_INTEGER_MAX}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectInput
            name="installation_service"
            label="설치 서비스"
            value={values.installation_service}
            error={error("installation_service")}
            options={[
              ["none", "없음"],
              ["paid", "유료 제공"],
              ["included", "상품가에 포함"],
              ["unknown", "확인 필요"],
            ]}
          />
          <NumberInput
            name="installation_fee"
            label="설치비 (원)"
            value={values.installation_fee}
            error={error("installation_fee")}
            hint="미확인 또는 해당 없음이면 비워 두세요."
            max={POSTGRES_INTEGER_MAX}
          />
        </div>
        <CheckField
          name="mattress_included"
          label="매트리스 포함"
          checked={values.mattress_included}
        />
        <NumberInput
          name="mattress_price"
          label="미포함 시 매트리스 예상가 (원)"
          value={values.mattress_price}
          error={error("mattress_price")}
          hint="가격을 확인하지 못했으면 비워 두어 사용자에게 확인 필요로 표시합니다."
          max={POSTGRES_INTEGER_MAX}
        />
      </FormSection>

      <FormSection
        eyebrow="03 · DELIVERY"
        title="배송 조건"
        description="배송일은 주문일부터 계산한 달력일 기준입니다. 지역 제한은 마지막 신뢰 정보의 출처·지역 제한 메모에 기록하세요."
      >
        <div className="grid grid-cols-2 gap-3">
          <NumberInput
            name="delivery_days_min"
            label="최소 배송일"
            value={values.delivery_days_min}
            error={error("delivery_days_min")}
            required
            max={365}
          />
          <NumberInput
            name="delivery_days_max"
            label="최대 배송일"
            value={values.delivery_days_max}
            error={error("delivery_days_max")}
            required
            max={365}
          />
        </div>
        <CheckField
          name="scheduled_delivery"
          label="지정일 배송 가능"
          checked={values.scheduled_delivery}
        />
      </FormSection>

      <FormSection eyebrow="04 · STRUCTURE" title="크기·수납·하부 구조">
        <div className="grid grid-cols-3 gap-2">
          <NumberInput name="width_cm" label="가로 cm" value={values.width_cm} error={error("width_cm")} min={1} max={1000} />
          <NumberInput name="length_cm" label="세로 cm" value={values.length_cm} error={error("length_cm")} min={1} max={1000} />
          <NumberInput name="height_cm" label="높이 cm" value={values.height_cm} error={error("height_cm")} min={1} max={1000} />
        </div>
        <Field label="침대 규격" name="bed_size" error={error("bed_size")} hint="현재 MVP는 슈퍼싱글(SS)만 다룹니다.">
          <input id="bed_size" name="bed_size" value="SS" readOnly className={INPUT_CLASS} />
        </Field>
        <TextInput name="material" label="소재" value={values.material} error={error("material")} maxLength={200} />
        <SelectInput
          name="storage_type"
          label="수납 방식"
          value={values.storage_type}
          error={error("storage_type")}
          options={Object.entries(STORAGE_TYPE_LABELS)}
        />
        <NumberInput
          name="under_bed_clearance_cm"
          label="하부 높이 (cm)"
          value={values.under_bed_clearance_cm}
          error={error("under_bed_clearance_cm")}
          hint="하부가 막혔거나 실측하지 못했으면 비워 두세요."
          max={1000}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CheckField name="has_outlet" label="콘센트 있음" checked={values.has_outlet} />
          <CheckField name="has_headboard" label="헤드보드 있음" checked={values.has_headboard} />
        </div>
        <TextArea
          name="colors"
          label="색상"
          value={values.colors.join(", ")}
          error={error("colors")}
          maxLength={1000}
          hint="쉼표 또는 줄바꿈으로 구분해 최대 20개까지 입력하세요."
        />
        <SelectInput
          name="storage_capacity"
          label="예상 수납력"
          value={values.storage_capacity}
          error={error("storage_capacity")}
          allowUnknown
          options={[
            ["large", "큼"],
            ["medium", "중간"],
            ["small", "작음"],
            ["none", "없음"],
          ]}
        />
        <SelectInput
          name="dust_blocking"
          label="먼지 차단 정도"
          value={values.dust_blocking}
          error={error("dust_blocking")}
          allowUnknown
          options={[
            ["high", "높음"],
            ["medium", "중간"],
            ["low", "낮음"],
          ]}
        />
        <SelectInput
          name="cleaning_ease"
          label="청소 편의"
          value={values.cleaning_ease}
          error={error("cleaning_ease")}
          allowUnknown
          options={[
            ["easy", "쉬움"],
            ["medium", "보통"],
            ["hard", "어려움"],
          ]}
        />
        <SelectInput
          name="robot_vacuum_fit"
          label="로봇청소기 가능성"
          value={values.robot_vacuum_fit}
          error={error("robot_vacuum_fit")}
          allowUnknown
          options={Object.entries(ROBOT_FIT_LABELS)}
        />
      </FormSection>

      <FormSection eyebrow="05 · ASSEMBLY" title="운반·조립 조건">
        <SelectInput
          name="carry_difficulty"
          label="운반 난이도"
          value={values.carry_difficulty}
          error={error("carry_difficulty")}
          allowUnknown
          options={[
            ["easy", "쉬움"],
            ["medium", "보통"],
            ["hard", "어려움"],
          ]}
        />
        <CheckField
          name="carry_service_available"
          label="실내 운반 서비스 제공"
          checked={values.carry_service_available}
        />
        <SelectInput
          name="self_assembly"
          label="직접 조립 난이도"
          value={values.self_assembly}
          error={error("self_assembly")}
          allowUnknown
          options={[
            ["easy", "쉬움"],
            ["medium", "보통"],
            ["hard", "어려움"],
            ["not_possible", "직접 조립 불가"],
          ]}
        />
        <CheckField
          name="assembly_service_available"
          label="조립 서비스 제공"
          checked={values.assembly_service_available}
          error={error("assembly_service_available")}
          description="직접 조립 불가 또는 유료·포함 설치 상품이면 반드시 선택하세요."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberInput
            name="assembly_people"
            label="조립 필요 인원"
            value={values.assembly_people}
            error={error("assembly_people")}
            required
            min={1}
            max={20}
          />
          <TextInput
            name="assembly_tools"
            label="필요 공구"
            value={values.assembly_tools}
            error={error("assembly_tools")}
            maxLength={300}
          />
        </div>
        <SelectInput
          name="disassembly_ease"
          label="이사 시 분해 편의"
          value={values.disassembly_ease}
          error={error("disassembly_ease")}
          allowUnknown
          options={[
            ["easy", "쉬움"],
            ["medium", "보통"],
            ["hard", "어려움"],
          ]}
        />
      </FormSection>

      <FormSection eyebrow="06 · JUDGMENT" title="판단 데이터">
        <TextArea
          name="recommended_for"
          label="추천 대상"
          value={values.recommended_for}
          error={error("recommended_for")}
          maxLength={1000}
          hint="어떤 생활조건의 사용자에게 맞는지 한두 문장으로 적으세요."
        />
        <TextArea
          name="not_recommended_for"
          label="비추천 대상"
          value={values.not_recommended_for}
          error={error("not_recommended_for")}
          maxLength={1000}
          hint="치명적일 수 있는 생활조건을 숨기지 않고 적으세요."
        />
      </FormSection>

      <FormSection
        eyebrow="07 · REVIEW RISKS"
        title="리뷰 리스크"
        description="반복해서 확인된 항목만 선택하세요."
      >
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(REVIEW_RISKS).map(([risk, label]) => (
            <label
              key={risk}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-[#E7DBC9] px-3 py-2 text-[13px] font-bold"
            >
              <input
                type="checkbox"
                name="review_risks"
                value={risk}
                defaultChecked={values.review_risks.includes(
                  risk as keyof typeof REVIEW_RISKS
                )}
                className="size-4 accent-coral-600"
              />
              {label}
            </label>
          ))}
        </div>
        {error("review_risks") && (
          <p className="text-[13px] font-semibold text-red-700">{error("review_risks")}</p>
        )}
      </FormSection>

      <FormSection eyebrow="08 · TRUST" title="신뢰 정보">
        <SelectInput
          name="data_confidence"
          label="정보 신뢰도"
          value={values.data_confidence}
          error={error("data_confidence")}
          options={[
            ["confirmed", "확인됨"],
            ["estimated", "추정"],
          ]}
        />
        <TextArea
          name="source_note"
          label="정보 출처·지역 제한 메모"
          value={values.source_note}
          error={error("source_note")}
          maxLength={1000}
          hint="공식몰 상세페이지, 판매처 답변 등 출처와 도서산간·특정 지역 제한을 함께 기록하세요."
        />
        <Field
          label="마지막 확인일"
          name="last_verified_at"
          error={error("last_verified_at")}
          hint="상품 페이지와 배송·설치 조건을 마지막으로 확인한 날짜입니다."
        >
          <div className="mt-1.5 flex gap-2">
            <input
              id="last_verified_at"
              name="last_verified_at"
              type="date"
              required
              value={verifiedDate}
              max={maximumVerifiedDate}
              onChange={(event) => setVerifiedDate(event.target.value)}
              aria-invalid={Boolean(error("last_verified_at"))}
              aria-describedby={
                error("last_verified_at") ? "last_verified_at-error" : undefined
              }
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#E7DBC9] bg-white px-3 text-sm outline-none focus:border-coral-500"
            />
            <button
              type="button"
              onClick={() => {
                const currentToday = new Intl.DateTimeFormat("en-CA", {
                  timeZone: "Asia/Seoul",
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }).format(new Date());
                setMaximumVerifiedDate(currentToday);
                setVerifiedDate(currentToday);
              }}
              className="min-h-11 shrink-0 rounded-xl bg-peach-50 px-3 text-[13px] font-extrabold text-coral-700"
            >
              오늘로 확인일 갱신
            </button>
          </div>
        </Field>
      </FormSection>

      <div className="sticky bottom-3 z-10 rounded-3xl border border-white/80 bg-cream/95 p-3 shadow-card backdrop-blur">
        <button
          type="submit"
          disabled={pending}
          className="min-h-13 w-full rounded-full bg-gradient-to-r from-[#C8431B] to-[#A82E0C] px-6 text-sm font-extrabold text-white shadow-cta disabled:cursor-wait disabled:opacity-60"
        >
          {pending
            ? "저장 중…"
            : mode === "create"
              ? "상품 등록"
              : "변경사항 저장"}
        </button>
      </div>
    </form>
  );
}
