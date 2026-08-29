"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

type NavItem = [icon: string, label: string, href: string];
type NavGroup = { label: string; items: NavItem[] };

export function SidebarNav({ groups, active }: { groups: NavGroup[]; active: string }) {
  const navRef = useRef<HTMLElement | null>(null);
  const storageKey = "sukuunova-sidebar-scroll";

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const saved = Number(sessionStorage.getItem(storageKey) ?? 0);
    if (Number.isFinite(saved)) nav.scrollTop = saved;
    const save = () => sessionStorage.setItem(storageKey, String(nav.scrollTop));
    nav.addEventListener("scroll", save, { passive: true });
    return () => nav.removeEventListener("scroll", save);
  }, []);

  const rememberPosition = () => {
    if (navRef.current) sessionStorage.setItem(storageKey, String(navRef.current.scrollTop));
  };

  return (
    <nav ref={navRef} className="app-nav" aria-label="Primary navigation">
      {groups.map((group) => (
        <div className="app-nav-group" key={group.label}>
          <div className="app-nav-label">{group.label}</div>
          {group.items.map(([icon, label, href]) => (
            <Link key={label} href={href} onClick={rememberPosition} className={`app-nav-item ${active === label ? "is-active" : ""}`}>
              <span className="app-nav-icon">{icon}</span>
              <span>{label}</span>
              {active === label ? <span className="app-nav-active-dot" /> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
