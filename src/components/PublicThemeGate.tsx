"use client";

import { usePathname } from "next/navigation";
import { PublicThemePicker } from "./PublicThemePicker";

export function PublicThemeGate() {
  const pathname = usePathname();
  const visible = pathname === "/" || pathname.startsWith("/login/");
  return visible ? <div className="public-theme-floating"><PublicThemePicker /></div> : null;
}
