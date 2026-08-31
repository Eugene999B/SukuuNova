import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronLeft, CircleDot } from "lucide-react";

export type CapabilitySection = {
  title: string;
  body: string;
};

export type MarketingCapabilityPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  accent: string;
  workspaceHref: string;
  workspaceLabel: string;
  sections: CapabilitySection[];
  outcomes: string[];
};

export function MarketingCapabilityPage({
  eyebrow,
  title,
  intro,
  accent,
  workspaceHref,
  workspaceLabel,
  sections,
  outcomes,
}: MarketingCapabilityPageProps) {
  return (
    <main className="capability-page" style={{ "--cap-accent": accent } as React.CSSProperties}>
      <div className="capability-shell">
        <header className="capability-header">
          <Link href="/" className="capability-brand" aria-label="SukuuNova home">
            <span className="capability-brand-mark">S</span>
            <span>SukuuNova</span>
          </Link>
          <nav aria-label="Capability navigation">
            <Link href="/features">Platform</Link>
            <Link href="/for-schools">For schools</Link>
            <Link href="/about">About</Link>
          </nav>
          <Link className="capability-login" href="/login/school">Enter your school <ArrowRight size={15} aria-hidden="true" /></Link>
        </header>

        <Link href="/" className="capability-back"><ChevronLeft size={15} aria-hidden="true" /> Back to SukuuNova</Link>

        <section className="capability-hero">
          <div>
            <div className="capability-eyebrow"><CircleDot size={12} aria-hidden="true" /> {eyebrow}</div>
            <h1>{title}</h1>
            <p>{intro}</p>
            <div className="capability-actions">
              <Link className="capability-primary" href={workspaceHref}>{workspaceLabel} <ArrowRight size={16} aria-hidden="true" /></Link>
              <Link className="capability-secondary" href="/for-schools">See the bigger picture</Link>
            </div>
          </div>
          <div className="capability-summary" aria-label="What this workspace connects">
            <span className="summary-label">Connected workspace</span>
            <strong>{workspaceLabel}</strong>
            <span className="summary-rule" />
            <p>One place for the records, decisions and follow-through that belong together.</p>
          </div>
        </section>

        <section className="capability-grid" aria-label="How the workspace helps">
          {sections.map((section, index) => (
            <article className="capability-card" key={section.title}>
              <span className="capability-number">0{index + 1}</span>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>

        <section className="capability-outcomes">
          <div>
            <span className="capability-kicker">WHAT CHANGES</span>
            <h2>The work stays visible from start to finish.</h2>
          </div>
          <div className="outcome-list">
            {outcomes.map((outcome) => (
              <div className="outcome-item" key={outcome}>
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>{outcome}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="capability-cta">
          <div>
            <span className="capability-kicker">READY FOR THE SCHOOL DAY</span>
            <h2>Bring this work into the same calm system.</h2>
            <p>Use the workspace directly or return to the platform overview to see how it connects with everything around it.</p>
          </div>
          <Link className="capability-primary" href={workspaceHref}>{workspaceLabel} <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>

        <footer className="capability-footer">
          <span>© 2026 SukuuNova</span>
          <span>Calm software for serious school work.</span>
          <span><Link href="/about">About</Link> · <Link href="/contact">Contact</Link></span>
        </footer>
      </div>
    </main>
  );
}
