import type { ReactNode } from "react";
import { PlatformNavigationProvider, type PlatformNavigationAccess } from "@/components/PlatformNavigationContext";
import { requirePlatformSession } from "@/lib/auth";
import { hasPlatformPermission } from "@/lib/platform-permissions";

const PLATFORM_NAV_PERMISSIONS = [
  "analytics.view",
  "schools.view",
  "plans.manage",
  "billing.view",
  "support.view",
  "admins.view",
  "audit.view",
  "security.manage",
  "settings.manage",
] as const;

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await requirePlatformSession();
  const entries = await Promise.all(
    PLATFORM_NAV_PERMISSIONS.map(async (permission) => [permission, await hasPlatformPermission(session, permission)] as const),
  );
  const access: PlatformNavigationAccess = Object.fromEntries(entries);
  return <PlatformNavigationProvider access={access}>{children}</PlatformNavigationProvider>;
}
