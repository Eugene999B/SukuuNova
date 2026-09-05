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
import { Menu, X } from "lucide-react";
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
];

function normalize(groups: Group[]): NavGroup[] { return groups.map(({ label, items }) => ({ label, items })); }
function commandItems(groups: Group[]): CommandItem[] { return groups.flatMap((group) => group.items.map((item) => ({ label: item.label, href: item.href, group: group.label }))); }
function initials(value: string) { return value.trim().split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "S"; }

export function AppShell({ universe, title, subtitle, active = "Overview", schoolName = "School Workspace", schoolCode = "", userName = universe === "platform" ? "Platform Administrator" : universe === "guardian" ? "Guardian" : universe === "teacher" ? "Teacher" : "School Administrator", role = universe === "platform" ? "Super Admin" : universe === "guardian" ? "Guardian" : universe === "teacher" ? "Teacher" : "Administrator", children }: Props) {
  const platformAccess = usePlatformNavigationAccess();
  const baseGroups = universe === "platform" ? platformGroups : universe === "teacher" ? teacherGroups : universe === "guardian" ? guardianGroups : schoolGroups;
  const groups = universe === "platform" && platformAccess ? baseGroups.map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || platformAccess[item.permission]) })).filter((group) => group.items.length > 0) : baseGroups;
  const [paletteOpen, setPaletteOpen] = useState(false);
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
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPaletteOpen(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preferenceScope]);

  const paletteItems = useMemo(() => commandItems(groups), [groups]);
  const avatar = initials(userName);
  const toggleCompact = () => { setCompact((value) => { const next = !value; try { localStorage.setItem(`sukuunova-sidebar-compact:${preferenceScope}`, String(next)); } catch {} return next; }); };

  // Bottom Navigation Items Tailored by Portal
  const bottomNavItems = useMemo(() => {
    if (universe === "school") {
      return [
        { label: "Home", href: "/dashboard", icon: LayoutDashboard },
        { label: "Attendance", href: "/school/attendance", icon: CircleCheckBig },
        { label: "Gradebook", href: "/school/gradebook", icon: Table2 },
        { label: "Fees", href: "/school/fees", icon: Wallet },
      ];
    }
    if (universe === "teacher") {
      return [
        { label: "Home", href: "/teacher", icon: LayoutDashboard },
        { label: "Attendance", href: "/teacher/attendance", icon: CircleCheckBig },
        { label: "Gradebook", href: "/teacher/gradebook", icon: Table2 },
        { label: "Homework", href: "/teacher/homework", icon: ClipboardPenLine },
      ];
    }
    if (universe === "guardian") {
      return [
        { label: "Home", href: "/guardian", icon: LayoutDashboard },
        { label: "Children", href: "/guardian/children", icon: UsersRound },
        { label: "Attendance", href: "/guardian/attendance", icon: CircleCheckBig },
        { label: "Fees", href: "/guardian/fees", icon: WalletCards },
      ];
    }
    return [
      { label: "Overview", href: "/platform", icon: LayoutDashboard },
      { label: "Schools", href: "/platform/schools", icon: School },
      { label: "Health", href: "/platform/health", icon: Activity },
      { label: "Billing", href: "/platform/billing", icon: WalletCards },
    ];
  }, [universe]);

  return (
    <div className={`app-shell app-shell-${universe} ${compact ? "is-compact" : ""} ${mobileDrawerOpen ? "is-drawer-open" : ""}`}>
      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <div className="app-mobile-backdrop" onClick={() => setMobileDrawerOpen(false)} aria-hidden="true" />
      )}

      {/* Main Sidebar / Mobile Drawer */}
      <aside className={`app-sidebar ${mobileDrawerOpen ? "is-open-mobile" : ""}`}>
        <div className="app-sidebar-top-bar">
          <Link href="/" className="app-brand" onClick={() => setMobileDrawerOpen(false)}>
            <span className="app-brand-mark">S</span>
            <span className="app-brand-copy">
              <strong>SukuuNova</strong>
              <small>{universe === "platform" ? "Platform Control" : isGuardian ? "Guardian Portal" : isTeacher ? "Teacher Workspace" : "School Workspace"}</small>
            </span>
          </Link>
          <button type="button" className="app-drawer-close" onClick={() => setMobileDrawerOpen(false)} aria-label="Close menu">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="app-school-chip">
          <span className="app-chip-avatar">{avatar}</span>
          <span>
            <b>{universe === "platform" ? "SukuuNova Network" : schoolName}</b>
            <small>{universe === "platform" ? "Operator workspace" : `${schoolCode}${schoolCode ? " · " : ""}School account`}</small>
          </span>
        </div>

        <SidebarNav groups={normalize(groups)} active={active} storageScope={preferenceScope} />

        <div className="app-sidebar-bottom">
          <div className="app-help">
            <Link href={universe === "platform" ? utilityHref : isGuardian ? "/guardian/messages" : "/school/help"}>
              <CircleHelp size={16} aria-hidden="true" />
              <span>Help & Support</span>
            </Link>
          </div>
          <div className="app-user-mini">
            <span className="app-user-avatar">{avatar}</span>
            <span>
              <b>{userName}</b>
              <small>{role}</small>
            </span>
          </div>
          <div className="app-account-actions">
            <Link href={universe === "platform" ? "/account/settings" : "/account/security"} className="app-account-link">
              <Settings size={15} aria-hidden="true" />
              <span>{universe === "platform" ? "Account settings" : "Account security"}</span>
            </Link>
            <LogoutButton universe={universe === "platform" ? "platform" : universe === "guardian" ? "guardian" : "school"} />
          </div>
          <button type="button" className="app-collapse-button" onClick={toggleCompact} aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}>
            {compact ? <Settings2 size={15} aria-hidden="true" /> : <span>Collapse sidebar</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-left">
            <button
              type="button"
              className="app-mobile-menu-btn"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={22} aria-hidden="true" />
            </button>
            <div className="app-topbar-title">
              <div className="app-breadcrumb">
                <span>SukuuNova</span>
                <span className="app-breadcrumb-sep">/</span>
                <span className="app-breadcrumb-current">{universe === "platform" ? "Platform Control" : schoolName}</span>
              </div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
          </div>

          <div className="app-top-actions">
            <button
              type="button"
              className="app-search"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
            >
              <Search size={16} aria-hidden="true" />
              <span className="app-search-text">{universe === "platform" ? "Search schools, logs…" : "Search anything..."}</span>
              <kbd className="app-search-kbd">⌘K</kbd>
            </button>

            <ThemeSwitcher />

            <Link className="app-icon-button" href={utilityHref} aria-label={utilityLabel} title={utilityLabel}>
              <BellRing size={18} aria-hidden="true" />
              <i className="app-bell-dot" />
            </Link>
          </div>
        </header>

        <div className="app-content">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="app-bottom-nav" aria-label="Mobile quick navigation">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.label;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`app-bottom-nav-item ${isActive ? "is-active" : ""}`}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className="app-bottom-nav-item"
          onClick={() => setMobileDrawerOpen(true)}
          aria-label="More navigation options"
        >
          <Menu size={20} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {/* Command Palette */}
      <CommandPalette
        items={paletteItems}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        liveSearchEndpoint={universe === "school" ? "/api/search" : undefined}
      />
    </div>
  );
}
