"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Dialog({ open, onClose, title, description, children, size = "md" }: { open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode; size?: "sm" | "md" | "lg" }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={`sn-dialog sn-dialog-${size}`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
      <div className="sn-dialog-card">
        <header className="sn-dialog-head"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div><button type="button" onClick={onClose} className="sn-dialog-close" aria-label="Close dialog"><X size={18} /></button></header>
        <div className="sn-dialog-body">{children}</div>
      </div>
    </dialog>
  );
}
