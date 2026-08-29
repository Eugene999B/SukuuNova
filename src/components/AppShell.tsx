import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { SidebarNav } from "./SidebarNav";
import "./app-shell.css";

type Universe = "school" | "platform" | "teacher";
type NavItem = [icon: string, label: string, href: string];
type NavGroup = { label: string; items: NavItem[] };
type Props = {
  universe: Universe;
  title: string;
  subtitle: string;
  active?: string;
  schoolName?: string;
  schoolCode?: string;
  userName?: string;
  role?: string;
  children: React.ReactNode;
};

const schoolGroups: NavGroup[] = [
  { label: "Workspace", items: [["▦", "Overview", "/dashboard"], ["♟", "People Hub", "/school/people"], ["⌕", "Search", "/school/search"]] },
  { label: "People", items: [["♟", "Students", "/school/students"], ["♧", "Guardians", "/school/guardians"], ["♙", "Staff & Teachers", "/school/staff"]] },
  { label: "Admissions", items: [["✎", "Enquiries", "/school/admissions/enquiries"], ["☷", "Applications", "/school/admissions/applications"], ["✓", "Enrolment", "/school/admissions/enrolment"], ["⌂", "Classes & Houses", "/school/classes"]] },
  { label: "Academics", items: [["▤", "Subjects", "/school/subjects"], ["◷", "Timetable", "/school/timetable"], ["▣", "Print Timetable", "/school/timetable/print"], ["⚙", "Academic Setup", "/school/academics/setup"], ["◫", "Terms & Calendar", "/school/terms"], ["✓", "Academic Readiness", "/school/academics/health"], ["▧", "Lessons & Planning", "/school/lessons"], ["✦", "Homework & Exercises", "/school/homework"], ["▥", "Gradebook", "/school/gradebook"], ["▦", "Gradebook Studio", "/school/gradebook/studio"], ["◉", "Performance Studio", "/school/academics/performance"], ["◇", "Exams & Assessments", "/school/exams"], ["▤", "Report Cards", "/school/report-cards"]] },
  { label: "Attendance", items: [["◉", "Student Attendance", "/school/attendance"], ["◌", "Staff Attendance", "/school/staff-attendance"], ["!", "Late / Absence", "/school/attendance/exceptions"], ["⌁", "Guardian Alerts", "/school/communications/alerts"]] },
  { label: "Finance", items: [["₵", "School Fees", "/school/fees"], ["▣", "Invoices", "/school/fees/invoices"], ["↙", "Payments", "/school/fees/payments"], ["◒", "Arrears & Balances", "/school/fees/arrears"], ["◔", "Finance Reports", "/school/fees/reports"], ["▤", "Payroll", "/school/fees/payroll"]] },
  { label: "School Life", items: [["▦", "Library", "/school/library"], ["⌁", "Transport", "/school/transport"], ["☕", "Feeding", "/school/feeding"], ["▧", "Assets & Inventory", "/school/inventory"], ["♙", "Recruitment", "/school/hr/recruitment"]] },
  { label: "Communication", items: [["✉", "Messages", "/school/communications/messages"], ["◈", "Announcements", "/school/communications/announcements"], ["◫", "SMS / WhatsApp", "/school/communications/broadcasts"], ["◷", "Events", "/school/events"], ["⚙", "Communication Settings", "/school/communications/settings"]] },
  { label: "Reports & Admin", items: [["▥", "School Analytics", "/school/reports/analytics"], ["▤", "Reports", "/school/reports"], ["⇩", "Downloads & Exports", "/school/downloads"], ["♚", "Roles & Permissions", "/school/settings/roles"], ["♟", "Sub-accounts & Access", "/school/settings/access"], ["⚙", "School Settings", "/school/settings"]] },
  { label: "Support", items: [["?", "Help & Support", "/school/help"]] },
];

const teacherModule = (label: string) => `/teacher/module?view=${encodeURIComponent(label)}`;
const teacherGroups: NavGroup[] = [
  { label: "My Workspace", items: [["▦", "Teacher Home", "/teacher"], ["♙", "My Students", "/teacher/students"], ["◷", "My Timetable", teacherModule("My Timetable")] ] },
  { label: "Teaching", items: [["▧", "My Lessons & Planning", teacherModule("My Lessons & Planning")], ["✦", "My Homework", teacherModule("My Homework")], ["▥", "My Gradebook", teacherModule("My Gradebook")], ["◇", "My Assessments", teacherModule("My Assessments")]] },
  { label: "Classroom", items: [["◉", "My Attendance", teacherModule("My Attendance")], ["▣", "My Classes", teacherModule("My Classes")]] },
  { label: "Communication", items: [["✉", "My Messages", teacherModule("My Messages")], ["◈", "Class Announcements", teacherModule("Class Announcements")]] },
  { label: "Account", items: [["⚙", "Account Security", "/account/security"], ["?", "Help & Support", "/school/help"]] },
];

const platformGroups: NavGroup[] = [
  { label: "Control Center", items: [["▦", "Overview", "/platform"], ["⌕", "Global Search", "/platform/search"], ["◉", "System Health", "/platform/health"]] },
  { label: "Schools & Plans", items: [["⌂", "Schools", "/platform/schools"], ["◇", "Plans & Entitlements", "/platform/plans"], ["₵", "Platform Billing", "/platform/billing"], ["▥", "Network Analytics", "/platform/analytics"]] },
  { label: "Operations", items: [["♟", "Support", "/platform/support"], ["⌁", "Audited Access", "/platform/support"], ["✉", "Visitor Inbox", "/platform/inbox"], ["▤", "Platform Reports", "/platform/reports"]] },
  { label: "Security & Control", items: [["♙", "Workers & Permissions", "/platform/admins"], ["⌁", "Worker School Scope", "/platform/admins/access"], ["◇", "Audit Log", "/platform/audit"], ["⚙", "Platform Settings", "/platform/settings"] },
];

function initials(value: string) {
  return value.trim().split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "S";
}

export function AppShell({ universe, title, subtitle, active = "Overview", schoolName = "School Workspace", schoolCode = "", userName = universe === "platform" ? "Platform Administrator" : "School Administrator", role = universe === "platform" ? "Super Admin" : universe === "teacher" ? "Teacher" : "Administrator", children }: Props) {
  const groups = universe === "platform" ? platformGroups : universe === "teacher" ? teacherGroups : schoolGroups;
  const avatar = initials(userName);
  const isTeacher = universe === "teacher";
  return (
    <div className={`app-shell app-shell-${universe}`}>
      <aside className="app-sidebar">
        <Link href="/" className="app-brand"><span className="app-brand-mark">S</span><span><strong>SukuuNova</strong><small>{universe === "platform" ? "Platform Control" : isTeacher ? "Teacher Workspace" : "School Workspace"}</small></span></Link>
        <div className="app-school-chip"><span className="app-chip-avatar">{avatar}</span><span><b>{universe === "platform" ? "SukuuNova Network" : schoolName}</b><small>{universe === "platform" ? "All schools" : `${schoolCode}${schoolCode ? " · " : ""}School account`}</small></span></div>
        <SidebarNav groups={groups} active={active} />
        <div className="app-sidebar-bottom">
          <div className="app-help"><Link href={universe === "platform" ? "/platform/support" : "/school/help"}>? <span>Help & Support</span></Link></div>
          <div className="app-user-mini"><span className="app-user-avatar">{avatar}</span><span><b>{userName}</b><small>{role}</small></span></div>
          <div className="app-account-actions"><Link href="/account/security" className="app-account-link">⚙ Account security</Link><LogoutButton universe={universe === "platform" ? "platform" : "school"} /></div>
        </div>
      </aside>
      <main className="app-main">
        <header className="app-topbar"><div><div className="app-breadcrumb">SukuuNova <span>›</span> {universe === "platform" ? "Platform Control" : schoolName}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="app-top-actions"><Link className="app-search" href={universe === "platform" ? "/platform/search" : isTeacher ? "/teacher" : "/school/search"}><span>⌕</span> Search anything <kbd>⌘ K</kbd></Link><Link className="app-icon-button" href={universe === "platform" ? "/platform/inbox" : isTeacher ? teacherModule("My Messages") : "/school/communications/alerts"} aria-label="Notifications">◌<i /></Link></div></header>
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
