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
  musicVolume: 0.58,
  soundEffectsVolume: 0.82,
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
  if (context && context.state !== "closed") return context;
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

function tone(frequency: number, duration: number, volume: number, type: OscillatorType = "sine", delay = 0, endRatio = 1) {
  const ctx = audioContext();
  if (!ctx || ctx.state !== "running") return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime + delay;
  const stop = start + duration;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(40, frequency), start);
  if (endRatio !== 1) oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * endRatio), stop);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.025, duration / 5));
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(stop + 0.025);
}

function logicStageCue(cue: ArcadeSoundCue, root: number, volume: number) {
  if (cue === "launch") {
    tone(root * .5, .42, .045 * volume, "sine", 0, 1.45);
    tone(root, .19, .06 * volume, "triangle", .03);
    tone(root * 1.5, .24, .055 * volume, "triangle", .16);
    tone(root * 2, .34, .05 * volume, "sine", .31);
  } else if (cue === "success" || cue === "unlock") {
    tone(root, .11, .065 * volume, "triangle");
    tone(root * 1.25, .13, .07 * volume, "triangle", .08);
    tone(root * 1.5, .18, .072 * volume, "sine", .16);
    tone(root * 2, .32, .06 * volume, "sine", .27);
  } else if (cue === "error") {
    tone(root, .12, .052 * volume, "triangle", 0, .82);
    tone(root * .72, .24, .05 * volume, "sine", .10, .82);
  } else if (cue === "scan") {
    tone(root * .62, .17, .035 * volume, "sine", 0, 1.9);
    tone(root * 1.25, .12, .045 * volume, "triangle", .12, 1.35);
  }
}

function playCueNow(cue: ArcadeSoundCue, game: string) {
  const settings = arcadeAudioSettings();
  if (!settings.soundEffects || settings.soundEffectsVolume <= 0) return;
  const root = gameFrequency(game);
  const volume = settings.soundEffectsVolume;
  if (game === "logic" && ["launch", "success", "unlock", "error", "scan"].includes(cue)) {
    logicStageCue(cue, root, volume);
    return;
  }
  const patterns: Record<ArcadeSoundCue, readonly [number, number, number, OscillatorType][]> = {
    open: [[1, .09, .058, "triangle"], [1.5, .16, .045, "sine"]],
    select: [[1.5, .06, .052, "sine"]],
    launch: [[1, .09, .06, "triangle"], [1.33, .11, .058, "triangle"], [2, .22, .05, "sine"]],
    success: [[1, .09, .055, "sine"], [1.25, .1, .06, "triangle"], [1.5, .2, .065, "sine"]],
    unlock: [[1, .08, .05, "triangle"], [1.33, .09, .055, "triangle"], [1.66, .11, .06, "sine"], [2, .22, .058, "sine"]],
    error: [[.86, .13, .046, "triangle"], [.7, .2, .042, "sine"]],
    reward: [[1.5, .08, .052, "sine"], [2, .1, .058, "triangle"], [2.5, .2, .052, "sine"]],
    scan: [[.75, .08, .035, "sine"], [1, .09, .04, "sine"], [1.5, .12, .05, "triangle"], [2, .18, .04, "sine"]],
  };
  patterns[cue].forEach(([ratio, duration, cueVolume, type], index) => tone(root * ratio, duration, cueVolume * volume, type, index * .065));
}

export function playArcadeSound(cue: ArcadeSoundCue, game: string) {
  const settings = arcadeAudioSettings();
  if (!settings.soundEffects || settings.soundEffectsVolume <= 0) return;
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "running") { playCueNow(cue, game); return; }
  void ctx.resume().then(() => playCueNow(cue, game)).catch(() => undefined);
}

function musicProfile(game: string) {
  switch (game) {
    case "number-pop": return { scale:[1, 1.25, 1.5, 1.25, 1.75, 1.5], type:"sine" as OscillatorType, tempo:1060 };
    case "logic": return { scale:[1, 1.5, 1.25, 1.875, 1.5, 2, 1.25, 1.667], type:"triangle" as OscillatorType, tempo:760 };
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
  tone(root * ratio, .66, .024 * master, profile.type);
  tone(root * ratio * 2, .24, .011 * master, identity.accent === "#facc15" ? "triangle" : "sine", .055);
  if (musicStep % 4 === 0) tone(root / 2, .88, .012 * master, "sine", .02);
  if (game === "logic") {
    const pulse = musicStep % 2 === 0 ? 1.5 : 1.25;
    tone(root * pulse, .18, .012 * master, "triangle", .31);
    if (musicStep % 4 === 0) tone(root * 2, .12, .014 * master, "sine", .48);
  }
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
  if (!ctx) return;
  if (ctx.state === "running") { beginMusicLoop(game); return; }
  void ctx.resume().then(() => beginMusicLoop(game)).catch(() => undefined);
}

export function stopArcadeMusic() {
  desiredMusicGame = "";
  clearMusicLoop();
}

export function unlockArcadeAudio() {
  const ctx = audioContext();
  if (!ctx) return false;
  if (ctx.state === "running") {
    if (desiredMusicGame && activeMusicGame !== desiredMusicGame) beginMusicLoop(desiredMusicGame);
    return true;
  }
  void ctx.resume().then(() => {
    if (desiredMusicGame) beginMusicLoop(desiredMusicGame);
  }).catch(() => undefined);
  return true;
}
