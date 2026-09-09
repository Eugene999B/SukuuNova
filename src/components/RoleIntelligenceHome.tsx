import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import "./role-intelligence-home.css";

export type IntelligenceTone = "default" | "good" | "warn" | "critical";

export type IntelligenceMetric = {
  label: string;
  value: string | number;
  detail: string;
  href?: string;
  tone?: IntelligenceTone;
};

export type IntelligenceInsight = {
  title: string;
  detail: string;
  href?: string;
  actionLabel?: string;
  severity?: "info" | "positive" | "warning" | "critical";
};

export type IntelligenceAction = {
  label: string;
  detail: string;
  href: string;
};

export type IntelligenceFocusItem = {
  label: string;
  detail: string;
  value?: string;
  href?: string;
};

type ActionLink = { label: string; href: string };

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  identity?: string;
  primaryAction?: ActionLink;
  secondaryAction?: ActionLink;
  metrics: IntelligenceMetric[];
  insights: IntelligenceInsight[];
  focusTitle?: string;
  focusDescription?: string;
  focus?: IntelligenceFocusItem[];
  actions?: IntelligenceAction[];
  children?: ReactNode;
};

function InsightIcon({ severity }: { severity: IntelligenceInsight["severity"] }) {
  if (severity === "critical" || severity === "warning") return <AlertTriangle size={16} aria-hidden="true" />;
  if (severity === "positive") return <CheckCircle2 size={16} aria-hidden="true" />;
  return <BrainCircuit size={16} aria-hidden="true" />;
}

export function RoleIntelligenceHome({
  eyebrow,
  title,
  description,
  identity,
  primaryAction,
  secondaryAction,
  metrics,
  insights,
  focusTitle = "Today’s focus",
  focusDescription = "The work that matters most right now.",
  focus = [],
  actions = [],
  children,
}: Props) {
  const critical = insights.filter((item) => item.severity === "critical").length;
  const warning = insights.filter((item) => item.severity === "warning").length;
  const statusLabel = critical > 0 ? `${critical} critical` : warning > 0 ? `${warning} to review` : "All clear";
  const statusTone = critical > 0 ? "critical" : warning > 0 ? "warn" : "good";

  return (
    <div className="role-intelligence-home">
      <section className="role-intelligence-hero">
        <div className="role-intelligence-hero-copy">
          <span className="role-intelligence-eyebrow"><Sparkles size={13} aria-hidden="true" /> {eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
          {identity ? <small>{identity}</small> : null}
        </div>
        <div className="role-intelligence-hero-side">
          <div className={`role-intelligence-status tone-${statusTone}`}>
            <BrainCircuit size={18} aria-hidden="true" />
            <div><span>Intelligence status</span><strong>{statusLabel}</strong></div>
          </div>
          <div className="role-intelligence-hero-actions">
            {primaryAction ? <Link href={primaryAction.href} className="role-intelligence-primary">{primaryAction.label} <ArrowRight size={14} aria-hidden="true" /></Link> : null}
            {secondaryAction ? <Link href={secondaryAction.href} className="role-intelligence-secondary">{secondaryAction.label}</Link> : null}
          </div>
        </div>
      </section>

      <section className="role-intelligence-metrics" aria-label="Key dashboard statistics">
        {metrics.map((metric) => {
          const card = <>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
            {metric.href ? <b>Open <ArrowRight size={12} aria-hidden="true" /></b> : null}
          </>;
          const className = `role-intelligence-metric tone-${metric.tone ?? "default"}`;
          return metric.href ? <Link key={metric.label} href={metric.href} className={className}>{card}</Link> : <article key={metric.label} className={className}>{card}</article>;
        })}
      </section>

      <section className="role-intelligence-main-grid">
        <article className="role-intelligence-panel role-intelligence-insights">
          <div className="role-intelligence-panel-head">
            <div><span className="role-intelligence-eyebrow"><BrainCircuit size={13} aria-hidden="true" /> Intelligence brief</span><h2>What deserves attention</h2><p>Priorities are derived from live records already in this account.</p></div>
          </div>
          <div className="role-intelligence-insight-list">
            {insights.length ? insights.map((insight, index) => {
              const severity = insight.severity ?? "info";
              const content = <>
                <span className="role-intelligence-insight-icon"><InsightIcon severity={severity} /></span>
                <div><strong>{insight.title}</strong><small>{insight.detail}</small></div>
                {insight.href ? <b>{insight.actionLabel ?? "Open"} <ArrowRight size={12} aria-hidden="true" /></b> : null}
              </>;
              return insight.href ? <Link href={insight.href} className={`role-intelligence-insight tone-${severity}`} key={`${insight.title}-${index}`}>{content}</Link> : <div className={`role-intelligence-insight tone-${severity}`} key={`${insight.title}-${index}`}>{content}</div>;
            }) : <div className="role-intelligence-clear"><CheckCircle2 size={18} aria-hidden="true" /><div><strong>No urgent issues detected.</strong><small>There is no account-specific exception waiting for action right now.</small></div></div>}
          </div>
        </article>

        <article className="role-intelligence-panel role-intelligence-focus">
          <div className="role-intelligence-panel-head">
            <div><span className="role-intelligence-eyebrow"><Clock3 size={13} aria-hidden="true" /> {focusTitle}</span><h2>Stay ahead of the day</h2><p>{focusDescription}</p></div>
          </div>
          <div className="role-intelligence-focus-list">
            {focus.length ? focus.map((item, index) => {
              const content = <><span className="role-intelligence-focus-mark"><Target size={15} aria-hidden="true" /></span><div><strong>{item.label}</strong><small>{item.detail}</small></div>{item.value ? <b>{item.value}</b> : null}{item.href ? <ArrowRight size={13} aria-hidden="true" /> : null}</>;
              return item.href ? <Link key={`${item.label}-${index}`} href={item.href} className="role-intelligence-focus-row">{content}</Link> : <div key={`${item.label}-${index}`} className="role-intelligence-focus-row">{content}</div>;
            }) : <div className="role-intelligence-clear"><CheckCircle2 size={18} aria-hidden="true" /><div><strong>Nothing scheduled here yet.</strong><small>Your next account-specific tasks will appear automatically as data becomes available.</small></div></div>}
          </div>
        </article>
      </section>

      {actions.length ? <section className="role-intelligence-actions">
        <div className="role-intelligence-panel-head"><div><span className="role-intelligence-eyebrow"><Zap size={13} aria-hidden="true" /> Quick actions</span><h2>Move directly into the work</h2></div></div>
        <div className="role-intelligence-action-grid">
          {actions.map((action) => <Link href={action.href} key={action.label}><div><strong>{action.label}</strong><span>{action.detail}</span></div><ArrowRight size={15} aria-hidden="true" /></Link>)}
        </div>
      </section> : null}

      {children}
    </div>
  );
}
