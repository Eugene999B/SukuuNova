import { AppShell } from "@/components/AppShell";
import { PublicLeadInbox } from "@/components/PublicLeadInbox";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";

export default async function InboxPage(){
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "support.view");
  return <AppShell universe="platform" title="Visitor Inbox" subtitle="Visitor inbox." userName={session.name} role={session.role}><PublicLeadInbox /></AppShell>;
}
