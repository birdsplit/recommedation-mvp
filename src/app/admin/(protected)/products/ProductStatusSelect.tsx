"use client";

import { useRef, useState } from "react";
import {
  PRODUCT_STATUS_LABELS,
  type ProductStatus,
} from "@/lib/constants";
import { changeProductStatusAction } from "./actions";

export function ProductStatusSelect({
  productId,
  status,
}: {
  productId: string;
  status: ProductStatus;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const action = changeProductStatusAction.bind(null, productId);

  return (
    <form ref={formRef} action={action} className="min-w-0">
      <label className="block text-[13px] font-bold text-faint" htmlFor={`status-${productId}`}>
        상태 즉시 변경
      </label>
      <div className="mt-1 flex items-center gap-2">
        <select
          id={`status-${productId}`}
          name="status"
          defaultValue={status}
          disabled={submitting}
          onChange={() => {
            setSubmitting(true);
            formRef.current?.requestSubmit();
          }}
          className="min-h-10 min-w-0 flex-1 rounded-xl border border-[#E7DBC9] bg-white px-3 text-[13px] font-bold outline-none focus:border-coral-500"
        >
          {(Object.entries(PRODUCT_STATUS_LABELS) as [ProductStatus, string][]).map(
            ([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            )
          )}
        </select>
        {submitting && <span className="text-[13px] text-sub">변경 중…</span>}
      </div>
      <button type="submit" className="sr-only">
        상태 변경
      </button>
    </form>
  );
}
