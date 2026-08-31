"use client";

import Link from "next/link";
import { ArrowRight, Check, ChevronLeft } from "lucide-react";
import { useState } from "react";

export type CapabilitySection = { title: string; body: string };
export type WorkflowStep = { title: string; detail: string; result: string };

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

export function MarketingCapabilityPage({ eyebrow, title, intro, accent, workspaceHref, workspaceLabel, sections, outcomes }: MarketingCapabilityPageProps) {
  const [active, setActive] = useState(0);
  const steps: WorkflowStep[] = sections.slice(0, 5).map((section, index) => ({
    title: section.title,
    detail: section.body,
    result: outcomes[index % outcomes.length] ?? "A clear next step for the school team.",
  }));
  const current = steps[active] ?? steps[0];

  return (
    <main className="capability-page" style={{ "--cap-accent": accent } as React.CSSProperties}>
      <div className="capability-shell">
        <header className="capability-header">
          <Link href="/" className="capability-brand" aria-label="SukuuNova home"><span className="capability-brand-mark">S</span><span>SukuuNova</span></Link>
          <nav aria-label="Capability navigation"><Link href="/features">What it does</Link><Link href="/for-schools">For schools</Link><Link href="/about">About</Link></nav>
          <Link className="capability-login" href="/login/school">School login <ArrowRight size={15} aria-hidden="true" /></Link>
        </header>

        <Link href="/" className="capability-back"><ChevronLeft size={15} aria-hidden="true" /> Back</Link>

        <section className="capability-hero">
          <div className="capability-hero-copy">
            <div className="capability-eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
            <p>{intro}</p>
            <Link className="capability-primary" href={workspaceHref}>{workspaceLabel} <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className="capability-intro-card" aria-label="How this area works">
            <span>How it works</span>
            <strong>Start with the record. Finish with the action.</strong>
            <p>Pick a step below. The detail changes here, so you can see the flow without leaving the page.</p>
          </div>
        </section>

        <section className="capability-workflow" aria-label={`${eyebrow} workflow`}>
          <div className="workflow-steps">
            {steps.map((step, index) => (
              <button type="button" key={step.title} className={`workflow-step${active === index ? " is-active" : ""}`} onClick={() => setActive(index)} aria-pressed={active === index}>
                <span className="workflow-step-number">{index + 1}</span>
                <span><strong>{step.title}</strong><small>{index === 0 ? "Start here" : index === steps.length - 1 ? "Then" : "Next"}</small></span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="workflow-detail" key={current.title}>
            <div className="workflow-detail-top"><span>{eyebrow}</span><span>Step {active + 1} of {steps.length}</span></div>
            <h2>{current.title}</h2>
            <p>{current.detail}</p>
            <div className="workflow-result"><Check size={17} aria-hidden="true" /><div><b>What you get</b><span>{current.result}</span></div></div>
            <Link href={workspaceHref} className="workflow-open">Open {workspaceLabel} <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </section>

        <section className="capability-outcomes capability-outcomes-new">
          <div><span className="capability-kicker">AT A GLANCE</span><h2>Useful on the day, useful later.</h2><p>Keep the information people need close to the work they are doing. Then leave a clear record behind.</p></div>
          <div className="outcome-list">{outcomes.map((outcome) => <div className="outcome-item" key={outcome}><Check size={18} aria-hidden="true" /><span>{outcome}</span></div>)}</div>
        </section>

        <section className="capability-cta">
          <div><span className="capability-kicker">READY TO USE IT?</span><h2>Go straight to the work.</h2><p>You do not need another product tour. Open the workspace and get on with the job.</p></div>
          <Link className="capability-primary" href={workspaceHref}>Open {workspaceLabel} <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>

        <footer className="capability-footer"><span>© 2026 SukuuNova</span><span>School work, kept together.</span><span><Link href="/about">About</Link> · <Link href="/contact">Contact</Link></span></footer>
      </div>
    </main>
  );
}
