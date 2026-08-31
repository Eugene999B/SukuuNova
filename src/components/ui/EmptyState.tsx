import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="sn-empty-state" role="status">
      {Icon ? <span className="sn-empty-state-icon"><Icon size={22} aria-hidden="true" /></span> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="sn-empty-state-action">{action}</div> : null}
    </div>
  );
}
