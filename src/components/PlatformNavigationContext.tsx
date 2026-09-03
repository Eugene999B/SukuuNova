"use client";

import { createContext, useContext, type ReactNode } from "react";

export type PlatformNavigationAccess = Record<string, boolean>;

const PlatformNavigationContext = createContext<PlatformNavigationAccess | null>(null);

export function PlatformNavigationProvider({ access, children }: { access: PlatformNavigationAccess; children: ReactNode }) {
  return <PlatformNavigationContext.Provider value={access}>{children}</PlatformNavigationContext.Provider>;
}

export function usePlatformNavigationAccess() {
  return useContext(PlatformNavigationContext);
}
