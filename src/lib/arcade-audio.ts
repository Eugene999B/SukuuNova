import { arcadeV5Identity } from "./arcade-v5-design";

export type ArcadeSoundCue = "open" | "select" | "launch" | "success" | "unlock" | "error" | "reward";
export type ArcadeAudioSettings = { music: boolean; soundEffects: boolean };

const STORAGE_KEY = "sukuunova.arcade.settings.v1";
const DEFAULTS: ArcadeAudioSettings = { music: true, soundEffects: true };
let context: AudioContext | null = null;
let musicTimer: number | null = null;
let musicGame = "";
let musicStep = 0;

function browser() { return typeof window !== "undefined"; }
function audioContext() {
  if (!browser()) return null;
  if (!context) context = new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}
function stored(): Record<string, unknown> {
  if (!browser()) return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}
export function arcadeAudioSettings(): ArcadeAudioSettings {
  const value = stored();
  return { music: value.music !== false, soundEffects: value.soundEffects !== false };
}
export function setArcadeAudioSettings(patch: Partial<ArcadeAudioSettings>) {
  if (!browser()) return DEFAULTS;
  const current = stored();
  const next = { ...current, ...patch };
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage can be unavailable */ }
  document.documentElement.dataset.arcadeMusic = next.music === false ? "off" : "on";
  document.documentElement.dataset.arcadeSfx = next.soundEffects === false ? "off" : "on";
  if (next.music === false) stopArcadeMusic();
  return { music: next.music !== false, soundEffects: next.soundEffects !== false };
}

function gameFrequency(game: string) {
  let hash = 0;
  for (const char of game) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 150 + (hash % 110);
}
function tone(frequency: number, duration: number, volume: number, type: OscillatorType = "sine", delay = 0) {
  const ctx = audioContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime + delay;
  const stop = start + duration;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.035, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(stop + 0.02);
}

export function playArcadeSound(cue: ArcadeSoundCue, game: string) {
  if (!arcadeAudioSettings().soundEffects) return;
  const root = gameFrequency(game);
  const patterns: Record<ArcadeSoundCue, readonly [number, number, number, OscillatorType][]> = {
    open: [[1, .12, .035, "sine"], [1.5, .18, .025, "triangle"]],
    select: [[1.25, .08, .03, "triangle"]],
    launch: [[1, .11, .04, "sawtooth"], [1.5, .12, .035, "triangle"], [2, .2, .03, "sine"]],
    success: [[1, .1, .035, "triangle"], [1.25, .1, .035, "triangle"], [1.5, .18, .04, "sine"]],
    unlock: [[1, .09, .035, "sine"], [1.33, .1, .035, "sine"], [1.66, .18, .04, "triangle"]],
    error: [[.8, .13, .035, "square"], [.68, .18, .025, "triangle"]],
    reward: [[1.5, .08, .03, "sine"], [2, .1, .035, "sine"], [2.5, .2, .035, "triangle"]],
  };
  patterns[cue].forEach(([ratio, duration, volume, type], index) => tone(root * ratio, duration, volume, type, index * .07));
}

function musicPulse(game: string) {
  if (!arcadeAudioSettings().music || musicGame !== game) return;
  const root = gameFrequency(game) / 2;
  const identity = arcadeV5Identity(game);
  const scale = game === "history-timeline" ? [1, 1.2, 1.5, 1.8] : game === "circuit-logic" ? [1, 1.25, 1.5, 2] : [1, 1.125, 1.5, 1.6875];
  const ratio = scale[musicStep % scale.length];
  musicStep += 1;
  tone(root * ratio, .72, .012, "sine");
  tone(root * ratio * 2, .28, .006, identity.accent === "#facc15" ? "square" : "triangle", .08);
}
export function startArcadeMusic(game: string) {
  stopArcadeMusic();
  if (!arcadeAudioSettings().music || !browser()) return;
  musicGame = game;
  musicStep = 0;
  musicPulse(game);
  musicTimer = window.setInterval(() => musicPulse(game), 920);
}
export function stopArcadeMusic() {
  if (browser() && musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
  musicGame = "";
  musicStep = 0;
}
export function unlockArcadeAudio() { void audioContext()?.resume(); }
