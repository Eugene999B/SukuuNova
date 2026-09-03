import { AppShell } from "@/components/AppShell";
import { PublicLeadInbox } from "@/components/PublicLeadInbox";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";

export default async function InboxPage(){
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "support.view");
  return <AppShell universe="platform" title="Visitor Inbox" subtitle="Messages from people who found SukuuNova on the public site, ready for a human follow-up." userName={session.name} role={session.role}><PublicLeadInbox /></AppShell>;
}
