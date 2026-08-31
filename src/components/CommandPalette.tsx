"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileText, Search, UserRound, X } from "lucide-react";

export type CommandItem = { label: string; href: string; group: string };
type LiveResult = { id: string; kind: "student" | "invoice"; title: string; subtitle: string; href: string };
type PaletteEntry = { key: string; href: string };

export function CommandPalette({ items, open, onClose, liveSearchEndpoint }: { items: CommandItem[]; open: boolean; onClose: () => void; liveSearchEndpoint?: string }) {
  const [query, setQuery] = useState("");
  const [liveResults, setLiveResults] = useState<LiveResult[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const normalized = query.trim().toLowerCase();
  const results = useMemo(
    () => items.filter((item) => !normalized || `${item.label} ${item.group}`.toLowerCase().includes(normalized)).slice(0, 10),
    [items, normalized]
  );
  const entries = useMemo<PaletteEntry[]>(() => [
    ...liveResults.map((item) => ({ key: `${item.kind}-${item.id}`, href: item.href })),
    ...results.map((item) => ({ key: `${item.group}-${item.href}`, href: item.href }))
  ], [liveResults, results]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setLiveResults([]);
    setHighlighted(0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key === "ArrowDown") { event.preventDefault(); setHighlighted((value) => Math.min(value + 1, Math.max(0, entries.length - 1))); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); setHighlighted((value) => Math.max(0, value - 1)); return; }
      if (event.key === "Enter" && entries[highlighted]) {
        event.preventDefault(); window.location.href = entries[highlighted].href; onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, entries, highlighted]);

  useEffect(() => {
    setHighlighted(0);
  }, [query, liveResults.length, results.length]);

  useEffect(() => {
    if (!open || !liveSearchEndpoint || query.trim().length < 2) {
      setLiveResults([]);
      setLiveLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLiveLoading(true);
      try {
        const response = await fetch(`${liveSearchEndpoint}?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, headers: { accept: "application/json" } });
        if (!response.ok) throw new Error("Search failed");
        const data = (await response.json()) as { results?: LiveResult[] };
        setLiveResults(Array.isArray(data.results) ? data.results : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setLiveResults([]);
      } finally {
        if (!controller.signal.aborted) setLiveLoading(false);
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, liveSearchEndpoint, query]);

  if (!open) return null;

  let index = 0;
  return (
    <div className="sn-command-backdrop" role="dialog" aria-modal="true" aria-label="SukuuNova command palette" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="sn-command-palette">
        <div className="sn-command-input-wrap">
          <Search size={18} aria-hidden="true" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jump to a workspace or search by student, admission no., invoice…" aria-label="Command search" />
          <button type="button" className="sn-command-close" onClick={onClose} aria-label="Close command palette"><X size={16} /></button>
        </div>
        <div className="sn-command-results">
          {normalized.length >= 2 && (liveLoading || liveResults.length) ? (
            <>
              {liveResults.length ? <div className="sn-command-section-label">Live records</div> : null}
              {liveResults.map((item) => {
                const itemIndex = index++;
                const selected = highlighted === itemIndex;
                return <Link key={`${item.kind}-${item.id}`} href={item.href} onMouseEnter={() => setHighlighted(itemIndex)} onClick={onClose} className={`sn-command-item ${selected ? "is-selected" : ""}`}>
                  <span className="sn-command-leading-icon">{item.kind === "student" ? <UserRound size={16} /> : <FileText size={16} />}</span>
                  <span><small>{item.kind === "student" ? "Student" : "Invoice"}</small><strong>{item.title}</strong><em>{item.subtitle}</em></span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>;
              })}
            </>
          ) : null}
          {results.length ? (
            <>
              {normalized.length >= 2 ? <div className="sn-command-section-label">Workspaces</div> : null}
              {results.map((item) => {
                const itemIndex = index++;
                const selected = highlighted === itemIndex;
                return <Link key={`${item.group}-${item.href}`} href={item.href} onMouseEnter={() => setHighlighted(itemIndex)} onClick={onClose} className={`sn-command-item ${selected ? "is-selected" : ""}`}>
                  <span><small>{item.group}</small><strong>{item.label}</strong></span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>;
              })}
            </>
          ) : null}
          {!results.length && !liveResults.length && !liveLoading ? <div className="sn-command-empty">No matching workspace or live record.</div> : null}
        </div>
      </div>
    </div>
  );
}
