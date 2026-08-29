"use client";

import { useEffect, useState } from "react";

export type PublicTheme = "teal" | "paper" | "midnight" | "high-contrast";

const KEY = "sukuunova-public-theme";
const themes: Array<{ id: PublicTheme; label: string }> = [
  { id: "teal", label: "Sukuu Teal" },
  { id: "paper", label: "Warm Paper" },
  { id: "midnight", label: "Midnight" },
  { id: "high-contrast", label: "High Contrast" },
];

function applyTheme(theme: PublicTheme) {
  document.documentElement.dataset.publicTheme = theme;
}

export function PublicThemePicker() {
  const [theme, setTheme] = useState<PublicTheme>("teal");

  useEffect(() => {
    const saved = localStorage.getItem(KEY) as PublicTheme | null;
    const next = themes.some((item) => item.id === saved) ? saved as PublicTheme : "teal";
    setTheme(next);
    applyTheme(next);
  }, []);

  function change(next: PublicTheme) {
    setTheme(next);
    localStorage.setItem(KEY, next);
    applyTheme(next);
  }

  return (
    <label className="public-theme-picker">
      <span className="public-theme-label">Design</span>
      <select aria-label="Choose design" value={theme} onChange={(event) => change(event.target.value as PublicTheme)}>
        {themes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>
  );
}
