import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import PlatformSmsHistoryClient from "@/components/PlatformSmsHistoryClient";
import "@/components/platform-sms-center.css";
import { requirePlatformSession } from "@/lib/auth";
import { getPlatformSmsHistory } from "@/lib/platform-sms-history-service";

export const dynamic = "force-dynamic";

export default async function PlatformSmsHistoryPage() {
  const session = await requirePlatformSession();
  const history = await getPlatformSmsHistory(session);

  return <AppShell
    universe="platform"
    title="SMS History"
    subtitle="Provider submission and delivery-receipt history across direct, school-audience and system SMS."
    active="SMS Center"
    userName={session.name}
    role={session.role}
  >
    <div className="sms-center">
      <section className="sms-hero">
        <div>
          <span className="sms-eyebrow"><History size={15}/> DELIVERY AUDIT</span>
          <h2>SMS History</h2>
          <p>Open any SMS to inspect its recipient, message, provider reference and the full path from submission to confirmed delivery or failure.</p>
        </div>
        <Link href="/platform/sms" className="sms-button secondary"><ArrowLeft size={16}/> Back to SMS Center</Link>
      </section>
      <PlatformSmsHistoryClient initialData={JSON.parse(JSON.stringify(history))} />
    </div>
  </AppShell>;
}
