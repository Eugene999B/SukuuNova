"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, Check, Crown, Expand, Flame, Gauge, Medal, Settings2, Sparkles, Star, Trophy, Volume2, VolumeX, Zap } from "lucide-react";
import "./arcade-progression-universe.css";

type Mission = { key: string; title: string; description: string; current: number; target: number; unit: string; complete: boolean };
type Achievement = { key: string; symbol: string; title: string; description: string; current: number; target: number; unlocked: boolean };
type Progression = {
  profile: {
    totalXp: number;
    totalRounds: number;
    totalStars: number;
    accuracy: number | null;
    novaCoins: number;
    streak: number;
    level: number;
    xpIntoLevel: number;
    xpForNextLevel: number;
    xpRemaining: number;
  };
  dailyMissions: Mission[];
  weeklyChallenges: Mission[];
  achievements: Achievement[];
  unlockedAchievements: number;
  champions: Array<{ rank: number; studentId: string; displayName: string; totalXp: number; totalStars: number; rounds: number; isCurrent: boolean }>;
};

type PlayerSettings = {
  emblem: "nova" | "bolt" | "crown";
  reducedMotion: boolean;
  performanceMode: boolean;
  music: boolean;
  soundEffects: boolean;
};

const STORAGE_KEY = "sukuunova.arcade.settings.v1";
const DEFAULT_SETTINGS: PlayerSettings = { emblem: "nova", reducedMotion: false, performanceMode: false, music: true, soundEffects: true };

function readSettings(): PlayerSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<PlayerSettings> | null;
    if (!parsed) return DEFAULT_SETTINGS;
    return {
      emblem: parsed.emblem === "bolt" || parsed.emblem === "crown" ? parsed.emblem : "nova",
      reducedMotion: Boolean(parsed.reducedMotion),
      performanceMode: Boolean(parsed.performanceMode),
      music: parsed.music !== false,
      soundEffects: parsed.soundEffects !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function applySettings(settings: PlayerSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.arcadeMotion = settings.reducedMotion ? "reduced" : "full";
  root.dataset.arcadePerformance = settings.performanceMode ? "low" : "high";
  root.dataset.arcadeMusic = settings.music ? "on" : "off";
  root.dataset.arcadeSfx = settings.soundEffects ? "on" : "off";
}

function progressWidth(current: number, target: number) {
  return `${Math.min(100, Math.round((current / Math.max(1, target)) * 100))}%`;
}

function Emblem({ value }: { value: PlayerSettings["emblem"] }) {
  if (value === "bolt") return <Zap size={25}/>;
  if (value === "crown") return <Crown size={25}/>;
  return <Sparkles size={25}/>;
}

export default function ArcadeProgressionHub({ studentId, playerName }: { studentId: string; playerName: string }) {
  const [data, setData] = useState<Progression | null>(null);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const next = readSettings();
    setSettings(next);
    applySettings(next);
  }, []);

  useEffect(() => {
    let active = true;
    setError("");
    void fetch(`/api/guardian/arcade/progression?studentId=${encodeURIComponent(studentId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Could not load player progression.");
        return payload as Progression;
      })
      .then((payload) => { if (active) setData(payload); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load player progression."); });
    return () => { active = false; };
  }, [studentId]);

  const updateSettings = (patch: Partial<PlayerSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    applySettings(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* device storage can be unavailable */ }
  };

  const initials = useMemo(() => playerName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "N", [playerName]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError("Fullscreen is not available on this device.");
    }
  };

  if (!data) return <section className="arcade-universe-shell" aria-label="Arcade progression">
    <div className="arcade-universe-loading"><Sparkles size={22}/><span>{error || "Loading player universe…"}</span></div>
  </section>;

  return <section className="arcade-universe-shell" aria-label={`${playerName} Arcade progression`}>
    <div className="arcade-universe-head">
      <div className="arcade-player-orb"><div className="arcade-player-emblem"><Emblem value={settings.emblem}/></div><strong>{initials}</strong></div>
      <div className="arcade-universe-title"><span>PLAYER UNIVERSE</span><h2>Level {data.profile.level} · {playerName}</h2><p>{data.profile.xpRemaining} XP until the next universe level.</p><div className="arcade-level-track"><i style={{ width: progressWidth(data.profile.xpIntoLevel, data.profile.xpForNextLevel) }}/></div></div>
      <button type="button" className="arcade-settings-button" onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen}><Settings2 size={17}/>Settings</button>
    </div>

    <div className="arcade-profile-stats">
      <div><Zap size={16}/><strong>{data.profile.totalXp}</strong><span>Total XP</span></div>
      <div><Star size={16}/><strong>{data.profile.totalStars}</strong><span>Stars</span></div>
      <div><Sparkles size={16}/><strong>{data.profile.novaCoins}</strong><span>Nova coins</span></div>
      <div><Flame size={16}/><strong>{data.profile.streak}</strong><span>Day streak</span></div>
      <div><Gauge size={16}/><strong>{data.profile.accuracy ?? "—"}{data.profile.accuracy === null ? "" : "%"}</strong><span>Accuracy</span></div>
      <div><Award size={16}/><strong>{data.unlockedAchievements}/{data.achievements.length}</strong><span>Achievements</span></div>
    </div>

    {settingsOpen ? <div className="arcade-settings-panel">
      <div className="arcade-settings-copy"><strong>Player settings</strong><span>These preferences stay on this device. Audio switches apply whenever a game provides music or sound effects.</span></div>
      <div className="arcade-emblems" aria-label="Player emblem">
        {(["nova", "bolt", "crown"] as const).map((emblem) => <button type="button" key={emblem} className={settings.emblem === emblem ? "active" : ""} onClick={() => updateSettings({ emblem })}><Emblem value={emblem}/><span>{emblem}</span></button>)}
      </div>
      <div className="arcade-setting-grid">
        <button type="button" aria-pressed={settings.reducedMotion} onClick={() => updateSettings({ reducedMotion: !settings.reducedMotion })}><Gauge size={16}/><span>Reduced motion</span><b>{settings.reducedMotion ? "On" : "Off"}</b></button>
        <button type="button" aria-pressed={settings.performanceMode} onClick={() => updateSettings({ performanceMode: !settings.performanceMode })}><Zap size={16}/><span>Performance mode</span><b>{settings.performanceMode ? "On" : "Off"}</b></button>
        <button type="button" aria-pressed={settings.music} onClick={() => updateSettings({ music: !settings.music })}>{settings.music ? <Volume2 size={16}/> : <VolumeX size={16}/>}<span>Music when available</span><b>{settings.music ? "On" : "Off"}</b></button>
        <button type="button" aria-pressed={settings.soundEffects} onClick={() => updateSettings({ soundEffects: !settings.soundEffects })}>{settings.soundEffects ? <Volume2 size={16}/> : <VolumeX size={16}/>}<span>Sound effects</span><b>{settings.soundEffects ? "On" : "Off"}</b></button>
        <button type="button" onClick={() => void toggleFullscreen()}><Expand size={16}/><span>Fullscreen</span><b>Open</b></button>
      </div>
    </div> : null}

    <div className="arcade-universe-grid">
      <div className="arcade-mission-board">
        <div className="arcade-section-title"><div><span>DAILY MISSIONS</span><h3>Today’s launch plan</h3></div><Zap size={20}/></div>
        <div className="arcade-mission-list">{data.dailyMissions.map((item) => <div className={`arcade-mission ${item.complete ? "complete" : ""}`} key={item.key}><div className="arcade-mission-check">{item.complete ? <Check size={15}/> : <span/>}</div><div><strong>{item.title}</strong><p>{item.description}</p><div className="arcade-mission-track"><i style={{ width: progressWidth(item.current, item.target) }}/></div><small>{Math.min(item.current, item.target)}/{item.target} {item.unit}</small></div></div>)}</div>
      </div>
      <div className="arcade-mission-board weekly">
        <div className="arcade-section-title"><div><span>WEEKLY CHALLENGES</span><h3>Build momentum</h3></div><Trophy size={20}/></div>
        <div className="arcade-mission-list">{data.weeklyChallenges.map((item) => <div className={`arcade-mission ${item.complete ? "complete" : ""}`} key={item.key}><div className="arcade-mission-check">{item.complete ? <Check size={15}/> : <span/>}</div><div><strong>{item.title}</strong><p>{item.description}</p><div className="arcade-mission-track"><i style={{ width: progressWidth(item.current, item.target) }}/></div><small>{Math.min(item.current, item.target)}/{item.target} {item.unit}</small></div></div>)}</div>
      </div>
    </div>

    <div className="arcade-achievement-panel">
      <div className="arcade-section-title"><div><span>ACHIEVEMENTS</span><h3>Trophy cabinet</h3></div><Medal size={20}/></div>
      <div className="arcade-achievement-grid">{data.achievements.map((item) => <article className={item.unlocked ? "unlocked" : "locked"} key={item.key}><div className="arcade-achievement-symbol">{item.unlocked ? item.symbol : "◇"}</div><div><strong>{item.title}</strong><p>{item.description}</p><small>{item.unlocked ? "Unlocked" : `${Math.min(item.current, item.target)}/${item.target}`}</small></div></article>)}</div>
    </div>

    <div className="arcade-champions-panel">
      <div className="arcade-section-title"><div><span>ARCADE CHAMPIONS</span><h3>School-standard XP ranking</h3></div><Crown size={20}/></div>
      <p className="arcade-champions-note">Only learners in the same school and school standard appear here. Names remain privacy-shortened.</p>
      <div className="arcade-champions-list">{data.champions.length ? data.champions.map((row) => <div className={row.isCurrent ? "current" : ""} key={row.studentId}><b>#{row.rank}</b><strong>{row.displayName}</strong><span>{row.totalXp} XP</span><span>{row.totalStars} stars · {row.rounds} missions</span>{row.rank === 1 ? <Crown size={15}/> : null}</div>) : <div className="arcade-universe-empty">Complete a mission to enter the champions table.</div>}</div>
    </div>
  </section>;
}
