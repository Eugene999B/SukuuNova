"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

export type NavItem = { icon: LucideIcon; label: string; href: string; primary?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export function SidebarNav({ groups, active, storageScope = "default" }: { groups: NavGroup[]; active: string; storageScope?: string }) {
  const pathname = usePathname();
  const storageKey = `sukuunova-sidebar-groups:v2:${storageScope}`;
  const activeLabel = useMemo(() => {
    const matches = groups
      .flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))
      .filter((item) => pathname === item.href || (pathname.startsWith(`${item.href}/`) && item.href !== "/dashboard"))
      .sort((a, b) => b.href.length - a.href.length);
    return matches[0]?.label ?? active;
  }, [groups, pathname, active]);

  const activeGroupLabel = useMemo(
    () => groups.find((group) => group.items.some((item) => item.label === activeLabel))?.label,
    [activeLabel, groups],
  );

  const defaultCollapsed = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.label, group.label !== activeGroupLabel])),
    [activeGroupLabel, groups],
  );

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(defaultCollapsed);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        setCollapsed({ ...defaultCollapsed, ...parsed, ...(activeGroupLabel ? { [activeGroupLabel]: false } : {}) });
      } else {
        setCollapsed(defaultCollapsed);
      }
    } catch {
      setCollapsed(defaultCollapsed);
    }
  }, [activeGroupLabel, defaultCollapsed, storageKey]);

  useEffect(() => {
    if (!activeGroupLabel || !collapsed[activeGroupLabel]) return;
    setCollapsed((current) => {
      if (!current[activeGroupLabel]) return current;
      const next = { ...current, [activeGroupLabel]: false };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [activeGroupLabel, collapsed, storageKey]);

  const toggleGroup = (label: string) => {
    setCollapsed((current) => {
      const next = { ...current, [label]: !current[label] };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {groups.map((group) => {
        const isCollapsed = Boolean(collapsed[group.label]);
        return (
          <div className={`app-nav-group ${isCollapsed ? "is-collapsed" : ""}`} key={group.label}>
            <button type="button" className="app-nav-group-toggle" onClick={() => toggleGroup(group.label)} aria-expanded={!isCollapsed} title={`${isCollapsed ? "Open" : "Close"} ${group.label}`}>
              <span className="app-nav-label">{group.label}</span>
              <ChevronDown size={13} aria-hidden="true" className="app-nav-chevron" />
            </button>
            {!isCollapsed && group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeLabel === item.label;
              return (
                <Link key={`${group.label}-${item.href}`} href={item.href} aria-current={isActive ? "page" : undefined} className={`app-nav-item ${isActive ? "is-active" : ""} ${item.primary ? "is-primary" : ""}`} title={item.label}>
                  <Icon className="app-nav-icon" size={17} strokeWidth={1.9} aria-hidden="true" />
                  <span className="app-nav-text">{item.label}</span>
                  {isActive ? <span className="app-nav-active-dot" /> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
