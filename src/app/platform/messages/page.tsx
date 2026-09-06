import { AppShell } from "@/components/AppShell";
import PlatformMessagingDesk from "@/components/PlatformMessagingDesk";
import { requirePlatformSession } from "@/lib/auth";

export default async function PlatformMessagesPage(){
 const session=await requirePlatformSession();
 return <AppShell universe="platform" title="Platform Messages" subtitle="Send governed communication across assigned schools and recipients." active="Messages" userName={session.name} role={session.role}><PlatformMessagingDesk/></AppShell>;
}
