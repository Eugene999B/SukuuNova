import Link from "next/link";
import { ArrowLeft, ArrowRight, BadgeCheck, BarChart3, BookOpenCheck, CalendarDays, CheckCircle2, GraduationCap, ShieldCheck, UsersRound, WalletCards } from "lucide-react";
import { notFound } from "next/navigation";
import "../feature-detail.css";

const details = {
  "students-families": {
    eyebrow: "STUDENTS & FAMILIES",
    title: "Know every learner, without losing the human picture.",
    intro: "Keep admissions, learner records, guardians, class placement and day-to-day people work connected. SukuuNova gives the school one current record instead of several partial versions.",
    icon: UsersRound,
    accent: "var(--sn-school-accent)",
    tint: "var(--sn-school-tint)",
    route: "/school/students",
    points: ["Admissions and enrolment stay tied to the learner record", "Guardians, relationships and communication context stay together", "Student profiles connect cleanly to classes, attendance and academic history"],
  },
  academics: {
    eyebrow: "ACADEMICS",
    title: "Make the academic day visible from one place.",
    intro: "Classes, subjects, timetable, lessons, homework, assessment and report cards belong to one academic story. The result is less switching and better context for teachers and school leaders.",
    icon: GraduationCap,
    accent: "var(--sn-teacher-accent)",
    tint: "var(--sn-teacher-tint)",
    route: "/school/classes",
    points: ["Build classes and subjects around the same learner and staff records", "Plan the timetable while keeping room and teacher conflicts visible", "Move from teaching work into gradebook and reporting without breaking context"],
  },
  "attendance-safety": {
    eyebrow: "ATTENDANCE & SAFETY",
    title: "Know who is present, late, missing or needs attention.",
    intro: "Daily registers, lateness, exceptions and device attendance come together so attendance becomes an operational signal instead of a spreadsheet exercise.",
    icon: ShieldCheck,
    accent: "var(--sn-school-accent)",
    tint: "var(--sn-school-tint)",
    route: "/school/attendance",
    points: ["Record daily attendance and lateness with clear status states", "Surface exceptions that deserve follow-up instead of hiding them in tables", "Support device-assisted attendance while keeping the school record authoritative"],
  },
  "fees-finance": {
    eyebrow: "FEES & FINANCE",
    title: "Keep the money story clear from charge to receipt.",
    intro: "Fee plans, invoices, payments, receipts, arrears, collections and payroll can stay inside one financial workspace with a readable trail from what was expected to what was paid.",
    icon: WalletCards,
    accent: "var(--sn-platform-accent)",
    tint: "var(--sn-platform-tint)",
    route: "/school/fees",
    points: ["Create and track invoices against the right learner and charge", "Keep payments, balances, arrears and evidence connected", "Give finance staff a useful operational picture without flattening it into one KPI"],
  },
} as const;

export async function generateStaticParams() {
  return Object.keys(details).map((slug) => ({ slug }));
}

export default async function FeatureDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = details[slug as keyof typeof details];
  if (!item) notFound();
  const Icon = item.icon;

  return (
    <main className="feature-detail-shell" style={{ "--feature-accent": item.accent, "--feature-tint": item.tint } as React.CSSProperties}>
      <div className="feature-detail-wrap">
        <header className="feature-detail-topbar">
          <Link href="/features" className="detail-back"><ArrowLeft size={15} aria-hidden="true" /> All capabilities</Link>
          <Link href="/" className="detail-brand" aria-label="SukuuNova home">SukuuNova</Link>
          <Link href="/login/school" className="detail-login">Enter your school <ArrowRight size={15} aria-hidden="true" /></Link>
        </header>

        <section className="feature-detail-hero">
          <div className="detail-icon"><Icon size={28} aria-hidden="true" /></div>
          <span className="detail-eyebrow">{item.eyebrow}</span>
          <h1>{item.title}</h1>
          <p>{item.intro}</p>
          <div className="detail-actions">
            <Link className="detail-primary" href={item.route}>Open this workspace <ArrowRight size={16} aria-hidden="true" /></Link>
            <Link className="detail-secondary" href="/for-schools">See the school story</Link>
          </div>
        </section>

        <section className="detail-content-grid" aria-label={`${item.eyebrow} highlights`}>
          <article className="detail-panel detail-panel-featured">
            <span className="detail-panel-label">WHY IT MATTERS</span>
            <h2>One responsibility. One connected record.</h2>
            <p>Instead of treating this area as a standalone module, SukuuNova keeps the people, approvals, activity and outcomes around it in view.</p>
          </article>
          <div className="detail-point-grid">
            {item.points.map((point) => (
              <article className="detail-point" key={point}>
                <CheckCircle2 size={19} aria-hidden="true" />
                <p>{point}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="detail-system">
          <div>
            <span className="detail-panel-label">CONNECTED BY DESIGN</span>
            <h2>The work does not stop at the card.</h2>
          </div>
          <div className="detail-flow">
            <span><BadgeCheck size={18} aria-hidden="true" /> Record</span>
            <ArrowRight size={16} aria-hidden="true" />
            <span><BarChart3 size={18} aria-hidden="true" /> Signal</span>
            <ArrowRight size={16} aria-hidden="true" />
            <span><BookOpenCheck size={18} aria-hidden="true" /> Action</span>
            <ArrowRight size={16} aria-hidden="true" />
            <span><CalendarDays size={18} aria-hidden="true" /> History</span>
          </div>
        </section>

        <footer className="detail-footer">
          <Link href="/features"><ArrowLeft size={14} aria-hidden="true" /> Back to capabilities</Link>
          <span>© 2026 SukuuNova</span>
          <Link href="/contact">Talk to us <ArrowRight size={14} aria-hidden="true" /></Link>
        </footer>
      </div>
    </main>
  );
}
