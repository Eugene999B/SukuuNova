"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, LogIn, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ThemeSwitcher } from "./ThemeSwitcher";

const links = [
  ["What it does", "/features"],
  ["How it works", "#how-it-works"],
  ["For schools", "/for-schools"],
  ["About", "/about"],
  ["Contact", "/contact"],
] as const;

export function HomeHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  return (
    <header className="home-header">
      <Link href="/" className="home-brand" aria-label="SukuuNova home" onClick={() => setOpen(false)}>
        <Image src="/brand/sukuunova-favicon.svg" alt="" width={40} height={40} priority />
        <span><strong>SukuuNova</strong><small>School operations</small></span>
      </Link>

      <nav className="home-desktop-nav" aria-label="Primary navigation">
        {links.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
      </nav>

      <div className="home-header-actions">
        <div className="home-desktop-theme"><ThemeSwitcher /></div>
        <Link className="home-platform-link" href="/login/platform"><LogIn size={15} aria-hidden="true" /> Platform</Link>
        <Link className="home-school-login" href="/login/school">School login <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>

      <div className="home-mobile-actions">
        <ThemeSwitcher />
        <button type="button" className="home-menu-button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="home-mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open ? <>
        <button type="button" className="home-mobile-menu-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />
        <div id="home-mobile-menu" className="home-mobile-menu is-open">
          <div className="home-mobile-menu-head"><span>Navigate SukuuNova</span><button type="button" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
          <nav aria-label="Mobile navigation">
            {links.map(([label, href], index) => <Link href={href} key={href} onClick={() => setOpen(false)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{label}</strong><ArrowRight size={16} /></Link>)}
          </nav>
          <div className="home-mobile-login-stack">
            <Link href="/login/school" onClick={() => setOpen(false)}>Open school login <ArrowRight size={16} /></Link>
            <Link href="/login/platform" onClick={() => setOpen(false)}>Platform access <LogIn size={15} /></Link>
          </div>
          <div className="home-mobile-menu-note"><strong>One secure school workspace.</strong><span>People, academics, attendance, communication and finance—kept together.</span></div>
        </div>
      </> : null}
    </header>
  );
}
