"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Music2, Volume2, VolumeX } from "lucide-react";
import "./learn-shell.css";

type Cue = "tap" | "start" | "correct" | "retry" | "complete";
type AudioState = "idle" | "ready" | "paused" | "blocked" | "unavailable";
type AudioPreferences = {
  effects: boolean;
  music: boolean;
  effectsVolume: number;
  musicVolume: number;
};

const SoundContext = createContext<(cue: Cue) => void>(() => {});
export const useLearningSound = () => useContext(SoundContext);

function clampVolume(value: unknown, fallback: number, max = 70) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(max, value))
    : fallback;
}

export function LearnShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [effects, setEffects] = useState(false);
  const [music, setMusic] = useState(false);
  const [effectsVolume, setEffectsVolume] = useState(35);
  const [musicVolume, setMusicVolume] = useState(24);
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [loaded, setLoaded] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const musicGain = useRef<GainNode | null>(null);
  const lastTap = useRef(0);
  const prefs = useRef<AudioPreferences>({ effects: false, music: false, effectsVolume: 35, musicVolume: 24 });

  const reflectAudioState = useCallback((ctx: AudioContext | null) => {
    if (!ctx) {
      setAudioState("idle");
      return;
    }
    if (ctx.state === "running") setAudioState("ready");
    else if (ctx.state === "suspended") setAudioState("paused");
    else setAudioState("unavailable");
  }, []);

  const ensureAudio = useCallback(async () => {
    try {
      const AudioConstructor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioConstructor) {
        setAudioState("unavailable");
        return null;
      }

      const ctx = audio.current ?? new AudioConstructor();
      if (!audio.current) {
        audio.current = ctx;
        ctx.onstatechange = () => reflectAudioState(ctx);
      }

      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          setAudioState("blocked");
          return null;
        }
      }

      reflectAudioState(ctx);
      if (ctx.state !== "running") {
        setAudioState(ctx.state === "suspended" ? "blocked" : "unavailable");
        return null;
      }
      return ctx;
    } catch {
      setAudioState("unavailable");
      return null;
    }
  }, [reflectAudioState]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("sukuunova-learn-audio-v2") || "{}") as Partial<AudioPreferences> & { volume?: number };
      const legacyVolume = clampVolume(stored.volume, 35);
      const nextEffects = stored.effects === true;
      const nextMusic = stored.music === true;
      const nextEffectsVolume = clampVolume(stored.effectsVolume, legacyVolume);
      const nextMusicVolume = clampVolume(stored.musicVolume, Math.min(24, legacyVolume), 50);
      setEffects(nextEffects);
      setMusic(nextMusic);
      setEffectsVolume(nextEffectsVolume);
      setMusicVolume(nextMusicVolume);
      prefs.current = {
        effects: nextEffects,
        music: nextMusic,
        effectsVolume: nextEffectsVolume,
        musicVolume: nextMusicVolume,
      };
    } catch {
      // Keep safe defaults when stored preferences are malformed.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    prefs.current = { effects, music, effectsVolume, musicVolume };
    if (loaded) {
      try {
        localStorage.setItem("sukuunova-learn-audio-v2", JSON.stringify(prefs.current));
      } catch {
        // Audio preferences are optional; learning still works without storage.
      }
    }
    if (musicGain.current && audio.current) {
      musicGain.current.gain.setTargetAtTime(music ? musicVolume / 100 : 0, audio.current.currentTime, 0.15);
    }
  }, [effects, music, effectsVolume, musicVolume, loaded]);

  const play = useCallback((cue: Cue) => {
    if (!prefs.current.effects || document.hidden) return;
    if (cue === "tap" && Date.now() - lastTap.current < 100) return;
    lastTap.current = Date.now();

    void (async () => {
      const ctx = await ensureAudio();
      if (!ctx) return;
      const notes: Record<Cue, number[]> = {
        tap: [523.25],
        start: [392, 523.25, 659.25],
        correct: [523.25, 659.25, 783.99],
        retry: [392, 349.23],
        complete: [523.25, 659.25, 783.99, 1046.5],
      };

      notes[cue].forEach((hz, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = ctx.currentTime + index * 0.095;
        oscillator.type = "sine";
        oscillator.frequency.value = hz;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0001, (prefs.current.effectsVolume / 100) * 0.11),
          at + 0.015,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, at + (cue === "tap" ? 0.07 : 0.25));
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.3);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      });
    })();
  }, [ensureAudio]);

  const testSound = useCallback(() => {
    void (async () => {
      const ctx = await ensureAudio();
      if (!ctx) return;
      [523.25, 783.99].forEach((hz, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = ctx.currentTime + index * 0.12;
        oscillator.type = "sine";
        oscillator.frequency.value = hz;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(
          Math.max(0.0001, (prefs.current.effectsVolume / 100) * 0.14),
          at + 0.015,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.25);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      });
    })();
  }, [ensureAudio]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest("button:not(:disabled),a,select,summary")) return;
      if (prefs.current.effects || prefs.current.music) void ensureAudio();
      if (!target.closest("[data-audio-control]")) play("tap");
    };
    const onVisibility = () => {
      const ctx = audio.current;
      if (!ctx) return;
      if (document.hidden && ctx.state === "running") {
        void ctx.suspend().finally(() => reflectAudioState(ctx));
      } else if (!document.hidden && ctx.state === "suspended") {
        setAudioState("paused");
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ensureAudio, play, reflectAudioState]);

  useEffect(() => {
    if (!music) return;
    let beat = 0;
    let cancelled = false;

    const schedule = (ctx = audio.current) => {
      if (!ctx || ctx.state !== "running" || document.hidden || cancelled) return;
      if (!musicGain.current) {
        musicGain.current = ctx.createGain();
        musicGain.current.connect(ctx.destination);
      }
      musicGain.current.gain.setTargetAtTime(prefs.current.musicVolume / 100, ctx.currentTime, 0.15);
      const chords = [
        [261.63, 329.63, 392],
        [220, 261.63, 329.63],
        [174.61, 220, 261.63],
        [196, 246.94, 293.66],
      ];
      chords[beat++ % chords.length].forEach((hz, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = ctx.currentTime + index * 0.35;
        oscillator.frequency.value = hz;
        oscillator.type = "sine";
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.025, at + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 5);
        oscillator.connect(gain);
        gain.connect(musicGain.current!);
        oscillator.start(at);
        oscillator.stop(at + 5.1);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      });
    };

    void ensureAudio().then((ctx) => {
      if (ctx) schedule(ctx);
    });
    const timer = window.setInterval(() => schedule(), 5500);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (musicGain.current && audio.current) {
        musicGain.current.gain.setTargetAtTime(0, audio.current.currentTime, 0.1);
      }
    };
  }, [music, ensureAudio]);

  useEffect(() => () => {
    if (audio.current) {
      audio.current.onstatechange = null;
      void audio.current.close().catch(() => {});
    }
    audio.current = null;
  }, []);

  const links = [
    ["Home", "/learn"],
    ["Practice", "/learn/explore"],
    ["Daily challenge", "/learn/today"],
    ["My progress", "/learn/progress"],
  ];

  const statusText =
    audioState === "ready" ? "Sound ready" :
    audioState === "paused" ? "Sound paused" :
    audioState === "blocked" ? "Tap Test sound to enable" :
    audioState === "unavailable" ? "Audio unavailable" :
    "Sound not tested";

  return (
    <SoundContext.Provider value={play}>
      <div className="learn-frame">
        <a className="learn-skip" href="#learning-content">Skip to learning</a>
        <header className="learn-global-header">
          <Link href="/learn" className="learn-wordmark"><span>✦</span><strong>SukuuNova <b>Learn</b></strong></Link>
          <Link className="learn-school-link" href="/">School management ↗</Link>
          <nav aria-label="Learning navigation">
            {links.map(([label, href]) => (
              <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>
            ))}
          </nav>
          <details className="learn-audio" data-audio-control data-audio-state={audioState}>
            <summary aria-label="Learning audio settings">
              {effects || music ? <Volume2 size={17} /> : <VolumeX size={17} />}
              <span>Sound</span>
            </summary>
            <div className="learn-audio-panel">
              <div className="learn-audio-heading">
                <strong>Study sound</strong>
                <span className="learn-audio-status" role="status" aria-live="polite">{statusText}</span>
              </div>
              <button type="button" className="learn-audio-test" onClick={testSound} disabled={audioState === "unavailable"}>
                Test sound
              </button>
              <label><input type="checkbox" checked={effects} onChange={(event) => {
                const enabled = event.target.checked;
                prefs.current.effects = enabled;
                setEffects(enabled);
                if (enabled) {
                  void ensureAudio();
                  play("correct");
                }
              }} /> Interaction sounds</label>
              <label className="learn-audio-range">Effects volume
                <input aria-label="Effects volume" type="range" min="0" max="70" value={effectsVolume} onChange={(event) => setEffectsVolume(Number(event.target.value))} />
              </label>
              <label><input type="checkbox" checked={music} onChange={(event) => {
                const enabled = event.target.checked;
                prefs.current.music = enabled;
                setMusic(enabled);
                if (enabled) void ensureAudio();
              }} /><Music2 size={15} /> Gentle focus music</label>
              <label className="learn-audio-range">Music volume
                <input aria-label="Music volume" type="range" min="0" max="50" value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} />
              </label>
              <small>
                {audioState === "ready"
                  ? "The browser audio engine is running. Device volume and mute settings still control what you hear."
                  : audioState === "unavailable"
                    ? "This browser does not expose a usable Web Audio context. Learning remains fully usable without sound."
                    : "Use Test sound after opening this panel. Browsers may require that tap before audio can start or resume."}
              </small>
            </div>
          </details>
        </header>
        <div id="learning-content">{children}</div>
      </div>
    </SoundContext.Provider>
  );
}
