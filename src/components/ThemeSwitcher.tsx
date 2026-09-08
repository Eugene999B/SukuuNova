"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Moon, Palette, Sun, X } from "lucide-react";
import { getThemePreferences, saveThemePreferences, themePresets, type ThemePreset } from "./ThemeProvider";

const THEME_CHANGE_EVENT = "sukuunova:theme-change";

export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ThemePreset>("light");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setSelected(getThemePreferences().mode);
    sync();
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const choose = (preset: (typeof themePresets)[number]) => {
    saveThemePreferences({ mode: preset.mode });
    setSelected(preset.id);
    setOpen(false);
  };

  return (
    <div className={`sn-theme-switcher ${open ? "is-open" : ""}`} ref={rootRef}>
      {open ? <button type="button" className="sn-theme-backdrop" aria-label="Close theme chooser" onClick={() => setOpen(false)} /> : null}
      {open && (
        <div className="sn-theme-popover" role="dialog" aria-modal="true" aria-label="Choose SukuuNova theme">
          <div className="sn-theme-popover-head">
            <div><strong>Appearance</strong><span>Choose the view that feels best on this device.</span></div>
            <button type="button" className="sn-theme-close" onClick={() => setOpen(false)} aria-label="Close theme chooser"><X size={16} /></button>
          </div>
          <div className="sn-theme-grid">
            {themePresets.map((preset) => (
              <button type="button" key={preset.id} className={selected === preset.id ? "is-selected" : ""} onClick={() => choose(preset)} aria-pressed={selected === preset.id}>
                <span className={`sn-theme-swatch sn-theme-${preset.id}`} aria-hidden="true"><i /><b /></span>
                <span className="sn-theme-copy"><strong>{preset.label}</strong><small>{preset.description}</small></span>
                <span className="sn-theme-check" aria-hidden="true">{selected === preset.id ? <Check size={15} /> : null}</span>
              </button>
            ))}
          </div>
          <div className="sn-theme-foot"><Palette size={14} aria-hidden="true" /><span>Your preference is saved on this device.</span></div>
        </div>
      )}
      <button type="button" className="sn-theme-button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog" aria-label={`Change SukuuNova theme. Current theme: ${selected}`}>
        <span className="sn-theme-button-icon">{selected === "dark" ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}</span>
        <span className="sn-theme-button-label">{selected === "dark" ? "Dark" : "Light"}</span>
      </button>
    </div>
  );
}
