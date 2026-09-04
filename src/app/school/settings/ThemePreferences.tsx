"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { getThemePreferences, saveThemePreferences, themePresets, type Density, type ThemePreset } from "@/components/ThemeProvider";

export default function ThemePreferences() {
  const [selected, setSelected] = useState<ThemePreset>("light");
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    const value = getThemePreferences();
    const match = themePresets.find((preset) => preset.mode === value.mode && preset.accent === value.accent);
    setSelected(match?.id ?? "light");
    setDensity(value.density);
  }, []);

  const updatePreset = (preset: (typeof themePresets)[number]) => {
    saveThemePreferences({ mode: preset.mode, accent: preset.accent });
    setSelected(preset.id);
  };

  const updateDensity = (value: Density) => {
    saveThemePreferences({ density: value });
    setDensity(value);
  };

  return <section className="theme-preferences">
    <div className="theme-preferences-head">
      <div><span className="eyebrow">Personal appearance</span><h3>Make SukuuNova feel like yours</h3><p>Choose a complete look that stays readable and comfortable across the school workspace on this device.</p></div>
      <span className="theme-live-dot">Live</span>
    </div>

    <div className="theme-preferences-grid">
      <div className="theme-preferences-wide">
        <span className="theme-label">SukuuNova theme</span>
        <div className="theme-preset-grid">
          {themePresets.map((preset) => (
            <button type="button" key={preset.id} className={`theme-preset ${selected === preset.id ? "selected" : ""}`} onClick={() => updatePreset(preset)} aria-pressed={selected === preset.id}>
              <span className={`theme-preset-preview theme-preview-${preset.id}`} aria-hidden="true"><i /><b /><em /></span>
              <span className="theme-preset-copy"><strong>{preset.label}</strong><small>{preset.description}</small></span>
              {selected === preset.id && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="theme-label">Interface density</span>
        <div className="theme-choice-row">
          <button type="button" className={density === "comfortable" ? "selected" : ""} onClick={() => updateDensity("comfortable")} aria-pressed={density === "comfortable"}><b>Comfortable</b><small>More breathing room</small></button>
          <button type="button" className={density === "compact" ? "selected" : ""} onClick={() => updateDensity("compact")} aria-pressed={density === "compact"}><b>Compact</b><small>More information on screen</small></button>
        </div>
      </div>
    </div>
  </section>;
}
