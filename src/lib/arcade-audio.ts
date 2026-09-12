import { arcadeV5Identity } from "./arcade-v5-design";

export type ArcadeSoundCue = "open" | "select" | "launch" | "success" | "unlock" | "error" | "reward" | "scan";
export type ArcadeAudioSettings = {
  music: boolean;
  soundEffects: boolean;
  musicVolume: number;
  soundEffectsVolume: number;
  reducedMotion: boolean;
  highContrast: boolean;
};

const STORAGE_KEY = "sukuunova.arcade.settings.v1";
const DEFAULTS: ArcadeAudioSettings = {
  music: true,
  soundEffects: true,
  musicVolume: 0.42,
  soundEffectsVolume: 0.68,
  reducedMotion: false,
  highContrast: false,
};

let context: AudioContext | null = null;
let musicTimer: number | null = null;
let desiredMusicGame = "";
let activeMusicGame = "";
let musicStep = 0;

type AudioWindow = typeof window & { webkitAudioContext?: typeof AudioContext };

function browser() { return typeof window !== "undefined"; }
function clampVolume(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}
function stored(): Record<string, unknown> {
  if (!browser()) return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}
function applyDocumentSettings(settings: ArcadeAudioSettings) {
  if (!browser()) return;
  document.documentElement.dataset.arcadeMusic = settings.music ? "on" : "off";
  document.documentElement.dataset.arcadeSfx = settings.soundEffects ? "on" : "off";
  document.documentElement.dataset.arcadeMotion = settings.reducedMotion ? "reduced" : "full";
  document.documentElement.dataset.arcadeContrast = settings.highContrast ? "high" : "standard";
}
function audioContext() {
  if (!browser()) return null;
  if (context) return context;
  const audioWindow = window as AudioWindow;
  const AudioContextCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextCtor) return null;
  try { context = new AudioContextCtor(); } catch { context = null; }
  return context;
}

export function arcadeAudioSettings(): ArcadeAudioSettings {
  const value = stored();
  const settings = {
    music: value.music !== false,
    soundEffects: value.soundEffects !== false,
    musicVolume: clampVolume(value.musicVolume, DEFAULTS.musicVolume),
    soundEffectsVolume: clampVolume(value.soundEffectsVolume, DEFAULTS.soundEffectsVolume),
    reducedMotion: value.reducedMotion === true,
    highContrast: value.highContrast === true,
  };
  applyDocumentSettings(settings);
  return settings;
}

export function setArcadeAudioSettings(patch: Partial<ArcadeAudioSettings>) {
  const current = arcadeAudioSettings();
  const next: ArcadeAudioSettings = {
    ...current,
    ...patch,
    musicVolume: clampVolume(patch.musicVolume ?? current.musicVolume, current.musicVolume),
    soundEffectsVolume: clampVolume(patch.soundEffectsVolume ?? current.soundEffectsVolume, current.soundEffectsVolume),
  };
  if (browser()) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage can be unavailable */ }
  }
  applyDocumentSettings(next);
  if (!next.music || next.musicVolume <= 0) clearMusicLoop();
  else if (desiredMusicGame) startArcadeMusic(desiredMusicGame);
  return next;
}

function gameFrequency(game: string) {
  let hash = 0;
  for (const char of game) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 155 + (hash % 95);
}

function tone(frequency: number, duration: number, volume: number, type: OscillatorType = "sine", delay = 0) {
  const ctx = audioContext();
  if (!ctx || ctx.state !== "running") return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime + delay;
  const stop = start + duration;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(40, frequency), start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.04, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(stop + 0.02);
}

function playCueNow(cue: ArcadeSoundCue, game: string) {
  const settings = arcadeAudioSettings();
  if (!settings.soundEffects || settings.soundEffectsVolume <= 0) return;
  const root = gameFrequency(game);
  const volume = settings.soundEffectsVolume;
  const patterns: Record<ArcadeSoundCue, readonly [number, number, number, OscillatorType][]> = {
    open: [[1, .09, .026, "triangle"], [1.5, .16, .018, "sine"]],
    select: [[1.5, .055, .022, "sine"]],
    launch: [[1, .08, .025, "triangle"], [1.33, .1, .024, "triangle"], [2, .2, .02, "sine"]],
    success: [[1, .08, .022, "sine"], [1.25, .09, .024, "triangle"], [1.5, .18, .026, "sine"]],
    unlock: [[1, .07, .02, "triangle"], [1.33, .08, .022, "triangle"], [1.66, .1, .024, "sine"], [2, .2, .022, "sine"]],
    error: [[.86, .12, .018, "triangle"], [.7, .18, .016, "sine"]],
    reward: [[1.5, .07, .02, "sine"], [2, .09, .022, "triangle"], [2.5, .18, .02, "sine"]],
    scan: [[.75, .07, .014, "sine"], [1, .08, .018, "sine"], [1.5, .11, .02, "triangle"], [2, .16, .014, "sine"]],
  };
  patterns[cue].forEach(([ratio, duration, cueVolume, type], index) => tone(root * ratio, duration, cueVolume * volume, type, index * .065));
}

export function playArcadeSound(cue: ArcadeSoundCue, game: string) {
  const settings = arcadeAudioSettings();
  if (!settings.soundEffects) return;
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "running") { playCueNow(cue, game); return; }
  void ctx.resume().then(() => playCueNow(cue, game)).catch(() => undefined);
}

function musicProfile(game: string) {
  switch (game) {
    case "number-pop": return { scale:[1, 1.25, 1.5, 1.25, 1.75, 1.5], type:"sine" as OscillatorType, tempo:1060 };
    case "logic": return { scale:[1, 1.25, 1.5, 1.875, 2, 1.5], type:"triangle" as OscillatorType, tempo:900 };
    case "keyboard-ninja": return { scale:[1, 1.125, 1.25, 1.5, 1.6875], type:"square" as OscillatorType, tempo:520 };
    case "force-motion-lab": return { scale:[1, 1.2, 1.5, 1.8, 1.5], type:"sine" as OscillatorType, tempo:860 };
    case "circuit-logic": return { scale:[1, 1.25, 1.5, 2, 1.5], type:"triangle" as OscillatorType, tempo:620 };
    case "word": return { scale:[1, 1.25, 1.5, 2, 1.5, 1.25], type:"sine" as OscillatorType, tempo:980 };
    case "sentence-scramble": return { scale:[1, 1.25, 1.5, 1.333, 1.75, 2, 1.5], type:"triangle" as OscillatorType, tempo:840 };
    case "comprehension-quest": return { scale:[1, 1.2, 1.5, 1.8], type:"sine" as OscillatorType, tempo:1120 };
    case "coding-sequence": return { scale:[1, 1.5, 1.25, 2], type:"triangle" as OscillatorType, tempo:700 };
    case "ghana-map-master": return { scale:[1, 1.25, 1.5, 1.25, 1.8], type:"sine" as OscillatorType, tempo:1040 };
    case "money-math-market": return { scale:[1, 1.25, 1.5, 1.875, 1.5], type:"triangle" as OscillatorType, tempo:760 };
    case "cyber-safety": return { scale:[1, 1.5, 1.125, 2, 1.5], type:"square" as OscillatorType, tempo:640 };
    case "environment-guardian": return { scale:[1, 1.2, 1.5, 1.8, 1.5], type:"sine" as OscillatorType, tempo:1080 };
    case "body-explorer": return { scale:[1, 1.25, 1.5, 1.333], type:"sine" as OscillatorType, tempo:920 };
    case "history-timeline": return { scale:[1, 1.2, 1.5, 1.8, 1.2], type:"triangle" as OscillatorType, tempo:1180 };
    case "culture-heritage": return { scale:[1, 1.25, 1.5, 1.75, 2, 1.5], type:"triangle" as OscillatorType, tempo:820 };
    case "space-explorer": return { scale:[1, 1.2, 1.5, 2, 1.8, 1.333], type:"sine" as OscillatorType, tempo:940 };
    default: return { scale:[1, 1.125, 1.5, 1.6875, 2], type:"triangle" as OscillatorType, tempo:680 };
  }
}

function musicPulse(game: string) {
  const settings = arcadeAudioSettings();
  if (!settings.music || settings.musicVolume <= 0 || activeMusicGame !== game) return;
  const root = gameFrequency(game) / 2;
  const identity = arcadeV5Identity(game);
  const profile = musicProfile(game);
  const ratio = profile.scale[musicStep % profile.scale.length] ?? 1;
  musicStep += 1;
  const master = settings.musicVolume;
  tone(root * ratio, .62, .010 * master, profile.type);
  tone(root * ratio * 2, .2, .0045 * master, identity.accent === "#facc15" ? "triangle" : "sine", .06);
  if (musicStep % 4 === 0) tone(root / 2, .8, .004 * master, "sine", .02);
}

function clearMusicLoop() {
  if (browser() && musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
  activeMusicGame = "";
  musicStep = 0;
}

function beginMusicLoop(game: string) {
  const ctx = audioContext();
  const settings = arcadeAudioSettings();
  if (!browser() || !ctx || ctx.state !== "running" || !settings.music || settings.musicVolume <= 0) return;
  clearMusicLoop();
  activeMusicGame = game;
  musicStep = 0;
  const profile = musicProfile(game);
  musicPulse(game);
  musicTimer = window.setInterval(() => musicPulse(game), profile.tempo);
}

export function startArcadeMusic(game: string) {
  desiredMusicGame = game;
  const ctx = audioContext();
  if (!ctx || ctx.state !== "running") return;
  beginMusicLoop(game);
}

export function stopArcadeMusic() {
  desiredMusicGame = "";
  clearMusicLoop();
}

export function unlockArcadeAudio() {
  const ctx = audioContext();
  if (!ctx) return false;
  if (ctx.state === "running") {
    if (desiredMusicGame) beginMusicLoop(desiredMusicGame);
    return true;
  }
  void ctx.resume().then(() => {
    if (desiredMusicGame) beginMusicLoop(desiredMusicGame);
  }).catch(() => undefined);
  return true;
}
