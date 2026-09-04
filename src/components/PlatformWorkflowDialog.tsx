"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  size?: "medium" | "large";
};

export default function PlatformWorkflowDialog({ open, eyebrow, title, description, children, onClose, size = "large" }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previous; };
  }, [open, onClose]);

  if (!open) return null;
  return <div className="platform-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className={`platform-dialog platform-dialog-${size}`} role="dialog" aria-modal="true" aria-labelledby="platform-dialog-title">
      <header className="platform-dialog-header">
        <div><span className="platform-eyebrow">{eyebrow ?? "WORKFLOW"}</span><h2 id="platform-dialog-title">{title}</h2>{description ? <p>{description}</p> : null}</div>
        <button type="button" className="platform-dialog-close" onClick={onClose} aria-label="Close dialog"><X size={18}/></button>
      </header>
      <div className="platform-dialog-body">{children}</div>
    </div>
  </div>;
}
