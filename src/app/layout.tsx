import type { Metadata, Viewport } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { DataModeBanner } from "@/components/DataModeBanner";
import { AppFrame } from "@/components/AppFrame";
import { SERVICE_NAME } from "@/lib/constants";
import { getDataMode } from "@/lib/data-mode";

export const metadata: Metadata = {
  title: {
    default: `${SERVICE_NAME} — 내 생활조건에 맞는 침대 3개`,
    template: `%s · ${SERVICE_NAME}`,
  },
  description:
    "수납·청소·운반·조립·총비용까지 한 번에 비교해서, 내 생활조건에 맞는 슈퍼싱글 침대 후보 3개를 골라드려요.",
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const dataMode = getDataMode();

  return (
    <html lang="ko">
      <body className="font-sans">
        <AppFrame dataMode={dataMode}>
          <DataModeBanner mode={dataMode} />
          {children}
        </AppFrame>
      </body>
    </html>
  );
}
