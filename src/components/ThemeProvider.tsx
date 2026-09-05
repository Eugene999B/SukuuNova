"use client";

import { useEffect, useState } from "react";
import { ThemeSwitcher } from "./ThemeSwitcher";

export type ThemeMode = "light" | "dark";
export type AccentName = "teal";
export type Density = "comfortable" | "compact";

type Preferences = { mode: ThemeMode; accent: AccentName; density: Density };

const DEFAULTS: Preferences = { mode: "light", accent: "teal", density: "comfortable" };
const KEY = "sukuunova-theme-preferences";
const THEME_CHANGE_EVENT = "sukuunova:theme-change";

function greetingForDate(date: Date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function syncTimeBasedGreetings() {
  if (typeof document === "undefined") return;

  const greeting = greetingForDate(new Date());
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    const value = node.nodeValue ?? "";
    const trimmed = value.trim();
    const match = trimmed.match(/^Good (?:morning|afternoon|evening),\s+(.+?)([.!?])?$/);
    if (!match) continue;

    const leadingWhitespace = value.match(/^\s*/)?.[0] ?? "";
    const trailingWhitespace = value.match(/\s*$/)?.[0] ?? "";
    const nextValue = `${leadingWhitespace}${greeting}, ${match[1]}${match[2] ?? ""}${trailingWhitespace}`;

    if (nextValue !== value) {
      node.nodeValue = nextValue;
    }
  }
}

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

  useEffect(() => {
    const value = getThemePreferences();
    setPreferences(value);
    applyPreferences(value);

    const handleThemeChange = () => {
      const next = getThemePreferences();
      setPreferences(next);
      applyPreferences(next);
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  }, []);

  useEffect(() => {
    applyPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    syncTimeBasedGreetings();

    let framePending = false;
    const scheduleSync = () => {
      if (framePending) return;
      framePending = true;
      window.requestAnimationFrame(() => {
        framePending = false;
        syncTimeBasedGreetings();
      });
    };

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const interval = window.setInterval(syncTimeBasedGreetings, 60_000);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return <><ThemeSwitcher />{children}</>;
}

export function saveThemePreferences(patch: Partial<Preferences>): Preferences {
  const next: Preferences = { ...getThemePreferences(), ...patch, accent: "teal" };
  localStorage.setItem(KEY, JSON.stringify(next));
  applyPreferences(next);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  return next;
}

export type ThemePreset = "light" | "dark";
export const themePresets: { id: ThemePreset; label: string; mode: ThemeMode; accent: AccentName; description: string }[] = [
  { id: "light", label: "Light", mode: "light", accent: "teal", description: "White surfaces with deep, readable ink" },
  { id: "dark", label: "Dark", mode: "dark", accent: "teal", description: "Deep slate surfaces with bright, readable text" },
];
