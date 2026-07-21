"use client";

import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";

type DataMode = "demo" | "live";
const DataModeContext = createContext<DataMode>("demo");

export function useDataMode(): DataMode {
  return useContext(DataModeContext);
}

export function AppFrame({
  children,
  dataMode,
}: {
  children: React.ReactNode;
  dataMode: DataMode;
}) {
  const pathname = usePathname();
  const wide =
    pathname.startsWith("/results") ||
    pathname.startsWith("/compare") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/browse/shortlist");

  return (
    <DataModeContext.Provider value={dataMode}>
      <div
        className={`mx-auto min-h-dvh w-full bg-cream ${
          wide ? "max-w-[1120px]" : "max-w-[430px]"
        }`}
      >
        {children}
      </div>
    </DataModeContext.Provider>
  );
}
