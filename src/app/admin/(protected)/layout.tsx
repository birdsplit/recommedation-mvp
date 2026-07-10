import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdmin();

  return (
    <div className="min-h-dvh pb-12">
      <header className="border-b border-[#E8DDD0] bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <Link href="/admin" className="text-[17px] font-extrabold text-ink">
            관리자
          </Link>
          <form action="/api/admin/logout" method="post">
            <button
              type="submit"
              className="rounded-full border border-[#E4D6C8] px-3.5 py-2 text-[12.5px] font-bold text-sub"
            >
              로그아웃
            </button>
          </form>
        </div>
        <nav aria-label="관리자 메뉴" className="mt-3 flex gap-2">
          <Link
            href="/admin"
            className="rounded-full bg-peach-50 px-3.5 py-2 text-[12.5px] font-bold text-coral-700"
          >
            대시보드
          </Link>
          <Link
            href="/admin/products"
            className="rounded-full bg-peach-50 px-3.5 py-2 text-[12.5px] font-bold text-coral-700"
          >
            상품 관리
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
