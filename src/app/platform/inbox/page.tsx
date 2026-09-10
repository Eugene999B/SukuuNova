import { AppShell } from "@/components/AppShell";
import { PublicLeadInbox } from "@/components/PublicLeadInbox";
import "@/components/public-lead-inbox-v3.css";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";

export default async function InboxPage(){
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "support.view");
  return <AppShell universe="platform" title="Visitor Inbox" subtitle="Track public enquiries from first contact through accountable follow-up." active="Visitor Inbox" userName={session.name} role={session.role}><PublicLeadInbox /></AppShell>;
}
