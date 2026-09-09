"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  BellRing,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  ChartNoAxesCombined,
  CircleCheckBig,
  CircleHelp,
  ClipboardList,
  ClipboardPenLine,
  Download,
  FileText,
  Gamepad2,
  GraduationCap,
  Headset,
  Inbox,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageSquarePlus,
  MessagesSquare,
  NotebookPen,
  ReceiptText,
  School,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  Table2,
  TriangleAlert,
  UserCog,
  Users,
  UsersRound,
  Wallet,
  WalletCards,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { LogoutButton } from "./LogoutButton";
import { SidebarNav, type NavGroup } from "./SidebarNav";
import { CommandPalette, type CommandItem } from "./CommandPalette";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { usePlatformNavigationAccess } from "./PlatformNavigationContext";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { SpeedDialActions } from "./SpeedDialActions";
import { Menu, X } from "lucide-react";
import { PageHeader } from "./PageHeader";
import "./app-shell.css";

type Universe = "school" | "platform" | "teacher" | "guardian";

type Props = {
  universe: Universe;
  title: string;
  subtitle: string;
  active?: string;
  schoolName?: string;
  schoolCode?: string;
  userName?: string;
  role?: string;
  children: ReactNode;
};

type Group = {
  label: string;
  items: Array<{
    icon: LucideIcon;
    label: string;
    href: string;
    primary?: boolean;
    permission?: string;
  }>;
};

const schoolGroups: Group[] = [
  { label: "Home", items: [
    { icon: LayoutDashboard, label: "Home", href: "/dashboard", primary: true },
  ] },
  { label: "People", items: [
    { icon: UsersRound, label: "Students", href: "/school/students", primary: true },
    { icon: UsersRound, label: "Guardians", href: "/school/guardians" },
    { icon: UserCog, label: "Staff & Teachers", href: "/school/staff", primary: true },
    { icon: Building2, label: "Classes & Houses", href: "/school/classes" },
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
    { icon: BookOpen, label: "Library & Resources", href: "/school/library" },
    { icon: Settings2, label: "Academic Setup", href: "/school/academics/setup" },
    { icon: CalendarDays, label: "Terms & Calendar", href: "/school/terms" },
  ] },
  { label: "Attendance", items: [
    { icon: CircleCheckBig, label: "Student Attendance", href: "/school/attendance" },
    { icon: Activity, label: "Staff Attendance", href: "/school/attendance/staff" },
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
  { label: "Settings & Access", items: [
    { icon: Settings, label: "Settings Home", href: "/school/settings", primary: true },
    { icon: UserCog, label: "People & Access", href: "/school/settings/access" },
    { icon: ShieldCheck, label: "Roles & Permissions", href: "/school/settings/roles" },
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
    { icon: Settings, label: "My Settings", href: "/teacher/settings", primary: true },
    { icon: ShieldCheck, label: "Account Security", href: "/account/security" },
    { icon: CircleHelp, label: "Help & Support", href: "/school/help" },
  ] },
];

const guardianGroups: Group[] = [
  { label: "Family", items: [
    { icon: LayoutDashboard, label: "Overview", href: "/guardian", primary: true },
    { icon: UsersRound, label: "My Children", href: "/guardian/children", primary: true },
    { icon: CircleCheckBig, label: "Attendance", href: "/guardian/attendance" },
    { icon: GraduationCap, label: "Academics", href: "/guardian/academics" },
    { icon: BookOpen, label: "Library & Resources", href: "/guardian/library" },
    { icon: WalletCards, label: "Fees & Receipts", href: "/guardian/fees" },
    { icon: Mail, label: "Messages", href: "/guardian/messages" },
    { icon: Gamepad2, label: "Learning Arcade", href: "/guardian/arcade" },
  ] },
  { label: "Account", items: [
    { icon: Settings, label: "Settings", href: "/guardian/settings", primary: true },
    { icon: ShieldCheck, label: "Account Security", href: "/account/security" },
  ] },
];

const platformGroups: Group[] = [
  { label: "Command", items: [
    { icon: LayoutDashboard, label: "Overview", href: "/platform", primary: true, permission: "analytics.view" },
    { icon: Search, label: "Global Search", href: "/platform/search", primary: true, permission: "schools.view" },
    { icon: Activity, label: "System Health", href: "/platform/health", permission: "security.manage" },
  ] },
  { label: "Network", items: [
    { icon: School, label: "Schools", href: "/platform/schools", primary: true, permission: "schools.view" },
    { icon: ChartNoAxesCombined, label: "Network Analytics", href: "/platform/analytics", primary: true, permission: "analytics.view" },
    { icon: Workflow, label: "Plans & Entitlements", href: "/platform/plans", permission: "plans.manage" },
    { icon: WalletCards, label: "Platform Billing", href: "/platform/billing", permission: "billing.view" },
  ] },
  { label: "Operations", items: [
    { icon: Headset, label: "Support", href: "/platform/support", primary: true, permission: "support.view" },
    { icon: Inbox, label: "Visitor Inbox", href: "/platform/inbox", permission: "support.view" },
  ] },
  { label: "Governance", items: [
    { icon: UserCog, label: "Workers & Permissions", href: "/platform/admins", permission: "admins.view" },
    { icon: Workflow, label: "Worker School Scope", href: "/platform/admins/access", permission: "admins.manage" },
    { icon: ShieldCheck, label: "Audit Log", href: "/platform/audit", permission: "audit.view" },
    { icon: Settings2, label: "Platform Settings", href: "/platform/settings", permission: "settings.manage" },
  ] },
  { label: "Personal", items: [
    { icon: Settings, label: "My Settings", href: "/account/settings" },
    { icon: ShieldCheck, label: "Account Security", href: "/account/security" },
  ] },
];

function normalize(groups: Group[]): NavGroup[] { return groups.map(({ label, items }) => ({ label, items })); }
function commandItems(groups: Group[]): CommandItem[] { return groups.flatMap((group) => group.items.map((item) => ({ label: item.label, href: item.href, group: group.label }))); }
function initials(value: string) { return value.trim().split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "S"; }

export function AppShell({ universe, title, subtitle, active = "Overview", schoolName = "School Workspace", schoolCode = "", userName = universe === "platform" ? "Platform Administrator" : universe === "guardian" ? "Guardian" : universe === "teacher" ? "Teacher" : "School Administrator", role = universe === "platform" ? "Super Admin" : universe === "guardian" ? "Guardian" : universe === "teacher" ? "Teacher" : "Administrator", children }: Props) {
  const platformAccess = usePlatformNavigationAccess();
  const baseGroups = universe === "platform" ? platformGroups : universe === "teacher" ? teacherGroups : universe === "guardian" ? guardianGroups : schoolGroups;
  const groups = universe === "platform" && platformAccess ? baseGroups.map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || platformAccess[item.permission]) })).filter((group) => group.items.length > 0) : baseGroups;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const preferenceScope = `${universe}:${schoolCode || "platform"}:${userName || "user"}`.replace(/\s+/g, "_").toLowerCase();
  const isTeacher = universe === "teacher";
  const isGuardian = universe === "guardian";
  const visiblePlatformItems = universe === "platform" ? groups.flatMap((group) => group.items) : [];
  const firstPlatformHref = visiblePlatformItems[0]?.href || "/account/settings";
  const utilityHref = universe === "platform" ? platformAccess?.["support.view"] ? "/platform/inbox" : firstPlatformHref : isGuardian ? "/guardian/messages" : isTeacher ? "/teacher/module?view=My%20Messages" : "/school/communications/alerts";
  const utilityLabel = universe === "platform" ? platformAccess?.["support.view"] ? "Open visitor inbox" : "Open platform workspace" : "Open notifications";

  useEffect(() => {
    try { setCompact(localStorage.getItem(`sukuunova-sidebar-compact:${preferenceScope}`) === "true"); } catch { setCompact(false); }
    const onKey = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInput = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLSelectElement;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (!isInput && event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preferenceScope]);

  const paletteItems = useMemo(() => commandItems(groups), [groups]);
  const avatar = initials(userName);
  const toggleCompact = () => { setCompact((value) => { const next = !value; try { localStorage.setItem(`sukuunova-sidebar-compact:${preferenceScope}`, String(next)); } catch {} return next; }); };

  const bottomNavItems = useMemo(() => {
    if (universe === "school") {
      return [
        { label: "Home", href: "/dashboard", icon: LayoutDashboard },
        { label: "Attendance", href: "/school/attendance", icon: CircleCheckBig },
        { label: "Gradebook", href: "/school/gradebook", icon: Table2 },
        { label: "Messages", href: "/school/communications/messages", icon: Mail },
      ];
    }
    if (universe === "guardian") {
      return [
        { label: "Home", href: "/guardian", icon: LayoutDashboard },
        { label: "Children", href: "/guardian/children", icon: UsersRound },
        { label: "Academics", href: "/guardian/academics", icon: GraduationCap },
        { label: "Messages", href: "/guardian/messages", icon: Mail },
      ];
    }
    if (universe === "teacher") {
      return [
        { label: "Home", href: "/teacher", icon: LayoutDashboard },
        { label: "Attendance", href: "/teacher/attendance", icon: CircleCheckBig },
        { label: "Gradebook", href: "/teacher/gradebook", icon: Table2 },
        { label: "Messages", href: "/teacher/messages", icon: Mail },
      ];
    }
    return visiblePlatformItems.slice(0,4).map((item)=>({label:item.label,href:item.href,icon:item.icon}));
  }, [universe, visiblePlatformItems]);

  return <div className={`app-shell ${compact ? "sidebar-compact" : ""}`}>
    <aside className={`app-sidebar ${mobileDrawerOpen ? "mobile-open" : ""}`}>
      <div className="app-sidebar-brand"><div className="app-sidebar-brandmark"><School size={20}/></div><div><strong>SukuuNova</strong><span>{schoolName}</span></div><button className="app-sidebar-close" onClick={()=>setMobileDrawerOpen(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <SidebarNav groups={normalize(groups)} active={active} compact={compact} onNavigate={()=>setMobileDrawerOpen(false)} />
      <div className="app-sidebar-bottom"><ThemeSwitcher compact={compact}/><button type="button" className="app-sidebar-utility" onClick={()=>setShortcutsOpen(true)}><CircleHelp size={17}/>{!compact&&<span>Keyboard shortcuts</span>}</button><LogoutButton compact={compact} universe={universe}/></div>
    </aside>
    {mobileDrawerOpen&&<button aria-label="Close navigation overlay" className="app-sidebar-backdrop" onClick={()=>setMobileDrawerOpen(false)}/>} 
    <main className="app-main">
      <div className="app-topbar"><div className="app-topbar-left"><button className="app-mobile-menu" onClick={()=>setMobileDrawerOpen(true)} aria-label="Open navigation"><Menu size={19}/></button><button className="app-compact-toggle" onClick={toggleCompact} aria-label="Toggle compact sidebar">{compact?"›":"‹"}</button><button className="app-command-trigger" onClick={()=>setPaletteOpen(true)}><Search size={15}/><span>Search or jump to…</span><kbd>Ctrl K</kbd></button></div><div className="app-topbar-actions"><Link href={utilityHref} className="app-topbar-icon" aria-label={utilityLabel}><BellRing size={17}/></Link><button className="app-avatar" type="button" onClick={()=>setPaletteOpen(true)} title={userName}>{avatar}</button></div></div>
      <PageHeader title={title} subtitle={subtitle}/>
      <div className="app-page-content">{children}</div>
    </main>
    <nav className="app-mobile-bottom-nav" aria-label="Mobile quick navigation">{bottomNavItems.map((item)=><Link key={item.href} href={item.href} className={active===item.label?"active":""}><item.icon size={18}/><span>{item.label}</span></Link>)}</nav>
    <SpeedDialActions universe={universe}/>
    <CommandPalette open={paletteOpen} onClose={()=>setPaletteOpen(false)} items={paletteItems}/>
    <KeyboardShortcutsModal open={shortcutsOpen} onClose={()=>setShortcutsOpen(false)}/>
  </div>;
}
