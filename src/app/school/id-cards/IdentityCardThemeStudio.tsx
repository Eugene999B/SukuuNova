"use client";

import type { CSSProperties } from "react";
import { Check, LoaderCircle, Palette, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  IDENTITY_CARD_THEMES,
  type IdentityCardThemeKey,
} from "@/lib/identity-card-themes";
import "./identity-card-theme-studio.css";

type Props = {
  initialTheme: IdentityCardThemeKey;
};

export default function IdentityCardThemeStudio({ initialTheme }: Props) {
  const [selected, setSelected] = useState<IdentityCardThemeKey>(initialTheme);
  const [busy, setBusy] = useState<IdentityCardThemeKey | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function applyTheme(themeKey: IdentityCardThemeKey) {
    if (busy || themeKey === selected) return;
    setBusy(themeKey);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/school/identity-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set-theme", themeKey }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || "Unable to apply the ID-card theme.");
      setSelected(themeKey);
      const theme = IDENTITY_CARD_THEMES.find((item) => item.key === themeKey);
      setMessage(`${theme?.name ?? "Theme"} is now the school ID-card design. New previews, individual downloads and bulk print packs will use it.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to apply the ID-card theme.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="identity-theme-studio app-card app-panel">
      <div className="identity-theme-head">
        <div>
          <span className="app-eyebrow">CARD THEMES</span>
          <h2>Choose the institution's ID-card style</h2>
          <p>Six genuinely different CR80 designs are available. The selected theme becomes the school-wide front/back artwork for student and staff previews, SVG exports, individual PDFs and bulk A4 printing.</p>
        </div>
        <div className="identity-theme-current"><Palette size={16}/><span>Current theme</span><strong>{IDENTITY_CARD_THEMES.find((item) => item.key === selected)?.name}</strong></div>
      </div>

      <div className="identity-theme-grid">
        {IDENTITY_CARD_THEMES.map((theme) => {
          const active = selected === theme.key;
          const applying = busy === theme.key;
          const themeStyle = {
            "--theme-bg": theme.frontBackground,
            "--theme-ink": theme.ink,
            "--theme-primary": theme.primary,
            "--theme-accent": theme.accent,
            "--theme-highlight": theme.highlight,
          } as CSSProperties;
          return (
            <button
              type="button"
              className={`identity-theme-option theme-${theme.key}${active ? " is-active" : ""}`}
              key={theme.key}
              onClick={() => void applyTheme(theme.key)}
              disabled={Boolean(busy)}
              aria-pressed={active}
              style={themeStyle}
            >
              <div className="identity-theme-mini" aria-hidden="true">
                <div className="identity-theme-mini-brand"><span/><b>ACADEMY</b><i/></div>
                <div className="identity-theme-mini-body"><em/><div><b>STUDENT NAME</b><span>ID 2026-0001</span><small>CLASS / HOUSE</small></div></div>
                <div className="identity-theme-mini-foot"><span>VALID</span><i/></div>
              </div>
              <div className="identity-theme-option-copy">
                <div><strong>{theme.name}</strong>{active ? <span className="identity-theme-active-badge"><Check size={11}/> Current</span> : null}</div>
                <p>{theme.description}</p>
                <small>{applying ? <><LoaderCircle className="identity-theme-spin" size={12}/> Applying…</> : active ? <><ShieldCheck size={12}/> Used for all cards</> : "Click to use this theme"}</small>
              </div>
            </button>
          );
        })}
      </div>

      {message ? <div className="identity-theme-message is-success" role="status">{message}</div> : null}
      {error ? <div className="identity-theme-message is-error" role="alert">{error}</div> : null}
    </section>
  );
}
