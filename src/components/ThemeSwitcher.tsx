"use client";

import { useEffect, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { getThemePreferences, saveThemePreferences, themePresets, type ThemePreset } from "./ThemeProvider";

export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ThemePreset>("paper");

  useEffect(() => {
    const value = getThemePreferences();
    const match = themePresets.find((preset) => preset.mode === value.mode && preset.accent === value.accent);
    setSelected(match?.id ?? (value.mode === "dark" ? "midnight" : "paper"));
  }, []);

  const choose = (preset: (typeof themePresets)[number]) => {
    saveThemePreferences({ mode: preset.mode, accent: preset.accent });
    setSelected(preset.id);
    setOpen(false);
  };

  return (
    <div className="sn-theme-switcher">
      {open && (
        <div className="sn-theme-popover" role="dialog" aria-label="Choose SukuuNova theme">
          <div className="sn-theme-popover-head">
            <div><strong>Choose a look</strong><span>Changes apply straight away.</span></div>
            <Palette size={16} aria-hidden="true" />
          </div>
          <div className="sn-theme-grid">
            {themePresets.map((preset) => (
              <button type="button" key={preset.id} className={selected === preset.id ? "is-selected" : ""} onClick={() => choose(preset)}>
                <span className={`sn-theme-swatch sn-theme-${preset.id}`} aria-hidden="true"><i /><b /></span>
                <span className="sn-theme-copy"><strong>{preset.label}</strong><small>{preset.description}</small></span>
                {selected === preset.id && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="button" className="sn-theme-button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Change SukuuNova theme">
        {selected === "midnight" || selected === "slate" ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
        <span>Theme</span>
      </button>
    </div>
  );
}
