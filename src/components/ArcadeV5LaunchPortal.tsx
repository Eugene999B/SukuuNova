"use client";

import { useState, type CSSProperties } from "react";
import { Accessibility, ArrowLeft, Check, ChevronRight, Crown, HelpCircle, Infinity as InfinityIcon, LockKeyhole, Medal, Music, Play, Settings2, ShieldCheck, Shuffle, Star, Trophy, Volume2, VolumeX } from "lucide-react";
import ArcadeGameLogo from "./ArcadeGameLogo";
import { arcadeAudioSettings, playArcadeSound, setArcadeAudioSettings, unlockArcadeAudio } from "@/lib/arcade-audio";
import { ARCADE_SESSION_VARIETY_MIN, arcadeV5Identity, type ArcadeV5GameKey } from "@/lib/arcade-v5-design";
import { arcadeExperienceProfile } from "@/lib/arcade-v6-experience";
import "./arcade-v5.css";
import "./arcade-v6-menu.css";

type Progress = { rounds: number; xp: number; stars: number; accuracy: number | null; progressionMode: string; modeLabel: string; selectableNodes: boolean; nodeCount: number; unlockedNode: number | null; clearedThroughNode: number | null; rewardCount: number };
type Leaderboard = { rows: Array<{ rank: number; studentId: string; displayName: string; bestScore: number; totalXp: number; rounds: number }> };
type Props = {
  game: ArcadeV5GameKey;
  progress: Progress;
  selectedNode: number;
  playerId: string;
  leaderboard: Leaderboard | null;
  leaderboardBusy?: boolean;
  onSelectNode: (node: number) => void;
  onLaunch: (node?: number) => void;
  onBack: () => void;
  onRefreshLeaderboard: () => void;
};
type MenuView = "menu" | "play" | "help" | "settings" | "accessibility";

export default function ArcadeV5LaunchPortal({ game, progress, selectedNode, playerId, leaderboard, leaderboardBusy = false, onSelectNode, onLaunch, onBack, onRefreshLeaderboard }: Props) {
  const identity = arcadeV5Identity(game);
  const experience = arcadeExperienceProfile(game);
  const progression = identity.progression;
  const unlocked = progress.unlockedNode ?? 1;
  const rewardCount = progress.rewardCount;
  const [audio, setAudio] = useState(arcadeAudioSettings);
  const [view, setView] = useState<MenuView>("menu");
  const theme = {
    "--v5-accent": identity.accent,
    "--v5-accent-2": identity.accent2,
    "--v5-glow": identity.glow,
    "--v5-canvas": identity.canvas,
    "--v5-surface": identity.surface,
  } as CSSProperties;
  const choose = (node: number) => {
    if (!progression.selectableNodes || node > unlocked) return;
    unlockArcadeAudio();
    playArcadeSound("select", game);
    onSelectNode(node);
  };
  const launch = () => {
    unlockArcadeAudio();
    playArcadeSound("launch", game);
    onLaunch(progression.selectableNodes ? selectedNode : undefined);
  };
  const playFromMenu = () => {
    unlockArcadeAudio();
    playArcadeSound("launch", game);
    if (progression.selectableNodes) setView("play");
    else onLaunch(undefined);
  };
  const updateSettings = (patch: Parameters<typeof setArcadeAudioSettings>[0]) => {
    unlockArcadeAudio();
    const next = setArcadeAudioSettings(patch);
    setAudio(next);
  };
  const selectedName = progression.nodes[selectedNode - 1] ?? progression.modeLabel;

  const returnAction = () => {
    playArcadeSound("select", game);
    if (view === "menu") onBack();
    else setView("menu");
  };

  return <section className="v5-portal v6-portal" style={theme} data-game={game} data-opening={experience.openingStyle} data-view={view} aria-label={`${identity.name} game menu`}>
    <div className="v6-opening-scene" aria-hidden="true"><i/><i/><i/><i/><i/><span/><span/></div>
    <header className="v5-portal-head v6-menu-head">
      <button type="button" className="v5-icon-button" onClick={returnAction}><ArrowLeft size={18}/>{view === "menu" ? "Arcade" : "Main menu"}</button>
      <div className="v5-portal-brand"><ArcadeGameLogo game={game} size="small"/><div><span>{identity.introKicker}</span><strong>{identity.name}</strong></div></div>
      <div className="v5-portal-audio">
        <button type="button" onClick={() => updateSettings({ music: !audio.music })} aria-label={audio.music ? "Turn music off" : "Turn music on"}>{audio.music ? <Music size={17}/> : <VolumeX size={17}/>}<span>Music {audio.music ? "on" : "off"}</span></button>
        <button type="button" onClick={() => updateSettings({ soundEffects: !audio.soundEffects })} aria-label={audio.soundEffects ? "Turn sound effects off" : "Turn sound effects on"}>{audio.soundEffects ? <Volume2 size={17}/> : <VolumeX size={17}/>}<span>SFX {audio.soundEffects ? "on" : "off"}</span></button>
      </div>
    </header>

    {view === "menu" ? <main className="v6-title-screen">
      <div className="v6-title-emblem"><ArcadeGameLogo game={game} size="hero"/><span>{identity.world}</span></div>
      <div className="v6-title-copy"><span>{experience.family.toUpperCase()}</span><h1>{identity.name}</h1><h2>{identity.introTitle}</h2><p>{experience.menuSubtitle}</p><small>{experience.timingLabel}</small></div>
      <nav className="v6-main-menu" aria-label={`${identity.name} main menu`}>
        <button type="button" className="primary" onClick={playFromMenu}><Play size={22} fill="currentColor"/><span><strong>Play game</strong><small>{progression.selectableNodes ? `Continue ${progression.modeLabel.toLowerCase()}` : progression.startLabel}</small></span></button>
        <button type="button" onClick={() => { playArcadeSound("select", game); setView("help"); }}><HelpCircle size={20}/><span><strong>How to play</strong><small>Learn by doing, not by reading a manual</small></span></button>
        <button type="button" onClick={() => { unlockArcadeAudio(); playArcadeSound("select", game); setView("settings"); }}><Settings2 size={20}/><span><strong>Settings</strong><small>Music, sound effects and volume</small></span></button>
        <button type="button" onClick={() => { playArcadeSound("select", game); setView("accessibility"); }}><Accessibility size={20}/><span><strong>Accessibility</strong><small>Motion and contrast controls</small></span></button>
      </nav>
      <div className="v6-title-progress"><div><strong>{progress.rounds}</strong><span>sessions played</span></div><div><strong>{rewardCount}</strong><span>{identity.rewardName}</span></div><div><strong>{progress.accuracy === null ? "—" : `${progress.accuracy}%`}</strong><span>recent accuracy</span></div></div>
    </main> : null}

    {view === "help" ? <main className="v6-menu-panel">
      <div className="v6-menu-panel-title"><HelpCircle size={26}/><div><span>HOW TO PLAY</span><h1>{identity.name}</h1><p>{experience.learningPromise}</p></div></div>
      <div className="v6-help-steps">{experience.help.map((item, index) => <article key={item}><b>{index + 1}</b><p>{item}</p></article>)}</div>
      <section className="v6-controls-card"><span>CONTROLS</span>{experience.controls.map((item) => <p key={item}>{item}</p>)}</section>
      <div className="v6-menu-actions"><button type="button" onClick={() => setView("menu")}>Back</button><button type="button" className="primary" onClick={playFromMenu}><Play size={18}/>Play game</button></div>
    </main> : null}

    {view === "settings" ? <main className="v6-menu-panel">
      <div className="v6-menu-panel-title"><Settings2 size={26}/><div><span>GAME SETTINGS</span><h1>Sound that fits the game</h1><p>Music and effects are separate so learners can keep useful cues without being forced to hear everything.</p></div></div>
      <div className="v6-setting-list">
        <label><span><Music size={18}/><b>Music</b></span><input type="checkbox" checked={audio.music} onChange={(event) => updateSettings({ music:event.target.checked })}/></label>
        <label className="range"><span><b>Music volume</b><small>{Math.round(audio.musicVolume * 100)}%</small></span><input aria-label="Music volume" type="range" min="0" max="100" value={Math.round(audio.musicVolume * 100)} onChange={(event) => updateSettings({ musicVolume:Number(event.target.value) / 100 })}/></label>
        <label><span><Volume2 size={18}/><b>Sound effects</b></span><input type="checkbox" checked={audio.soundEffects} onChange={(event) => updateSettings({ soundEffects:event.target.checked })}/></label>
        <label className="range"><span><b>Effects volume</b><small>{Math.round(audio.soundEffectsVolume * 100)}%</small></span><input aria-label="Sound effects volume" type="range" min="0" max="100" value={Math.round(audio.soundEffectsVolume * 100)} onChange={(event) => updateSettings({ soundEffectsVolume:Number(event.target.value) / 100 })}/></label>
      </div>
      <div className="v6-menu-actions"><button type="button" onClick={() => setView("menu")}>Done</button><button type="button" onClick={() => playArcadeSound("success", game)}>Test sound</button></div>
    </main> : null}

    {view === "accessibility" ? <main className="v6-menu-panel">
      <div className="v6-menu-panel-title"><Accessibility size={26}/><div><span>ACCESSIBILITY</span><h1>Make the game comfortable</h1><p>These settings stay available across the Learning Arcade.</p></div></div>
      <div className="v6-setting-list">
        <label><span><b>Reduced motion</b><small>Calmer menus and fewer decorative animations</small></span><input type="checkbox" checked={audio.reducedMotion} onChange={(event) => updateSettings({ reducedMotion:event.target.checked })}/></label>
        <label><span><b>Higher contrast</b><small>Strengthen borders and text separation</small></span><input type="checkbox" checked={audio.highContrast} onChange={(event) => updateSettings({ highContrast:event.target.checked })}/></label>
      </div>
      <section className="v6-controls-card"><span>PACE</span><p>{experience.timingLabel}</p><small>Hard countdowns are reserved for skills where speed is genuinely part of mastery, such as typing.</small></section>
      <div className="v6-menu-actions"><button type="button" onClick={() => setView("menu")}>Done</button></div>
    </main> : null}

    {view === "play" ? <>
      <div className="v5-portal-hero v6-play-hero">
        <div className="v5-world-emblem"><ArcadeGameLogo game={game} size="hero"/><span>{identity.world}</span></div>
        <div className="v5-portal-copy"><span className="v5-kicker">{progression.modeLabel}</span><h1>{identity.introTitle}</h1><p>{identity.introCopy}</p><div className="v5-game-stats">
          <div>{progression.selectableNodes ? <><strong>{unlocked}/{progression.nodes.length}</strong><span>{progression.unitPlural} unlocked</span></> : <><strong>{progress.rounds}</strong><span>{progression.unitPlural} completed</span></>}</div>
          <div><strong>{rewardCount}</strong><span>{identity.rewardSymbol} {identity.rewardName}</span></div>
          <div><strong>{progress.stars}</strong><span>Game stars</span></div>
          <div><strong>{progress.accuracy === null ? "—" : `${progress.accuracy}%`}</strong><span>Game accuracy</span></div>
        </div></div>
      </div>

      <div className="v5-portal-layout">
        <main className="v5-map-panel">
          <div className="v5-panel-title"><div><span>{progression.modeLabel}</span><h2>{progression.portalTitle}</h2></div>{progression.selectableNodes ? <div className="v5-map-legend"><span><i className="done"/>Cleared</span><span><i className="current"/>Available</span><span><i/>Locked</span></div> : <InfinityIcon size={24}/>}</div>
          <p>{progression.portalCopy}</p>
          {progression.selectableNodes ? <div className="v5-level-path">
            {progression.nodes.map((name, index) => {
              const node = index + 1;
              const locked = node > unlocked;
              const cleared = node <= (progress.clearedThroughNode ?? 0);
              const active = selectedNode === node && !locked;
              return <button type="button" key={name} className={`${locked ? "locked" : "available"} ${cleared ? "cleared" : ""} ${active ? "selected" : ""}`} onClick={() => choose(node)} disabled={locked} aria-label={`${progression.unitLabel} ${node}: ${name}${locked ? ", locked" : ""}`}>
                <span className="v5-node-number">{locked ? <LockKeyhole size={16}/> : cleared ? <Check size={17}/> : node}</span>
                <span className="v5-node-copy"><small>{progression.unitLabel.toUpperCase()} {node}</small><strong>{name}</strong><em>{locked ? `Clear the previous ${progression.unitLabel} to unlock` : cleared ? "Cleared · replay remixes the mission" : node === unlocked && node > 1 ? `Newest unlocked ${progression.unitLabel}` : "Ready for a new variation"}</em></span>
                {!locked ? <ChevronRight size={17}/> : null}
              </button>;
            })}
          </div> : <div className="v5-launch-card"><Shuffle size={24}/><span>DYNAMIC SESSION ENGINE</span><strong>{ARCADE_SESSION_VARIETY_MIN.toLocaleString()}+</strong><h3>Session-DNA combinations</h3><p>Before content permutations, the server can remix world state, mission frame, pressure, objective, encounter pattern and bonus condition.</p><div className="nova-game-tags">{progression.remixDimensions.map((item)=><span key={item}>{item}</span>)}</div></div>}
        </main>

        <aside className="v5-side-stack">
          <section className="v5-launch-card">
            <span>{progression.selectableNodes ? `SELECTED ${progression.unitLabel.toUpperCase()}` : "NEXT SESSION"}</span>
            <strong>{progression.selectableNodes ? `${progression.unitLabel[0].toUpperCase()}${progression.unitLabel.slice(1)} ${selectedNode}` : progression.modeLabel}</strong>
            <h3>{progression.selectableNodes ? selectedName : "Fresh procedural variation"}</h3>
            <p>{experience.timingLabel}. {progression.selectableNodes ? "Progression chooses the challenge family; the actual mission is regenerated around current mastery." : "A fresh server-generated session is created from current mastery and recent play."}</p>
            <button type="button" className="v5-launch-button" onClick={launch}><Play size={19} fill="currentColor"/>{progression.startLabel}</button>
            <small><ShieldCheck size={13}/> Progression, session generation and grading are checked on the server.</small>
          </section>

          <section className="v5-ranking-card">
            <div className="v5-panel-title"><div><span>{identity.name.toUpperCase()}</span><h3>Game ranking</h3></div><Trophy size={20}/></div>
            <p>Only this game counts here. Other Arcade games cannot change this ranking.</p>
            <button type="button" className="v5-ranking-refresh" onClick={onRefreshLeaderboard} disabled={leaderboardBusy}><Medal size={15}/>{leaderboardBusy ? "Loading…" : leaderboard ? "Refresh ranking" : "Show ranking"}</button>
            {leaderboard ? <div className="v5-ranking-list">{leaderboard.rows.slice(0, 6).map((row) => <div key={row.studentId} className={row.studentId === playerId ? "current" : ""}><b>#{row.rank}</b><strong>{row.displayName}</strong><span>{row.bestScore} best</span>{row.rank === 1 ? <Crown size={14}/> : null}</div>)}</div> : null}
          </section>

          <section className="v5-reward-card"><Star size={22}/><div><span>GAME REWARD</span><strong>{rewardCount} {identity.rewardName}</strong><p>Earned from {identity.name} only: {progress.xp} XP and {progress.stars} stars in this world.</p></div></section>
        </aside>
      </div>
    </> : null}
  </section>;
}
