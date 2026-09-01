"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownLeft, BellRing, BookOpen, Building2, CalendarClock, CalendarDays,
  ChartNoAxesCombined, CircleCheckBig, CircleHelp, ClipboardCheck, ClipboardList,
  ClipboardPenLine, Download, FileCheck2, FileText, GraduationCap, Headset, Inbox,
  LayoutDashboard, Mail, Megaphone, MessageSquarePlus, MessagesSquare, NotebookPen,
  ReceiptText, School, Search, Settings, Settings2, ShieldCheck, Table2, TriangleAlert,
  UserCog, Users, UsersRound, Wallet, WalletCards, Workflow, type LucideIcon
} from "lucide-react";
import { LogoutButton } from "./LogoutButton";
import { SidebarNav, type NavGroup } from "./SidebarNav";
import { CommandPalette, type CommandItem } from "./CommandPalette";
import "./app-shell.css";

type Universe = "school" | "platform" | "teacher" | "guardian";
type Props = { universe: Universe; title: string; subtitle: string; active?: string; schoolName?: string; schoolCode?: string; userName?: string; role?: string; children: React.ReactNode };
type Group = { label: string; items: Array<{ icon: LucideIcon; label: string; href: string; primary?: boolean }> };

const schoolGroups: Group[] = [
  { label: "Home", items: [
    { icon: LayoutDashboard, label: "Home", href: "/dashboard", primary: true },
    { icon: Search, label: "Search", href: "/school/search" },
  ] },
  { label: "People", items: [
    { icon: UsersRound, label: "Students", href: "/school/students", primary: true },
    { icon: UsersRound, label: "Guardians", href: "/school/guardians" },
    { icon: UserCog, label: "Staff & Teachers", href: "/school/staff", primary: true },
    { icon: Building2, label: "Classes & Houses", href: "/school/classes", primary: true },
    { icon: MessageSquarePlus, label: "Admissions & Enrolment", href: "/school/admissions/enquiries" },
  ] },
  { label: "Academics", items: [
    { icon: BookOpen, label: "Subjects", href: "/school/subjects" },
    { icon: CalendarClock, label: "Timetable", href: "/school/timetable", primary: true },
    { icon: NotebookPen, label: "Lessons & Planning", href: "/school/lessons" },
    { icon: ClipboardPenLine, label: "Homework & Exercises", href: "/school/homework" },
    { icon: Table2, label: "Gradebook", href: "/school/gradebook", primary: true },
    { icon: GraduationCap, label: "Exams & Assessments", href: "/school/exams" },
    { icon: FileText, label: "Report Cards", href: "/school/report-cards" },
    { icon: Settings2, label: "Academic Setup", href: "/school/academics/setup" },
    { icon: CalendarDays, label: "Terms & Calendar", href: "/school/terms" },
  ] },
  { label: "Attendance", items: [
    { icon: CircleCheckBig, label: "Student Attendance", href: "/school/attendance", primary: true },
    { icon: Activity, label: "Staff Attendance", href: "/school/staff-attendance" },
    { icon: TriangleAlert, label: "Late / Absence", href: "/school/attendance/exceptions" },
    { icon: BellRing, label: "Guardian Alerts", href: "/school/communications/alerts" },
  ] },
  { label: "Finance", items: [
    { icon: Wallet, label: "School Fees", href: "/school/fees", primary: true },
    { icon: ReceiptText, label: "Invoices", href: "/school/fees/invoices" },
    { icon: ArrowDownLeft, label: "Payments", href: "/school/fees/payments" },
    { icon: WalletCards, label: "Arrears & Balances", href: "/school/fees/arrears" },
    { icon: ChartNoAxesCombined, label: "Finance Reports", href: "/school/fees/reports" },
    { icon: WalletCards, label: "Payroll", href: "/school/fees/payroll" },
  ] },
  { label: "Communication", items: [
    { icon: Mail, label: "Messages", href: "/school/communications/messages" },
    { icon: Megaphone, label: "Announcements", href: "/school/communications/announcements" },
    { icon: MessagesSquare, label: "SMS / WhatsApp", href: "/school/communications/broadcasts" },
    { icon: CalendarDays, label: "Events", href: "/school/events" },
  ] },
  { label: "Operations", items: [
    { icon: Users, label: "People Hub", href: "/school/people" },
    { icon: ClipboardList, label: "Pickup", href: "/school/pickup" },
    { icon: Building2, label: "Visitors", href: "/school/visitors" },
    { icon: Activity, label: "Devices", href: "/school/devices" },
  ] },
  { label: "Reports", items: [
    { icon: ChartNoAxesCombined, label: "School Analytics", href: "/school/reports/analytics" },
    { icon: FileText, label: "Reports", href: "/school/reports" },
    { icon: Download, label: "Downloads & Exports", href: "/school/downloads" },
  ] },
  { label: "Settings", items: [
    { icon: ShieldCheck, label: "Roles & Permissions", href: "/school/settings/roles" },
    { icon: UserCog, label: "Sub-accounts & Access", href: "/school/settings/access" },
    { icon: Settings, label: "School Settings", href: "/school/settings" },
    { icon: CircleHelp, label: "Help & Support", href: "/school/help" },
  ] },
];

const teacherGroups: Group[] = [
  { label: "Today", items: [
    { icon: LayoutDashboard, label: "Teacher Home", href: "/teacher", primary: true },
    { icon: CircleCheckBig, label: "My Attendance", href: "/teacher/attendance", primary: true },
    { icon: Table2, label: "My Gradebook", href: "/teacher/gradebook", primary: true },
    { icon: ClipboardPenLine, label: "My Homework", href: "/teacher/homework", primary: true },
  ] },
  { label: "Teaching", items: [
    { icon: Users, label: "My Students", href: "/teacher/students" },
    { icon: CalendarClock, label: "My Timetable", href: "/teacher/timetable" },
    { icon: NotebookPen, label: "My Lessons & Planning", href: "/teacher/module?view=My%20Lessons%20%26%20Planning" },
    { icon: GraduationCap, label: "My Assessments", href: "/teacher/module?view=My%20Assessments" },
  ] },
  { label: "Communication", items: [
    { icon: Mail, label: "My Messages", href: "/teacher/module?view=My%20Messages" },
    { icon: Megaphone, label: "Class Announcements", href: "/teacher/module?view=Class%20Announcements" },
  ] },
  { label: "Account", items: [
    { icon: Settings, label: "Account Security", href: "/account/security" },
    { icon: CircleHelp, label: "Help & Support", href: "/school/help" },
  ] },
];

const guardianGroups: Group[] = [
  { label: "Family", items: [
    { icon: LayoutDashboard, label: "Overview", href: "/guardian", primary: true },
    { icon: UsersRound, label: "My Children", href: "/guardian/children", primary: true },
    { icon: CircleCheckBig, label: "Attendance", href: "/guardian/attendance", primary: true },
    { icon: GraduationCap, label: "Academics", href: "/guardian/academics", primary: true },
    { icon: WalletCards, label: "Fees & Receipts", href: "/guardian/fees", primary: true },
    { icon: Mail, label: "Messages", href: "/guardian/messages", primary: true },
  ] },
];

const platformGroups: Group[] = [
  { label: "Control Center", items: [
    { icon: LayoutDashboard, label: "Overview", href: "/platform", primary: true },
    { icon: Search, label: "Global Search", href: "/platform/search", primary: true },
    { icon: Activity, label: "System Health", href: "/platform/health" },
  ] },
  { label: "Schools & Plans", items: [
    { icon: School, label: "Schools", href: "/platform/schools", primary: true },
    { icon: Workflow, label: "Plans & Entitlements", href: "/platform/plans" },
    { icon: WalletCards, label: "Platform Billing", href: "/platform/billing" },
    { icon: ChartNoAxesCombined, label: "Network Analytics", href: "/platform/analytics" },
  ] },
  { label: "Operations", items: [
    { icon: Headset, label: "Support", href: "/platform/support", primary: true },
    { icon: Inbox, label: "Visitor Inbox", href: "/platform/inbox" },
  ] },
  { label: "Security & Control", items: [
    { icon: UserCog, label: "Workers & Permissions", href: "/platform/admins" },
    { icon: Workflow, label: "Worker School Scope", href: "/platform/admins/access" },
    { icon: ShieldCheck, label: "Audit Log", href: "/platform/audit" },
    { icon: Settings2, label: "Platform Settings", href: "/platform/settings" },
  ] },
];

function normalize(groups: Group[]): NavGroup[] { return groups.map(({ label, items }) => ({ label, items })); }
function commandItems(groups: Group[]): CommandItem[] { return groups.flatMap((group) => group.items.map((item) => ({ label: item.label, href: item.href, group: group.label }))); }
function initials(value: string) { return value.trim().split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "S"; }

export function AppShell({ universe, title, subtitle, active = "Overview", schoolName = "School Workspace", schoolCode = "", userName = universe === "platform" ? "Platform Administrator" : universe === "guardian" ? "Guardian" : universe === "teacher" ? "Teacher" : "School Administrator", role = universe === "platform" ? "Super Admin" : universe === "guardian" ? "Guardian" : universe === "teacher" ? "Teacher" : "Administrator", children }: Props) {
  const groups = universe === "platform" ? platformGroups : universe === "teacher" ? teacherGroups : universe === "guardian" ? guardianGroups : schoolGroups;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const preferenceScope = `${universe}:${schoolCode || "platform"}:${userName || "user"}`.replace(/\s+/g, "_").toLowerCase();
  const isTeacher = universe === "teacher";
  const isGuardian = universe === "guardian";

  useEffect(() => {
    try { setCompact(localStorage.getItem(`sukuunova-sidebar-compact:${preferenceScope}`) === "true"); } catch { setCompact(false); }
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preferenceScope]);

  const paletteItems = useMemo(() => commandItems(groups), [groups]);
  const avatar = initials(userName);
  const toggleCompact = () => setCompact((value) => { const next = !value; try { localStorage.setItem(`sukuunova-sidebar-compact:${preferenceScope}`, String(next)); } catch {} return next; });

  return <div className={`app-shell app-shell-${universe} ${compact ? "is-compact" : ""}`}>
    <aside className="app-sidebar">
      <Link href="/" className="app-brand"><span className="app-brand-mark">S</span><span className="app-brand-copy"><strong>SukuuNova</strong><small>{universe === "platform" ? "Platform Control" : isGuardian ? "Guardian Portal" : isTeacher ? "Teacher Workspace" : "School Workspace"}</small></span></Link>
      <div className="app-school-chip"><span className="app-chip-avatar">{avatar}</span><span><b>{universe === "platform" ? "SukuuNova Network" : schoolName}</b><small>{universe === "platform" ? "All schools" : `${schoolCode}${schoolCode ? " · " : ""}School account`}</small></span></div>
      <SidebarNav groups={normalize(groups)} active={active} storageScope={preferenceScope} />
      <div className="app-sidebar-bottom"><div className="app-help"><Link href={universe === "platform" ? "/platform/support" : isGuardian ? "/guardian/messages" : "/school/help"}><CircleHelp size={15} aria-hidden="true" /><span>Help & Support</span></Link></div><div className="app-user-mini"><span className="app-user-avatar">{avatar}</span><span><b>{userName}</b><small>{role}</small></span></div><div className="app-account-actions"><Link href="/account/security" className="app-account-link"><Settings size={14} aria-hidden="true" /><span>Account security</span></Link><LogoutButton universe={universe === "platform" ? "platform" : universe === "guardian" ? "guardian" : "school"} /></div><button type="button" className="app-collapse-button" onClick={toggleCompact} aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}>{compact ? <Settings2 size={14} aria-hidden="true" /> : <span>Collapse sidebar</span>}</button></div>
    </aside>
    <main className="app-main"><header className="app-topbar"><div><div className="app-breadcrumb">SukuuNova <span>›</span> {universe === "platform" ? "Platform Control" : schoolName}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="app-top-actions"><button type="button" className="app-search" onClick={() => setPaletteOpen(true)} aria-label="Open command palette"><Search size={16} aria-hidden="true" /><span>Search anything</span><kbd>⌘ K</kbd></button><Link className="app-icon-button" href={universe === "platform" ? "/platform/inbox" : isGuardian ? "/guardian/messages" : isTeacher ? "/teacher/module?view=My%20Messages" : "/school/communications/alerts"} aria-label="Notifications"><BellRing size={17} aria-hidden="true" /><i /></Link></div></header><div className="app-content">{children}</div></main>
    <CommandPalette items={paletteItems} open={paletteOpen} onClose={() => setPaletteOpen(false)} liveSearchEndpoint={universe === "school" ? "/api/search" : undefined} />
  </div>;
}
