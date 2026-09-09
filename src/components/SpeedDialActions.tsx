"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, CircleCheckBig, FileText, Keyboard, MessageSquare, Sparkles, Wallet, X } from "lucide-react";

type Props = {
  universe: "school" | "platform" | "teacher" | "guardian";
  onOpenShortcuts?: () => void;
};

export function SpeedDialActions({ universe, onOpenShortcuts }: Props) {
  const [open, setOpen] = useState(false);
  const getQuickLinks = () => {
    if (universe === "teacher") return [
      { label: "Mark Class Attendance", href: "/teacher/attendance", icon: CircleCheckBig, color: "var(--color-brand)" },
      { label: "Enter Student Marks", href: "/teacher?view=My%20Gradebook", icon: FileText, color: "var(--color-info)" },
      { label: "My Timetable", href: "/teacher?view=My%20Timetable", icon: FileText, color: "var(--color-accent-indigo)" },
    ];
    if (universe === "guardian") return [
      { label: "View Attendance History", href: "/guardian/attendance", icon: CircleCheckBig, color: "var(--color-brand)" },
      { label: "View Outstanding Fees", href: "/guardian/fees", icon: Wallet, color: "var(--color-warning)" },
      { label: "My Messages", href: "/guardian/messages", icon: MessageSquare, color: "var(--color-accent-indigo)" },
    ];
    if (universe === "platform") return [
      { label: "Network Health Status", href: "/platform/health", icon: Activity, color: "var(--color-brand)" },
      { label: "Platform Messages", href: "/platform/messages", icon: MessageSquare, color: "var(--color-info)" },
      { label: "Platform Billing", href: "/platform/billing", icon: Wallet, color: "var(--color-warning)" },
    ];
    return [
      { label: "Student Attendance", href: "/school/attendance", icon: CircleCheckBig, color: "var(--color-brand)" },
      { label: "Collect Fee Payment", href: "/school/fees/payments", icon: Wallet, color: "var(--color-warning)" },
      { label: "Send a Message", href: "/school/communications/messages", icon: MessageSquare, color: "var(--color-info)" },
    ];
  };
  const quickLinks = getQuickLinks();

  return <div className={`sn-speed-dial ${open ? "is-open" : ""}`}>
    {open && <div className="sn-speed-dial-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
    {open && <div className="sn-speed-dial-menu" role="menu" aria-label="Quick Actions Hub">
      <div className="sn-speed-dial-header"><div className="sn-speed-dial-live-pill"><span className="sn-live-dot" /><span>Ghana Region West · Active</span></div></div>
      <div className="sn-speed-dial-items">
        {quickLinks.map(item => {
          const Icon = item.icon;
          return <Link key={item.label} href={item.href} className="sn-speed-dial-item" onClick={() => setOpen(false)} role="menuitem"><span className="sn-speed-dial-item-icon" style={{ background: `${item.color}15`, color: item.color }}><Icon size={16} aria-hidden="true" /></span><span className="sn-speed-dial-item-label">{item.label}</span></Link>;
        })}
        <button type="button" className="sn-speed-dial-item sn-speed-dial-btn" onClick={() => { setOpen(false); onOpenShortcuts?.(); }} role="menuitem"><span className="sn-speed-dial-item-icon" style={{ background: "var(--sn-surface)", color: "var(--sn-ink)" }}><Keyboard size={16} aria-hidden="true" /></span><span className="sn-speed-dial-item-label">Keyboard Shortcuts</span><kbd className="sn-speed-dial-kbd">?</kbd></button>
      </div>
    </div>}
    <button type="button" className="sn-speed-dial-trigger" onClick={() => setOpen(value => !value)} aria-label={open ? "Close quick actions hub" : "Open quick actions hub"} aria-expanded={open} title="Quick Actions and Shortcuts"><span className="sn-speed-dial-trigger-inner">{open ? <X size={20} aria-hidden="true" /> : <Sparkles size={20} aria-hidden="true" />}</span><span className="sn-speed-dial-ping" /></button>
  </div>;
}
