import type { ReactNode } from "react";
import "./page-header.css";

type Props = { title: string; description?: string; subtitle?: string; actions?: ReactNode };

export function PageHeader({ title, description, subtitle, actions }: Props) {
  const supportingText = description ?? subtitle;
  return <header className="sn-page-header"><div className="sn-page-header-copy"><h1>{title}</h1>{supportingText ? <p>{supportingText}</p> : null}</div>{actions ? <div className="sn-page-header-actions">{actions}</div> : null}</header>;
}
