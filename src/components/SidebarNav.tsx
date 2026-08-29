"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

type NavItem = [icon: string, label: string, href: string];
type NavGroup = { label: string; items: NavItem[] };

export function SidebarNav({ groups, active }: { groups: NavGroup[]; active: string }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);
  const storageKey = "sukuunova-sidebar-scroll";

  const activeLabel = useMemo(() => {
    const matches = groups
      .flatMap((group) => group.items.map(([icon, label, href]) => ({ icon, label, href })))
      .filter((item) => pathname === item.href || (pathname.startsWith(`${item.href}/`) && item.href !== "/dashboard"))
      .sort((a, b) => b.href.length - a.href.length);
    return matches[0]?.label ?? active;
  }, [groups, pathname, active]);

  useEffect(() => {
    const nav = navRef.current;
    const sidebar = nav?.parentElement;
    if (!sidebar) return;
    const saved = Number(sessionStorage.getItem(storageKey) ?? 0);
    if (Number.isFinite(saved)) requestAnimationFrame(() => { sidebar.scrollTop = saved; });
    const save = () => sessionStorage.setItem(storageKey, String(sidebar.scrollTop));
    sidebar.addEventListener("scroll", save, { passive: true });
    return () => sidebar.removeEventListener("scroll", save);
  }, []);

  const rememberPosition = () => {
    const sidebar = navRef.current?.parentElement;
    if (sidebar) sessionStorage.setItem(storageKey, String(sidebar.scrollTop));
  };

  return (
    <nav ref={navRef} className="app-nav" aria-label="Primary navigation">
      {groups.map((group) => (
        <div className="app-nav-group" key={group.label}>
          <div className="app-nav-label">{group.label}</div>
          {group.items.map(([icon, label, href]) => {
            const isActive = activeLabel === label;
            return (
              <Link
                key={label}
                href={href}
                onClick={rememberPosition}
                aria-current={isActive ? "page" : undefined}
                className={`app-nav-item ${isActive ? "is-active" : ""}`}
              >
                <span className="app-nav-icon">{icon}</span>
                <span>{label}</span>
                {isActive ? <span className="app-nav-active-dot" /> : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
