"use client";

import { useEffect } from "react";

export default function SchoolStoreDeepLinkController() {
  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    if (view !== "history") return;
    const timer = window.setTimeout(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".store-tabs button"));
      buttons.find((button) => button.textContent?.trim() === "Sales history")?.click();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
