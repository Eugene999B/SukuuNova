import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart3, GraduationCap, ShieldCheck, UsersRound, WalletCards } from "lucide-react";
import "../home.css";
import "../home-redesign.css";
import "../home-premium.css";
import "./features-premium.css";

const features = [
  ["Students & families", "Keep learner records, guardians, admissions and people work connected.", UsersRound, "/features/students-families"],
  ["Academics", "Plan classes and subjects, manage the timetable, teach, assess and report.", GraduationCap, "/features/academics"],
  ["Attendance & safety", "Know who is present, late, absent and needs follow-up across the day.", ShieldCheck, "/features/attendance-safety"],
  ["Fees & finance", "Keep charges, invoices, payments, arrears and payroll in one financial story.", WalletCards, "/features/fees-finance"],
] as const;

export default function FeaturesPage() {
  return (
    <main className="features-premium-shell">
      <div className="features-premium-wrap">
        <header className="topbar feature-topbar">
          <Link href="/" className="brand" aria-label="SukuuNova home"><Image className="brand-logo" src="/brand/sukuunova-logo.svg" alt="SukuuNova" width={190} height={54} priority /></Link>
          <nav className="topnav" aria-label="Primary navigation"><Link href="/for-schools">For schools</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link></nav>
          <Link className="top-button" href="/login/school">Enter your school <ArrowRight size={14} aria-hidden="true" /></Link>
        </header>

        <section className="features-hero">
          <div className="features-hero-kicker"><BarChart3 size={15} aria-hidden="true" /> A clearer school operating system</div>
          <h1>Every important responsibility.<br /><span>Connected.</span></h1>
          <p>Explore how SukuuNova turns the real work of a school into focused workspaces — then keeps the records, decisions and follow-up connected.</p>
          <div className="features-hero-actions"><Link className="primary-cta" href="/for-schools">See the school story <ArrowRight size={16} aria-hidden="true" /></Link><Link className="secondary-cta" href="/login/school">Existing user login</Link></div>
        </section>

        <section className="feature-card-grid" aria-label="SukuuNova capabilities">
          {features.map(([title, copy, Icon, href], index) => (
            <Link className="feature-premium-card" href={href} key={title}>
              <div className="feature-premium-icon"><Icon size={21} aria-hidden="true" /></div>
              <span className="feature-premium-number">0{index + 1}</span>
              <h2>{title}</h2>
              <p>{copy}</p>
              <span className="feature-premium-link">Explore <ArrowRight size={15} aria-hidden="true" /></span>
            </Link>
          ))}
        </section>

        <section className="features-quote">
          <span>THE IDEA</span>
          <blockquote>“The school should not have to become a software company just to know what is happening.”</blockquote>
          <p>SukuuNova is designed so the system carries the complexity while people keep the context.</p>
        </section>

        <footer className="footer"><span>© 2026 SukuuNova</span><span><Link href="/about">About</Link> · <Link href="/contact">Contact</Link> · <Link href="/login/platform">Platform access</Link></span></footer>
      </div>
    </main>
  );
}
