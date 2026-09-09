"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BarChart3, CalendarDays, ClipboardList, FileText, LayoutGrid, Settings2, Table2 } from "lucide-react";

type Item = { key: string; label: string; href: string; icon: typeof LayoutGrid };

const items: Item[] = [
  { key: "readiness", label: "Readiness", href: "/school/academics/health", icon: LayoutGrid },
  { key: "setup", label: "Academic setup", href: "/school/academics/setup", icon: Settings2 },
  { key: "calendar", label: "Terms & calendar", href: "/school/terms", icon: CalendarDays },
  { key: "timetable", label: "Timetable", href: "/school/timetable", icon: CalendarDays },
  { key: "assessments", label: "Assessments", href: "/school/exams", icon: ClipboardList },
  { key: "gradebook", label: "Gradebook", href: "/school/gradebook/studio", icon: Table2 },
  { key: "performance", label: "Performance", href: "/school/academics/performance", icon: BarChart3 },
  { key: "reports", label: "Report cards", href: "/school/report-cards", icon: FileText },
];

function contextHref(item: Item, params: URLSearchParams): string {
  const term = params.get("term") ?? params.get("termId");
  const classId = params.get("class") ?? params.get("classId");
  const subjectId = params.get("subject") ?? params.get("subjectId");
  const query = new URLSearchParams();

  if (item.key === "gradebook" || item.key === "performance") {
    if (classId) query.set("class", classId);
    if (subjectId) query.set("subject", subjectId);
    if (term) query.set("term", term);
  } else if (item.key === "reports") {
    if (classId) query.set("classId", classId);
    if (term) query.set("term", term);
  } else if (item.key === "calendar" || item.key === "readiness") {
    if (term) query.set("termId", term);
  }

  const suffix = query.toString();
  return suffix ? `${item.href}?${suffix}` : item.href;
}

export function AcademicWorkspaceNav({ current }: { current: string }) {
  const searchParams = useSearchParams();
  const activeItem = items.find((item) => item.key === current) ?? items[0];
  const ActiveIcon = activeItem.icon;

  return (
    <details className="academic-workspace-switcher">
      <summary>
        <span className="academic-workspace-switcher-current"><ActiveIcon size={15} aria-hidden="true" /><span><small>Academic tool</small><strong>{activeItem.label}</strong></span></span>
        <span className="academic-workspace-switcher-action">Switch tool</span>
      </summary>
      <nav className="academic-workspace-nav-items" aria-label="Academic workflow">
        {items.map((item) => {
          const Icon = item.icon;
          const active = current === item.key;
          return (
            <Link key={item.key} href={contextHref(item, searchParams)} className={`academic-workspace-nav-item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
              <Icon size={15} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </details>
  );
}
