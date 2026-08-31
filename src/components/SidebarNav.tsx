"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronRight } from "lucide-react";

export type NavItem = { icon: LucideIcon; label: string; href: string; primary?: boolean };
export type NavGroup = { label: string; items: NavItem[]; defaultOpen?: boolean };

export function SidebarNav({ groups, active }: { groups: NavGroup[]; active: string }) {
  const pathname = usePathname();
  const storageKey = "sukuunova-sidebar-groups";
  const compactKey = "sukuunova-sidebar-compact";
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try { setCollapsed(JSON.parse(localStorage.getItem(storageKey) ?? "{}")); } catch { setCollapsed({}); }
  }, []);

  const activeLabel = useMemo(() => {
    const matches = groups
      .flatMap((group) => group.items)
      .filter((item) => pathname === item.href || (pathname.startsWith(`${item.href}/`) && item.href !== "/dashboard"))
      .sort((a, b) => b.href.length - a.href.length);
    return matches[0]?.label ?? active;
  }, [groups, pathname, active]);

  const toggleGroup = (label: string) => {
    setCollapsed((current) => {
      const next = { ...current, [label]: !current[label] };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {groups.map((group) => {
        const isOpen = !collapsed[group.label];
        return (
          <section className={`app-nav-group ${isOpen ? "is-open" : "is-collapsed"}`} key={group.label}>
            <button type="button" className="app-nav-group-toggle" onClick={() => toggleGroup(group.label)} aria-expanded={isOpen}>
              <span className="app-nav-label">{group.label}</span>
              {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            </button>
            {isOpen && group.items.map(({ icon: Icon, label, href, primary }) => {
              const isActive = activeLabel === label;
              return (
                <Link key={label} href={href} aria-current={isActive ? "page" : undefined} className={`app-nav-item ${isActive ? "is-active" : ""} ${primary ? "is-primary" : ""}`}>
                  <Icon className="app-nav-icon" size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span className="app-nav-text">{label}</span>
                  {isActive ? <span className="app-nav-active-dot" aria-hidden="true" /> : null}
                </Link>
              );
            })}
          </section>
        );
      })}
    </nav>
  );
}
