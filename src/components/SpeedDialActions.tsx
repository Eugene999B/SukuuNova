"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  CircleCheckBig,
  FileText,
  Keyboard,
  Layers,
  Megaphone,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";

type Props = {
  universe: "school" | "platform" | "teacher" | "guardian";
  onOpenShortcuts: () => void;
};

export function SpeedDialActions({ universe, onOpenShortcuts }: Props) {
  const [open, setOpen] = useState(false);

  const getQuickLinks = () => {
    if (universe === "teacher") {
      return [
        { label: "Mark Class Attendance", href: "/teacher/attendance", icon: CircleCheckBig, color: "#0f766e" },
        { label: "Enter Student Marks", href: "/teacher?view=My%20Gradebook", icon: FileText, color: "#2563eb" },
        { label: "My Timetable", href: "/teacher?view=My%20Timetable", icon: FileText, color: "#7c3aed" },
      ];
    }
    if (universe === "guardian") {
      return [
        { label: "View Attendance History", href: "/guardian/attendance", icon: CircleCheckBig, color: "#0f766e" },
        { label: "View Outstanding Fees", href: "/guardian/fees", icon: Wallet, color: "#d97706" },
        { label: "Children Records", href: "/guardian/children", icon: FileText, color: "#7c3aed" },
      ];
    }
    if (universe === "platform") {
      return [
        { label: "Network Health Status", href: "/platform/health", icon: Activity, color: "#0f766e" },
        { label: "Inspect School Tenant", href: "/platform/schools", icon: Layers, color: "#2563eb" },
        { label: "Platform Billing", href: "/platform/billing", icon: Wallet, color: "#d97706" },
      ];
    }
    return [
      { label: "Student Attendance", href: "/school/attendance", icon: CircleCheckBig, color: "#0f766e" },
      { label: "Collect Fee Payment", href: "/school/fees/payments", icon: Wallet, color: "#d97706" },
      { label: "Broadcast SMS / Alert", href: "/school/communications/broadcasts", icon: Megaphone, color: "#e11d48" },
    ];
  };

  const quickLinks = getQuickLinks();

  return (
    <div className={`sn-speed-dial ${open ? "is-open" : ""}`}>
      {open && (
        <div
          className="sn-speed-dial-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {open && (
        <div className="sn-speed-dial-menu" role="menu" aria-label="Quick Actions Hub">
          <div className="sn-speed-dial-header">
            <div className="sn-speed-dial-live-pill">
              <span className="sn-live-dot" />
              <span>Ghana Region West · Active</span>
            </div>
          </div>

          <div className="sn-speed-dial-items">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="sn-speed-dial-item"
                  onClick={() => setOpen(false)}
                  role="menuitem"
                >
                  <span className="sn-speed-dial-item-icon" style={{ background: `${item.color}15`, color: item.color }}>
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="sn-speed-dial-item-label">{item.label}</span>
                </Link>
              );
            })}

            <button
              type="button"
              className="sn-speed-dial-item sn-speed-dial-btn"
              onClick={() => {
                setOpen(false);
                onOpenShortcuts();
              }}
              role="menuitem"
            >
              <span className="sn-speed-dial-item-icon" style={{ background: "rgba(100, 116, 139, 0.15)", color: "var(--sn-ink)" }}>
                <Keyboard size={16} aria-hidden="true" />
              </span>
              <span className="sn-speed-dial-item-label">Keyboard Shortcuts</span>
              <kbd className="sn-speed-dial-kbd">?</kbd>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="sn-speed-dial-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "Close quick actions hub" : "Open quick actions hub"}
        aria-expanded={open}
        title="Quick Actions and Shortcuts"
      >
        <span className="sn-speed-dial-trigger-inner">
          {open ? <X size={20} aria-hidden="true" /> : <Sparkles size={20} aria-hidden="true" />}
        </span>
        <span className="sn-speed-dial-ping" />
      </button>
    </div>
  );
}
