import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, ClipboardList, FileText, GraduationCap, LayoutGrid, Settings2, Table2 } from "lucide-react";

type Item = { key: string; label: string; description: string; href: string; icon: typeof LayoutGrid };

const items: Item[] = [
  { key: "readiness", label: "Readiness", description: "Check the academic chain", href: "/school/academics/health", icon: LayoutGrid },
  { key: "setup", label: "Academic setup", description: "Rules, periods and reporting", href: "/school/academics/setup", icon: Settings2 },
  { key: "calendar", label: "Terms & calendar", description: "Academic years and terms", href: "/school/terms", icon: CalendarDays },
  { key: "timetable", label: "Timetable", description: "Teaching time and classes", href: "/school/timetable", icon: CalendarDays },
  { key: "assessments", label: "Assessments", description: "Assessment structures", href: "/school/exams", icon: ClipboardList },
  { key: "gradebook", label: "Gradebook", description: "Enter and moderate marks", href: "/school/gradebook/studio", icon: Table2 },
  { key: "performance", label: "Performance", description: "Understand class results", href: "/school/academics/performance", icon: BarChart3 },
  { key: "reports", label: "Report cards", description: "Turn results into reports", href: "/school/report-cards", icon: FileText },
];

export function AcademicWorkspaceNav({ current }: { current: string }) {
  return (
    <nav className="academic-workspace-nav" aria-label="Academic workflow">
      <div className="academic-workspace-nav-intro">
        <span className="academic-workspace-overline">Academic workflow</span>
        <strong>One connected school model</strong>
        <small>Setup sets the rules. Terms define the period. Teaching produces results, and reports use the same context.</small>
      </div>
      <div className="academic-workspace-nav-items">
        {items.map((item) => {
          const Icon = item.icon;
          const active = current === item.key;
          return (
            <Link key={item.key} href={item.href} className={`academic-workspace-nav-item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
              <span className="academic-workspace-nav-icon"><Icon size={16} aria-hidden="true" /></span>
              <span className="academic-workspace-nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
              <ArrowRight size={14} aria-hidden="true" className="academic-workspace-nav-arrow" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
