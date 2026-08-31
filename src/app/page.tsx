import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Building2, GraduationCap, LogIn, ShieldCheck, Users, WalletCards } from "lucide-react";
import "./home.css";
import "./home-redesign.css";
import "./home-premium.css";
import "./theme-home.css";
import "./theme-brand.css";
import { HomeLeadChat } from "@/components/HomeLeadChat";
import { HomeProductPreview } from "@/components/HomeProductPreview";

const modules = [
  ["Students & families", "Keep admissions, learner records and family details together.", Users, "/features/students-families"],
  ["Teaching & learning", "Plan classes, lessons, marks, homework and reports in one place.", GraduationCap, "/features/academics"],
  ["Attendance & safety", "Record attendance, follow absences and keep families informed.", ShieldCheck, "/features/attendance-safety"],
  ["Fees & finance", "Track fees, invoices, payments, balances and receipts clearly.", WalletCards, "/features/fees-finance"],
] as const;

export default function HomePage() {
  return (
    <main className="home-shell">
      <div className="home-glow home-glow-a" aria-hidden="true" />
      <div className="home-glow home-glow-b" aria-hidden="true" />
      <div className="home-wrap">
        <header className="topbar">
          <Link href="/" className="brand brand-compact" aria-label="SukuuNova home"><Image className="brand-mark-image" src="/brand/sukuunova-favicon.svg" alt="" width={38} height={38} priority /><span className="brand-wordmark">SukuuNova</span></Link>
          <nav className="topnav" aria-label="Primary navigation">
            <Link href="/features">What it does</Link>
            <Link href="#how-it-works">How it works</Link>
            <Link href="/for-schools">For schools</Link>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
          </nav>
          <div className="top-actions">
            <Link className="top-link" href="/login/platform"><LogIn size={15} aria-hidden="true" /> Platform</Link>
            <Link className="top-button" href="/login/school">School login <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </header>

        <section className="hero" id="platform">
          <div className="hero-copy-wrap">
            <div className="eyebrow"><span className="eyebrow-dot" /> School management, made simpler</div>
            <h1>Keep the whole school <span>in one place.</span></h1>
            <p className="hero-copy">SukuuNova gives school leaders, teachers and families one secure place to handle the everyday work of school.</p>
            <div className="hero-actions">
              <Link className="primary-cta" href="/login/school">Open your school <ArrowRight size={16} aria-hidden="true" /></Link>
              <Link className="secondary-cta" href="/for-schools">See how it works <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
            <div className="hero-proof"><Image className="proof-logo" src="/icon.svg" alt="" width={33} height={33} /><div><strong>Made for everyday school work.</strong><span>Keep people, classes, attendance, communication and finance together without making the job harder.</span></div></div>
          </div>
          <HomeProductPreview />
        </section>

        <section className="intent-grid" id="how-it-works" aria-label="Who SukuuNova is for">
          <Link className="intent-card intent-school" href="/for-schools"><span className="intent-icon"><Building2 size={20} aria-hidden="true" /></span><span className="section-kicker">SCHOOL LEADERS</span><h2>Know what is happening across the school.</h2><p>Bring people, academics, attendance and finance into one working view.</p><span className="intent-link">For schools <ArrowRight size={15} /></span></Link>
          <Link className="intent-card intent-users" href="/login/school"><span className="intent-icon"><LogIn size={20} aria-hidden="true" /></span><span className="section-kicker">STAFF &amp; FAMILIES</span><h2>Get to the work that belongs to you.</h2><p>Each person sees the tools and school records they need, without the clutter.</p><span className="intent-link">Go to school login <ArrowRight size={15} /></span></Link>
          <Link className="intent-card intent-network" href="/about"><span className="intent-icon"><ShieldCheck size={20} aria-hidden="true" /></span><span className="section-kicker">BUILT FOR TRUST</span><h2>Keep school records protected.</h2><p>Clear roles and permissions help the right people do the right work with confidence.</p><span className="intent-link">About SukuuNova <ArrowRight size={15} /></span></Link>
        </section>

        <section className="modules" id="modules">
          <div className="section-kicker">WHAT YOU CAN RUN</div>
          <div className="section-head"><div><h2>The school day, without the clutter.</h2><p>Start with the part of school you manage. Follow the link to see the work and the tools behind it.</p></div></div>
          <div className="module-grid">
            {modules.map(([title, copy, Icon, href]) => <Link className="module-card" href={href} key={title}><span className="module-icon"><Icon size={21} aria-hidden="true" /></span><h3>{title}</h3><p>{copy}</p><span className="module-arrow"><ArrowRight size={16} aria-hidden="true" /></span></Link>)}
          </div>
        </section>

        <section className="closing-cta"><div><span className="section-kicker">READY TO GET STARTED?</span><h2>Put the school in one place.</h2><p>Give your team one system for the records and work they already manage every day.</p></div><div style={{ display: "grid", gap: 10 }}><Link className="primary-cta" href="/for-schools">See SukuuNova for schools <ArrowRight size={16} aria-hidden="true" /></Link><HomeLeadChat /></div></section>

        <footer className="footer"><span>© 2026 SukuuNova</span><span>School work, kept together.</span><span><Link href="/about">About</Link> · <Link href="/contact">Contact</Link> · <Link href="/login/platform">Platform access</Link></span></footer>
      </div>
    </main>
  );
}
