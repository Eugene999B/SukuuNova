"use client";

import { useEffect, type ReactNode } from "react";

export default function AutoPrint({ children }: { children: ReactNode }) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, []);

  return <>{children}</>;
}
