"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight, Bell, CheckCircle2, ClipboardList, GraduationCap,
  LayoutDashboard, School, Users, WalletCards
} from "lucide-react";

const views = [
  { id: "overview", label: "Command centre", icon: LayoutDashboard },
  { id: "people", label: "People", icon: Users },
  { id: "academics", label: "Academics", icon: GraduationCap },
  { id: "finance", label: "Finance", icon: WalletCards },
] as const;

type ViewId = typeof views[number]["id"];

const previewData: Record<ViewId, { title: string; eyebrow: string; summary: string; metrics: [string,string,string][] }> = {
  overview: {
    title: "School command centre",
    eyebrow: "Today",
    summary: "A calm starting point for the people, learning and operations that need attention now.",
    metrics: [["Students", "1,248", "Active records"], ["Attendance", "94.6%", "Today"], ["Needs attention", "7", "Open items"]]
  },
  people: {
    title: "People at a glance",
    eyebrow: "People",
    summary: "Move from staff and learners to the exact person who needs an action.",
    metrics: [["Learners", "1,248", "Across classes"], ["Staff", "86", "Active accounts"], ["Families", "934", "Linked guardians"]]
  },
  academics: {
    title: "Academic operations",
    eyebrow: "Academics",
    summary: "Keep terms, classes, marks, attendance and report cards connected.",
    metrics: [["Classes", "42", "Configured"], ["Assignments", "318", "This term"], ["Reports", "39", "Ready for review"]]
  },
  finance: {
    title: "Finance desk",
    eyebrow: "Finance",
    summary: "See collections, balances and follow-up work without digging through screens.",
    metrics: [["Collected", "GH₵184k", "This term"], ["Open invoices", "126", "Need follow-up"], ["Receipts", "1,904", "Recorded"]]
  }
};

export function HomeProductPreview() {
  const [view, setView] = useState<ViewId>("overview");
  const current = previewData[view];
  const progress = useMemo(() => (view === "overview" ? 82 : view === "people" ? 71 : view === "academics" ? 64 : 78), [view]);

  return (
    <section className="home-product-preview" aria-label="SukuuNova product preview">
      <div className="home-preview-window">
        <div className="home-preview-toolbar">
          <div className="home-preview-brand"><span className="home-preview-mark">S</span><span><strong>SukuuNova</strong><small>Illustrative school workspace</small></span></div>
          <div className="home-preview-status"><CheckCircle2 size={14} aria-hidden="true" /> Sample data</div>
        </div>
        <div className="home-preview-layout">
          <aside className="home-preview-sidebar" aria-label="Preview navigation">
            {views.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" className={view === id ? "is-active" : ""} onClick={() => setView(id)}>
                <Icon size={16} aria-hidden="true" /><span>{label}</span>
              </button>
            ))}
            <div className="home-preview-sidebar-spacer" />
            <div className="home-preview-safety"><Bell size={15} aria-hidden="true" /><span>Role-based access</span></div>
          </aside>
          <div className="home-preview-main">
            <div className="home-preview-heading"><div><span>{current.eyebrow}</span><h3>{current.title}</h3><p>{current.summary}</p></div><School size={22} aria-hidden="true" /></div>
            <div className="home-preview-metrics">
              {current.metrics.map(([label, value, meta]) => <article key={label}><small>{label}</small><strong>{value}</strong><span>{meta}</span></article>)}
            </div>
            <div className="home-preview-grid">
              <article className="home-preview-panel"><div className="home-preview-panel-head"><span>School readiness</span><strong>{progress}%</strong></div><div className="home-preview-progress"><i style={{ width: `${progress}%` }} /></div><div className="home-preview-checks"><span><CheckCircle2 size={14} aria-hidden="true" /> Profile & branding</span><span><CheckCircle2 size={14} aria-hidden="true" /> Academic calendar</span><span><CheckCircle2 size={14} aria-hidden="true" /> Classes & subjects</span></div></article>
              <article className="home-preview-panel"><div className="home-preview-panel-head"><span>Next actions</span><ClipboardList size={16} aria-hidden="true" /></div><div className="home-preview-action"><div><strong>Review attendance exceptions</strong><small>4 learners need attention</small></div><ArrowRight size={15} aria-hidden="true" /></div><div className="home-preview-action"><div><strong>Approve report cards</strong><small>3 ready for your review</small></div><ArrowRight size={15} aria-hidden="true" /></div><div className="home-preview-action"><div><strong>Follow up unpaid invoices</strong><small>12 families need contact</small></div><ArrowRight size={15} aria-hidden="true" /></div></article>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
