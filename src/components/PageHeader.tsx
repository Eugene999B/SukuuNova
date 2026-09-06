import type { ReactNode } from "react";
import "./page-header.css";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="sn-page-header"><div className="sn-page-header-copy"><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className="sn-page-header-actions">{actions}</div> : null}</header>;
}
