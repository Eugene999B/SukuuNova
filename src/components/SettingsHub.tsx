import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import "./settings-hub.css";

export function SettingsHero({ eyebrow, title, description, contextLabel, contextValue, contextMeta }: {
  eyebrow: string;
  title: string;
  description: string;
  contextLabel?: string;
  contextValue?: string;
  contextMeta?: string;
}) {
  return (
    <section className="settings-hub-hero">
      <div>
        <span className="settings-hub-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {contextValue ? (
        <div className="settings-hub-context">
          {contextLabel ? <span>{contextLabel}</span> : null}
          <strong>{contextValue}</strong>
          {contextMeta ? <small>{contextMeta}</small> : null}
        </div>
      ) : null}
    </section>
  );
}

export function SettingsSection({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-hub-section">
      <div className="settings-hub-section-head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function SettingsRouteCard({ href, icon: Icon, title, description, action = "Open settings" }: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  action?: string;
}) {
  return (
    <Link href={href} className="settings-route-card">
      <div className="settings-route-card-top">
        <span className="settings-route-icon"><Icon size={18} aria-hidden="true" /></span>
        <ArrowRight className="settings-route-arrow" size={17} aria-hidden="true" />
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
      <small>{action}</small>
    </Link>
  );
}
