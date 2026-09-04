"use client";

import { useEffect, useState } from "react";
import { ThemeSwitcher } from "./ThemeSwitcher";

export type ThemeMode = "light" | "dark";
export type AccentName = "teal";
export type Density = "comfortable" | "compact";

type Preferences = { mode: ThemeMode; accent: AccentName; density: Density };

const DEFAULTS: Preferences = { mode: "light", accent: "teal", density: "comfortable" };
const KEY = "sukuunova-theme-preferences";

function applyPreferences(value: Preferences) {
  const root = document.documentElement;
  root.dataset.theme = value.mode;
  // Kept for backwards compatibility with existing persisted preferences;
  // the global theme intentionally uses one SukuuNova brand accent in both modes.
  root.dataset.accent = "teal";
  root.dataset.density = value.density;
  root.style.colorScheme = value.mode;
}

export function getThemePreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Preferences> | null;
    return {
      mode: parsed?.mode === "dark" ? "dark" : "light",
      accent: "teal",
      density: parsed?.density === "compact" ? "compact" : "comfortable",
    };
  } catch { return DEFAULTS; }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  useEffect(() => { const value = getThemePreferences(); setPreferences(value); applyPreferences(value); }, []);
  useEffect(() => { applyPreferences(preferences); localStorage.setItem(KEY, JSON.stringify(preferences)); }, [preferences]);
  return <><ThemeSwitcher />{children}</>;
}

export function saveThemePreferences(patch: Partial<Preferences>): Preferences {
  const next: Preferences = { ...getThemePreferences(), ...patch, accent: "teal" };
  localStorage.setItem(KEY, JSON.stringify(next));
  applyPreferences(next);
  return next;
}

export type ThemePreset = "light" | "dark";
export const themePresets: { id: ThemePreset; label: string; mode: ThemeMode; accent: AccentName; description: string }[] = [
  { id: "light", label: "Light", mode: "light", accent: "teal", description: "White surfaces with deep, readable ink" },
  { id: "dark", label: "Dark", mode: "dark", accent: "teal", description: "Deep slate surfaces with bright, readable text" },
];
