"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";

export type CommandItem = { label: string; href: string; group: string };

export function CommandPalette({ items, open, onClose }: { items: CommandItem[]; open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const results = useMemo(
    () => items.filter((item) => !normalized || `${item.label} ${item.group}`.toLowerCase().includes(normalized)).slice(0, 12),
    [items, normalized]
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sn-command-backdrop" role="dialog" aria-modal="true" aria-label="SukuuNova command palette" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="sn-command-palette">
        <div className="sn-command-input-wrap">
          <Search size={18} aria-hidden="true" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jump to a workspace or search by name, admission no., invoice…" aria-label="Command search" />
          <button type="button" className="sn-command-close" onClick={onClose} aria-label="Close command palette"><X size={16} /></button>
        </div>
        <div className="sn-command-results">
          {results.length ? results.map((item) => (
            <Link key={`${item.group}-${item.href}`} href={item.href} onClick={onClose} className="sn-command-item">
              <span><small>{item.group}</small><strong>{item.label}</strong></span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )) : (
            <div className="sn-command-empty">No matching destination. Use the full Search workspace for live records.</div>
          )}
        </div>
      </div>
    </div>
  );
}
