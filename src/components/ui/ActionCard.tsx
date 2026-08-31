import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function ActionCard({ title, description, href, icon: Icon, children }: { title: string; description: string; href?: string; icon?: LucideIcon; children?: React.ReactNode }) {
  const content = <><span className="sn-action-card-icon">{Icon ? <Icon size={19} aria-hidden="true" /> : null}</span><div><strong>{title}</strong><p>{description}</p>{children}</div></>;
  return href ? <Link className="sn-action-card" href={href}>{content}</Link> : <article className="sn-action-card">{content}</article>;
}
