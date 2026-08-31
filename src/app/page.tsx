import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Building2, GraduationCap, LogIn, ShieldCheck, Users, WalletCards } from "lucide-react";
import "./home.css";
import "./home-redesign.css";
import { HomeLeadChat } from "@/components/HomeLeadChat";
import { HomePresence } from "@/components/HomePresence";
import { HomeProductPreview } from "@/components/HomeProductPreview";

const modules = [
  ["Students & families", "Admissions, learner records, guardians and day-to-day people operations", Users, "/features"],
  ["Academics", "Classes, subjects, timetable, homework, assessments and report cards", GraduationCap, "/features"],
  ["Attendance & safety", "Daily registers, lateness, absence, device attendance and alerts", ShieldCheck, "/features"],
  ["Fees & finance", "Fees, invoices, receipts, balances, collections and payroll", WalletCards, "/features"],
] as const;

export default function HomePage() {
  return (
    <main className="home-shell">
      <div className="home-glow home-glow-a" />
      <div className="home-glow home-glow-b" />
      <div className="home-wrap">
        <header className="topbar">
          <Link href="/" className="brand" aria-label="SukuuNova home"><Image className="brand-logo" src="/brand/sukuunova-logo.svg" alt="SukuuNova" width={190} height={54} priority /></Link>
          <nav className="topnav" aria-label="Primary navigation">
            <Link href="/features">Platform</Link>
            <Link href="#how-it-works">How it works</Link>
            <Link href="/for-schools">For schools</Link>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
          </nav>
          <div className="top-actions">
            <Link className="top-link" href="/login/platform"><LogIn size={15} aria-hidden="true" /> Platform</Link>
            <Link className="top-button" href="/login/school">Enter your school <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </header>

        <HomePresence />

        <section className="hero" id="platform">
          <div className="hero-copy-wrap">
            <div className="eyebrow"><span className="eyebrow-dot" /> Built for modern African schools</div>
            <h1>One calm system for <span>the whole school.</span></h1>
            <p className="hero-copy">SukuuNova connects school leadership, teachers, finance teams and families around the real school day — with one record, one gateway and clear role-based workspaces.</p>
            <div className="hero-actions">
              <Link className="primary-cta" href="/login/school">Enter your school <ArrowRight size={16} aria-hidden="true" /></Link>
              <Link className="top-link" href="/for-schools"><Building2 size={15} aria-hidden="true" /> Explore for schools</Link>
            </div>
            <div className="hero-proof"><Image className="proof-logo" src="/icon.svg" alt="" width={33} height={33} /><div><strong>Fast for existing users.</strong><span>Choose your school, continue as Staff or Guardian, and get straight to work.</span></div></div>
          </div>
          <HomeProductPreview />
        </section>

        <section className="intent-grid" id="how-it-works" aria-label="Who SukuuNova is for">
          <Link className="intent-card intent-school" href="/for-schools"><span className="intent-icon"><Building2 size={20} aria-hidden="true" /></span><span className="section-kicker">FOR SCHOOL LEADERS</span><h2>Run the school from one command centre.</h2><p>See setup readiness, approvals, people, academics and finance without hunting through separate systems.</p><span className="intent-link">Explore SukuuNova for schools <ArrowRight size={15} /></span></Link>
          <Link className="intent-card intent-users" href="/login/school"><span className="intent-icon"><LogIn size={20} aria-hidden="true" /></span><span className="section-kicker">FOR EXISTING USERS</span><h2>Get into your school quickly.</h2><p>Staff and guardians use the same secure school gateway, with each role seeing only what belongs to them.</p><span className="intent-link">School login <ArrowRight size={15} /></span></Link>
          <Link className="intent-card intent-network" href="/about"><span className="intent-icon"><ShieldCheck size={20} aria-hidden="true" /></span><span className="section-kicker">FOR PARTNERS &amp; INVESTORS</span><h2>See the operating architecture.</h2><p>Learn how SukuuNova combines tenant isolation, audited operations and connected school workflows into one platform.</p><span className="intent-link">About the platform <ArrowRight size={15} /></span></Link>
        </section>

        <section className="modules" id="modules">
          <div className="section-kicker">THE SCHOOL, IN ONE PLACE</div>
          <div className="section-head"><h2>Built around the work, not a menu.</h2><p>Each workspace is designed around a real school responsibility, then connected to the records that responsibility depends on.</p></div>
          <div className="module-grid">
            {modules.map(([title, copy, Icon, href]) => <Link className="module-card" href={href} key={title}><span className="module-icon"><Icon size={21} aria-hidden="true" /></span><h3>{title}</h3><p>{copy}</p><span className="module-arrow"><ArrowRight size={16} aria-hidden="true" /></span></Link>)}
          </div>
        </section>

        <section className="closing-cta"><div><span className="section-kicker">READY FOR THE SCHOOL DAY</span><h2>Less chasing. More control.</h2><p>Give the people running your school one place to see what matters and act on it.</p></div><div style={{ display: "grid", gap: 10 }}><Link className="primary-cta" href="/for-schools">See how schools use it <ArrowRight size={16} aria-hidden="true" /></Link><HomeLeadChat /></div></section>

        <footer className="footer"><span>© 2026 SukuuNova</span><span>Built with care by humans.</span><span><Link href="/about">About</Link> · <Link href="/contact">Contact</Link> · <Link href="/login/platform">Platform access</Link></span></footer>
      </div>
    </main>
  );
}
