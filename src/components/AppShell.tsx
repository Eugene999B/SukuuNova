import Link from "next/link";
import "./app-shell.css";

type Universe = "school" | "platform";

type Props = {
  universe: Universe;
  title: string;
  subtitle: string;
  active?: string;
  children: React.ReactNode;
};

const schoolGroups = [
  { label: "Workspace", items: [["▦", "Overview", "/dashboard"], ["⌕", "Search", "#"]] },
  { label: "People", items: [["♟", "Students", "#"], ["♧", "Parents & Guardians", "#"], ["♙", "Staff & Teachers", "/phase2"]] },
  { label: "Admissions", items: [["✎", "Enquiries", "#"], ["☷", "Applications", "#"], ["✓", "Enrolment", "#"], ["⌂", "Classes & Houses", "#"]] },
  { label: "Academics", items: [["▤", "Subjects", "#"], ["◷", "Timetable", "/phase2"], ["▧", "Lessons & Planning", "#"], ["✦", "Homework & Exercises", "#"], ["▥", "Gradebook", "/mvp"], ["◇", "Exams & Assessments", "#"], ["▤", "Report Cards", "#"]] },
  { label: "Attendance", items: [["◉", "Student Attendance", "/phase3"], ["◌", "Staff Attendance", "/phase2"], ["!", "Late / Absence", "#"], ["⌁", "Parent Alerts", "#"]] },
  { label: "Finance", items: [["₵", "School Fees", "/phase3"], ["▣", "Invoices", "#"], ["↙", "Payments", "/phase3"], ["◒", "Arrears & Balances", "#"], ["◔", "Finance Reports", "#"]] },
  { label: "School Life", items: [["▦", "Library", "/phase3"], ["⌁", "Transport", "/phase3"], ["☕", "Feeding", "/phase3"], ["▧", "Assets & Inventory", "/phase3"], ["♙", "Recruitment", "/phase3"]] },
  { label: "Communication", items: [["✉", "Messages", "#"], ["◈", "Announcements", "#"], ["◫", "SMS / WhatsApp", "#"], ["◷", "Events", "#"]] },
  { label: "Reports & Admin", items: [["▥", "School Analytics", "/phase3"], ["▤", "Reports", "#"], ["♚", "Roles & Permissions", "/phase2/roles"], ["⚙", "School Settings", "/phase2"]] }
];

const platformGroups = [
  { label: "Control Center", items: [["▦", "Overview", "/platform"], ["⌕", "Global Search", "#"], ["◉", "System Health", "#"]] },
  { label: "SukuuNova Network", items: [["⌂", "Schools", "/platform/schools/new"], ["◈", "Subscriptions", "#"], ["₵", "Platform Billing", "#"]] },
  { label: "Operations", items: [["♟", "Support", "#"], ["⌁", "Audited Access", "#"], ["▤", "Platform Reports", "#"]] },
  { label: "Security", items: [["♙", "Administrators", "#"], ["◇", "Audit Log", "#"], ["⚙", "Platform Settings", "#"]] }
];

export function AppShell({ universe, title, subtitle, active = "Overview", children }: Props) {
  const groups = universe === "school" ? schoolGroups : platformGroups;
  return (
    <div className={`app-shell app-shell-${universe}`}>
      <aside className="app-sidebar">
        <Link href="/" className="app-brand">
          <span className="app-brand-mark">S</span>
          <span><strong>SukuuNova</strong><small>{universe === "school" ? "School Workspace" : "Platform Control"}</small></span>
        </Link>
        <div className="app-school-chip">
          <span className="app-chip-avatar">{universe === "school" ? "TS" : "SN"}</span>
          <span><b>{universe === "school" ? "Test School" : "SukuuNova Network"}</b><small>{universe === "school" ? "TEST001 · Term 1" : "All schools"}</small></span>
          <span className="app-chevron">⌄</span>
        </div>
        <nav className="app-nav" aria-label="Primary navigation">
          {groups.map(group => <div className="app-nav-group" key={group.label}>
            <div className="app-nav-label">{group.label}</div>
            {group.items.map(([icon, label, href]) => <Link key={label} href={href} className={`app-nav-item ${active === label ? "is-active" : ""} ${href === "#" ? "is-planned" : ""}`} title={href === "#" ? `${label} — coming in the next implementation pass` : label}>
              <span className="app-nav-icon">{icon}</span><span>{label}</span>{active === label ? <span className="app-nav-active-dot" /> : null}
            </Link>)}
          </div>)}
        </nav>
        <div className="app-sidebar-bottom">
          <Link href={universe === "school" ? "/phase4" : "/platform"} className="app-help">? <span>Help & Support</span></Link>
          <div className="app-user-mini"><span className="app-user-avatar">{universe === "school" ? "TO" : "PA"}</span><span><b>{universe === "school" ? "Test Owner" : "Platform Admin"}</b><small>{universe === "school" ? "Owner" : "Super Admin"}</small></span><span className="app-dots">•••</span></div>
        </div>
      </aside>
      <main className="app-main">
        <header className="app-topbar">
          <div><div className="app-breadcrumb">SukuuNova <span>›</span> {universe === "school" ? "School Workspace" : "Platform Control"}</div><h1>{title}</h1><p>{subtitle}</p></div>
          <div className="app-top-actions">
            <button className="app-search" type="button"><span>⌕</span> Search anything <kbd>⌘ K</kbd></button>
            <button className="app-icon-button" type="button" aria-label="Notifications">◌<i /></button>
            <button className="app-profile-button" type="button"><span>{universe === "school" ? "TO" : "PA"}</span>⌄</button>
          </div>
        </header>
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
