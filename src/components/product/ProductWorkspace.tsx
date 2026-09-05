import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type WorkspaceStat = { label: string; value: string; hint?: string };

export function ProductPageHeader(props: {
  eyebrow: string;
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  stats?: WorkspaceStat[];
  actions?: ReactNode;
  tabs?: Array<{ label: string; href: string; active?: boolean; count?: number }>;
}) {
  return (
    <section className="product-header" aria-labelledby="product-header-title">
      {props.backHref ? (
        <Link href={props.backHref} className="product-back">
          ← {props.backLabel ?? "Back"}
        </Link>
      ) : null}
      <div className="product-header-main">
        <div className="product-header-text">
          <span className="product-eyebrow">{props.eyebrow}</span>
          <h1 id="product-header-title">{props.title}</h1>
          <p>{props.description}</p>
          {props.stats?.length ? (
            <dl className="product-statline" aria-label="Summary">
              {props.stats.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>
                    <strong>{s.value}</strong>
                    {s.hint ? <span>{s.hint}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        {props.actions ? <div className="product-header-actions">{props.actions}</div> : null}
      </div>
      {props.tabs?.length ? (
        <nav className="product-tabs" aria-label="Workspace sections">
          {props.tabs.map((t) => (
            <Link key={t.href + t.label} href={t.href} aria-current={t.active ? "page" : undefined} className={t.active ? "is-active" : undefined}>
              {t.label}
              {typeof t.count === "number" ? <span className="product-tab-count">{t.count}</span> : null}
            </Link>
          ))}
        </nav>
      ) : null}
    </section>
  );
}

export function ProductSection(props: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="product-section" aria-labelledby={props.id ? `${props.id}-title` : undefined}>
      <header className="product-section-head">
        <div>
          <span className="product-eyebrow">{props.eyebrow}</span>
          <h2 id={props.id ? `${props.id}-title` : undefined}>{props.title}</h2>
          {props.description ? <p>{props.description}</p> : null}
        </div>
        {props.actions ? <div className="product-section-actions">{props.actions}</div> : null}
      </header>
      <div className="product-section-body">{props.children}</div>
    </section>
  );
}

export function StatusBadge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "info"; children: ReactNode }) {
  return <span className={`product-badge product-badge-${tone}`}>{children}</span>;
}

export function DetailGrid({ items }: { items: Array<{ label: string; value: ReactNode; hint?: string }> }) {
  return (
    <dl className="product-details">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            {item.value}
            {item.hint ? <small>{item.hint}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ProductEmpty(props: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  const Icon = props.icon;
  return (
    <div className="product-empty" role="status">
      {Icon ? (
        <span className="product-empty-icon" aria-hidden="true">
          <Icon size={22} />
        </span>
      ) : null}
      <h3>{props.title}</h3>
      {props.description ? <p>{props.description}</p> : null}
      {props.action ? <div className="product-empty-action">{props.action}</div> : null}
    </div>
  );
}

export function ProductError({ title = "Something went wrong", description, retryHref }: { title?: string; description?: string; retryHref?: string }) {
  return (
    <div className="product-state product-state-error" role="alert">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {retryHref ? (
        <Link href={retryHref} className="button secondary">
          Try again
        </Link>
      ) : null}
    </div>
  );
}
