"use client";

import { useEffect, useState } from "react";
import { ThemeSwitcher } from "./ThemeSwitcher";

export type ThemeMode = "light" | "dark";
export type AccentName = "coral" | "emerald" | "violet" | "amber" | "rose" | "teal";
export type Density = "comfortable" | "compact";

type Preferences = { mode: ThemeMode; accent: AccentName; density: Density };

const DEFAULTS: Preferences = { mode: "light", accent: "teal", density: "comfortable" };
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
  useEffect(() => { const value = getThemePreferences(); setPreferences(value); applyPreferences(value); }, []);
  useEffect(() => { applyPreferences(preferences); localStorage.setItem(KEY, JSON.stringify(preferences)); }, [preferences]);
  return <><ThemeSwitcher />{children}</>;
}

export function saveThemePreferences(patch: Partial<Preferences>): Preferences {
  const next = { ...getThemePreferences(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next)); applyPreferences(next); return next;
}

export const accentOptions: { id: AccentName; label: string; value: string }[] = [
  { id: "coral", label: "Clay", value: "#9b4f3f" },
  { id: "emerald", label: "Forest", value: "#18794e" },
  { id: "violet", label: "Indigo", value: "#5962a8" },
  { id: "amber", label: "Amber", value: "#a15c00" },
  { id: "rose", label: "Rose", value: "#a24d70" },
  { id: "teal", label: "Sukuu Green", value: "#176b5f" },
];

export type ThemePreset = "paper" | "midnight" | "slate" | "warm";
export const themePresets: { id: ThemePreset; label: string; mode: ThemeMode; accent: AccentName; description: string }[] = [
  { id: "paper", label: "Paper", mode: "light", accent: "teal", description: "Bright, clean and calm" },
  { id: "midnight", label: "Night", mode: "dark", accent: "teal", description: "Green-charcoal with clear text" },
  { id: "slate", label: "Indigo", mode: "dark", accent: "violet", description: "Cool dark workspace" },
  { id: "warm", label: "Warm", mode: "light", accent: "amber", description: "Soft cream and ink" },
];