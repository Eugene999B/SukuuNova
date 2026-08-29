"use client";

import { useEffect, useState } from "react";
import { accentOptions, getThemePreferences, saveThemePreferences, type AccentName, type Density, type ThemeMode } from "@/components/ThemeProvider";

export default function ThemePreferences() {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [accent, setAccent] = useState<AccentName>("coral");
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    const value = getThemePreferences();
    setMode(value.mode); setAccent(value.accent); setDensity(value.density);
  }, []);

  const update = (patch: Partial<{mode:ThemeMode;accent:AccentName;density:Density}>) => {
    const next = saveThemePreferences(patch);
    setMode(next.mode); setAccent(next.accent); setDensity(next.density);
  };

  return <section className="theme-preferences">
    <div className="theme-preferences-head"><div><span className="eyebrow">Personal appearance</span><h3>Make SukuuNova feel like yours</h3><p>Your choices are saved for this account and apply across the school workspace on this device.</p></div><span className="theme-live-dot">Live</span></div>
    <div className="theme-preferences-grid">
      <div><span className="theme-label">Theme</span><div className="theme-choice-row"><button className={mode==="light"?"selected":""} onClick={()=>update({mode:"light"})}><span className="theme-preview light-preview"/>Light</button><button className={mode==="dark"?"selected":""} onClick={()=>update({mode:"dark"})}><span className="theme-preview dark-preview"/>Dark</button></div></div>
      <div><span className="theme-label">Accent colour</span><div className="accent-grid">{accentOptions.map(option=><button key={option.id} title={option.label} aria-label={`Use ${option.label} accent`} className={accent===option.id?"selected":""} onClick={()=>update({accent:option.id})}><span style={{background:option.value}}/>{option.label}</button>)}</div></div>
      <div><span className="theme-label">Interface density</span><div className="theme-choice-row"><button className={density==="comfortable"?"selected":""} onClick={()=>update({density:"comfortable"})}><b>Comfortable</b><small>More breathing room</small></button><button className={density==="compact"?"selected":""} onClick={()=>update({density:"compact"})}><b>Compact</b><small>More information on screen</small></button></div></div>
    </div>
  </section>;
}
