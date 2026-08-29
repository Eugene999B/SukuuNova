"use client";

import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";
export type AccentName = "coral" | "emerald" | "violet" | "amber" | "rose" | "teal";
export type Density = "comfortable" | "compact";

type Preferences = { mode: ThemeMode; accent: AccentName; density: Density };

const DEFAULTS: Preferences = { mode: "light", accent: "coral", density: "comfortable" };
const KEY = "sukuunova-theme-preferences";

function applyPreferences(value: Preferences) {
  const root = document.documentElement;
  root.dataset.theme = value.mode;
  root.dataset.accent = value.accent;
  root.dataset.density = value.density;
  root.style.colorScheme = value.mode;
}

export function getThemePreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Preferences> | null;
    return {
      mode: parsed?.mode === "dark" ? "dark" : "light",
      accent: ["coral", "emerald", "violet", "amber", "rose", "teal"].includes(parsed?.accent ?? "") ? parsed!.accent as AccentName : DEFAULTS.accent,
      density: parsed?.density === "compact" ? "compact" : "comfortable",
    };
  } catch { return DEFAULTS; }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  useEffect(() => {
    const value = getThemePreferences();
    setPreferences(value);
    applyPreferences(value);
  }, []);

  useEffect(() => { applyPreferences(preferences); localStorage.setItem(KEY, JSON.stringify(preferences)); }, [preferences]);

  return <>{children}</>;
}

export function saveThemePreferences(patch: Partial<Preferences>): Preferences {
  const next = { ...getThemePreferences(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  applyPreferences(next);
  return next;
}

export const accentOptions: { id: AccentName; label: string; value: string }[] = [
  { id: "coral", label: "Coral", value: "#e7654f" },
  { id: "emerald", label: "Emerald", value: "#168f72" },
  { id: "violet", label: "Violet", value: "#7250c9" },
  { id: "amber", label: "Amber", value: "#c67d16" },
  { id: "rose", label: "Rose", value: "#c24e79" },
  { id: "teal", label: "Teal", value: "#147f87" },
];
