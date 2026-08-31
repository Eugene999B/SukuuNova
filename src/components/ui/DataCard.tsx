import type { LucideIcon } from "lucide-react";

export function DataCard({ label, value, meta, icon: Icon, tone = "default" }: { label: string; value: React.ReactNode; meta?: React.ReactNode; icon?: LucideIcon; tone?: "default" | "success" | "warning" | "info" }) {
  return (
    <article className={`sn-data-card sn-data-card-${tone}`}>
      <div className="sn-data-card-top">
        <span className="sn-data-card-label">{label}</span>
        {Icon ? <span className="sn-data-card-icon"><Icon size={17} aria-hidden="true" /></span> : null}
      </div>
      <strong className="sn-data-card-value">{value}</strong>
      {meta ? <span className="sn-data-card-meta">{meta}</span> : null}
    </article>
  );
}
