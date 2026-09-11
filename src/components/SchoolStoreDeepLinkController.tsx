"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function SchoolStoreDeepLinkController() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");

  useEffect(() => {
    if (view !== "history") return;
    const timer = window.setTimeout(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".store-tabs button"));
      buttons.find((button) => button.textContent?.trim() === "Sales history")?.click();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [view]);

  return null;
}
