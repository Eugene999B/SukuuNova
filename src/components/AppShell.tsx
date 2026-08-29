import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import "./app-shell.css";

type Universe = "school" | "platform";
type NavItem = [icon: string, label: string, href: string];
type NavGroup = { label: string; items: NavItem[] };
type Props = { universe: Universe; title: string; subtitle: string; active?: string; schoolName?: string; schoolCode?: string; userName?: string; role?: string; children: React.ReactNode };

const schoolGroups: NavGroup[] = [
  { label: "Workspace", items: [["▦", "Overview", "/dashboard"], ["♟", "People Hub", "/school/people"], ["⌕", "Search", "/school/search"]] },
  { label: "People", items: [["♟", "Students", "/school/students"], ["♧", "Guardians", "/school/guardians"], ["♙", "Staff & Teachers", "/school/staff"]] },
  { label: "Admissions", items: [["✎", "Enquiries", "/school/admissions/enquiries"], ["☷", "Applications", "/school/admissions/applications"], ["✓", "Enrolment", "/school/admissions/enrolment"], ["⌂", "Classes & Houses", "/school/classes"]] },
  { label: "Academics", items: [["▤", "Subjects", "/school/subjects"], ["◷", "Timetable", "/school/timetable"], ["▣", "Print Timetable", "/school/timetable/print"], ["⚙", "Academic Setup", "/school/academics/setup"], ["✓", "Academic Readiness", "/school/academics/health"], ["✓", "Finish the Term", "/school/academics/term-completion"], ["▧", "Lessons & Planning", "/school/lessons"], ["✦", "Homework & Exercises", "/school/homework"], ["▥", "Gradebook", "/school/gradebook"], ["▦", "Gradebook Studio", "/school/gradebook/studio"], ["◉", "Performance Studio", "/school/academics/performance"], ["◇", "Exams & Assessments", "/school/exams"], ["▤", "Report Cards", "/school/report-cards"]] },
  { label: "Attendance", items: [["◉", "Student Attendance", "/school/attendance"], ["◌", "Staff Attendance", "/school/staff-attendance"], ["!", "Late / Absence", "/school/attendance/exceptions"], ["⌁", "Guardian Alerts", "/school/communications/alerts"]] },
  { label: "Finance", items: [["₵", "School Fees", "/school/fees"], ["▣", "Invoices", "/school/fees/invoices"], ["↙", "Payments", "/school/fees/payments"], ["◒", "Arrears & Balances", "/school/fees/arrears"], ["◔", "Finance Reports", "/school/fees/reports"]] },
  { label: "School Life", items: [["▦", "Library", "/school/library"], ["⌁", "Transport", "/school/transport"], ["☕", "Feeding", "/school/feeding"], ["▧", "Assets & Inventory", "/school/inventory"], ["♙", "Recruitment", "/school/hr/recruitment"]] },
  { label: "Communication", items: [["✉", "Messages", "/school/communications/messages"], ["◈", "Announcements", "/school/communications/announcements"], ["◫", "SMS / WhatsApp", "/school/communications/broadcasts"], ["◷", "Events", "/school/events"] },
  { label: "Reports & Admin", items: [["▥", "School Analytics", "/school/reports/analytics"], ["▤", "Reports", "/school/reports"], ["⇩", "Downloads & Exports", "/school/downloads"], ["♚", "Roles & Permissions", "/school/settings/roles"], ["♟", "Sub-accounts & Access", "/school/settings/access"], ["⚙", "School Settings", "/school/settings"]] }
];

const platformGroups: NavGroup[] = [
  { label: "Control Center", items: [["▦", "Overview", "/platform"], ["⌕", "Global Search", "/platform/search"], ["◉", "System Health", "/platform/health"]] },
  { label: "Schools & Plans", items: [["⌂", "Schools", "/platform/schools"], ["◇", "Plans & Entitlements", "/platform/plans"], ["₵", "Platform Billing", "/platform/billing"], ["▥", "Network Analytics", "/platform/analytics"] },
  { label: "Operations", items: [["♟", "Support", "/platform/support"], ["⌁", "Audited Access", "/platform/support"], ["✉", "Visitor Inbox", "/platform/inbox"], ["▤", "Platform Reports", "/platform/reports"] },
  { label: "Security & Control", items: [["♙", "Workers & Permissions", "/platform/admins"], ["⌁", "Worker School Scope", "/platform/admins/access"], ["◇", "Audit Log", "/platform/audit"], ["⚙", "Platform Settings", "/platform/settings"] }
];

function initials(value: string) { return value.trim().split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "S"; }

export function AppShell({ universe, title, subtitle, active = "Overview", schoolName = "School Workspace", schoolCode = "", userName = universe === "school" ? "School Administrator" : "Platform Administrator", role = universe === "school" ? "Administrator" : "Super Admin", children }: Props) {
  const groups = universe === "school" ? schoolGroups : platformGroups;
  const avatar = initials(userName);
  return <div className={`app-shell app-shell-${universe}`}>
    <aside className="app-sidebar">
      <Link href="/" className="app-brand"><span className="app-brand-mark">S</span><span><strong>SukuuNova</strong><small>{universe === "school" ? "School Workspace" : "Platform Control"}</small></span></Link>
      <div className="app-school-chip"><span className="app-chip-avatar">{universe === "school" ? avatar : "SN"}</span><span><b>{universe === "school" ? schoolName : "SukuuNova Network"}</b><small>{universe === "school" ? `${schoolCode}${schoolCode ? " · " : ""}School account` : "All schools"}</small></span></div>
      <nav className="app-nav" aria-label="Primary navigation">{groups.map((group) => <div className="app-nav-group" key={group.label}><div className="app-nav-label">{group.label}</div>{group.items.map(([icon, label, href]) => <Link key={label} href={href} className={`app-nav-item ${active === label ? "is-active" : ""}`}><span className="app-nav-icon">{icon}</span><span>{label}</span>{active === label ? <span className="app-nav-active-dot" /> : null}</Link>)}</div>)}</nav>
      <div className="app-sidebar-bottom">
        <Link href={universe === "school" ? "/school/help" : "/platform/support"} className="app-help">? <span>Help & Support</span></Link>
        <div className="app-user-mini"><span className="app-user-avatar">{avatar}</span><span><b>{userName}</b><small>{role}</small></span></div>
        <div className="app-account-actions"><Link href="/account/security" className="app-account-link">⚙ Account security</Link><LogoutButton universe={universe} /></div>
      </div>
    </aside>
    <main className="app-main">
      <header className="app-topbar"><div><div className="app-breadcrumb">SukuuNova <span>›</span> {universe === "school" ? schoolName : "Platform Control"}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="app-top-actions"><Link className="app-search" href={universe === "school" ? "/school/search" : "/platform/search"}><span>⌕</span> Search anything <kbd>⌘ K</kbd></Link><Link className="app-icon-button" href={universe === "school" ? "/school/communications/alerts" : "/platform/inbox"} aria-label="Notifications">◌<i /></Link></div></header>
      <div className="app-content">{children}</div>
    </main>
  </div>;
}
