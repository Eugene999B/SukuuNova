"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, MessageCircle, RefreshCw, ServerCog, ShieldAlert } from "lucide-react";

type Provider = { configured: boolean; endpointConfigured?: boolean; tokenConfigured?: boolean; senderConfigured: boolean; accountConfigured?: boolean; authConfigured?: boolean };
type Status = { checkedAt: string; sms: Provider; whatsapp: Provider };

function State({ configured }: { configured: boolean }) {
  return <span className={`platform-status ${configured ? "platform-status-healthy" : "platform-status-watch"}`}>{configured ? "Ready" : "Action needed"}</span>;
}

export default function PlatformMessagingProviderReadiness() {
  const [data, setData] = useState<Status | null>(null), [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const response = await fetch("/api/platform/messaging-provider", { cache: "no-store" });
      if (response.ok) setData(await response.json() as Status);
    } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  if (!data) return <section className="app-card app-panel platform-empty"><strong>Checking provider readiness…</strong><span>Credentials are never returned to the browser.</span></section>;
  return <section className="app-card app-panel">
    <div className="app-card-head"><div><span className="app-eyebrow">PROVIDER READINESS</span><h2>SMS & WhatsApp delivery cockpit</h2><p>The platform can already use its configured messaging senders. This view only reports configuration state; secrets remain in the server environment.</p></div><ServerCog size={21}/></div>
    <div className="platform-choice-grid">
      <div className="is-selected" style={{ cursor: "default" }}><MessageCircle size={17}/><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><strong>SMS provider</strong><State configured={data.sms.configured}/></div><span>{data.sms.configured ? "Endpoint and provider token are available." : "Configure SMS_PROVIDER_URL and SMS_PROVIDER_TOKEN."}</span><small>{data.sms.senderConfigured ? "Sender ID configured." : "Sender ID is optional for some providers, but not configured here."}</small></div>
      <div className="is-selected" style={{ cursor: "default" }}><MessageCircle size={17}/><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><strong>Twilio WhatsApp</strong><State configured={data.whatsapp.configured}/></div><span>{data.whatsapp.configured ? "Account, authentication and WhatsApp sender are available." : "Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM."}</span><small>{data.whatsapp.senderConfigured ? "WhatsApp sender configured." : "WhatsApp sender is missing."}</small></div>
    </div>
    <div className="platform-calculation-card"><div><span className="platform-calculation-label">Operational rule</span><strong>Inventory first · delivery second</strong><small>School credit allocation is now backed by platform-owned inventory. Delivery uses the existing server-side SMS/WhatsApp outbox configuration.</small></div>{data.sms.configured && data.whatsapp.configured ? <CheckCircle2 size={22}/> : <ShieldAlert size={22}/>}</div>
    <button type="button" className="app-pill" onClick={() => void load()} disabled={busy}><RefreshCw size={13}/>Refresh readiness</button>
    <small style={{ display: "block", marginTop: 8, color: "var(--sn-muted)", fontSize: 9 }}>Last checked {new Date(data.checkedAt).toLocaleString()}</small>
  </section>;
}
