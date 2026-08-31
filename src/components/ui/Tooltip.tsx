"use client";

import type { ReactNode } from "react";

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="sn-tooltip-wrap" title={label}>{children}</span>;
}
