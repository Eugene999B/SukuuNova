"use client";

import { useState, type CSSProperties } from "react";
import { ArrowLeft, Check, ChevronRight, Crown, Infinity as InfinityIcon, LockKeyhole, Medal, Music, Play, ShieldCheck, Shuffle, Star, Trophy, Volume2, VolumeX } from "lucide-react";
import ArcadeGameLogo from "./ArcadeGameLogo";
import { arcadeAudioSettings, playArcadeSound, setArcadeAudioSettings } from "@/lib/arcade-audio";
import { ARCADE_SESSION_VARIETY_MIN, arcadeV5Identity, type ArcadeV5GameKey } from "@/lib/arcade-v5-design";
import "./arcade-v5.css";

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

export default function ArcadeV5LaunchPortal({ game, progress, selectedNode, playerId, leaderboard, leaderboardBusy = false, onSelectNode, onLaunch, onBack, onRefreshLeaderboard }: Props) {
  const identity = arcadeV5Identity(game);
  const progression = identity.progression;
  const unlocked = progress.unlockedNode ?? 1;
  const rewardCount = progress.rewardCount;
  const [audio, setAudio] = useState(arcadeAudioSettings);
  const theme = {
    "--v5-accent": identity.accent,
    "--v5-accent-2": identity.accent2,
    "--v5-glow": identity.glow,
    "--v5-canvas": identity.canvas,
    "--v5-surface": identity.surface,
  } as CSSProperties;
  const choose = (node: number) => {
    if (!progression.selectableNodes || node > unlocked) return;
    playArcadeSound("select", game);
    onSelectNode(node);
  };
  const launch = () => {
    playArcadeSound("launch", game);
    onLaunch(progression.selectableNodes ? selectedNode : undefined);
  };
  const toggleMusic = () => {
    const next = setArcadeAudioSettings({ music: !audio.music });
    setAudio(next ?? { ...audio, music: !audio.music });
    playArcadeSound("select", game);
  };
  const toggleSfx = () => {
    const next = setArcadeAudioSettings({ soundEffects: !audio.soundEffects });
    setAudio(next ?? { ...audio, soundEffects: !audio.soundEffects });
    if (!audio.soundEffects) window.setTimeout(() => playArcadeSound("select", game), 0);
  };
  const selectedName = progression.nodes[selectedNode - 1] ?? progression.modeLabel;

  return <section className="v5-portal" style={theme} aria-label={`${identity.name} ${progression.modeLabel.toLowerCase()} hub`}>
    <div className="v5-portal-sky" aria-hidden="true"><i/><i/><i/><i/><i/></div>
    <header className="v5-portal-head">
      <button type="button" className="v5-icon-button" onClick={onBack}><ArrowLeft size={18}/>Arcade</button>
      <div className="v5-portal-brand"><ArcadeGameLogo game={game} size="small"/><div><span>{identity.introKicker}</span><strong>{identity.name}</strong></div></div>
      <div className="v5-portal-audio">
        <button type="button" onClick={toggleMusic} aria-label={audio.music ? "Turn music off" : "Turn music on"}>{audio.music ? <Music size={17}/> : <VolumeX size={17}/>}<span>Music {audio.music ? "on" : "off"}</span></button>
        <button type="button" onClick={toggleSfx} aria-label={audio.soundEffects ? "Turn sound effects off" : "Turn sound effects on"}>{audio.soundEffects ? <Volume2 size={17}/> : <VolumeX size={17}/>}<span>SFX {audio.soundEffects ? "on" : "off"}</span></button>
      </div>
    </header>

    <div className="v5-portal-hero">
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
        </div> : <div className="v5-launch-card"><Shuffle size={24}/><span>DYNAMIC SESSION ENGINE</span><strong>{ARCADE_SESSION_VARIETY_MIN.toLocaleString()}+</strong><h3>Session-DNA combinations</h3><p>Before question/content permutations, the server can remix world state, mission frame, pressure, objective, encounter pattern and bonus condition. Recent learning history then changes the content again.</p><div className="nova-game-tags">{progression.remixDimensions.map((item)=><span key={item}>{item}</span>)}</div></div>}
      </main>

      <aside className="v5-side-stack">
        <section className="v5-launch-card">
          <span>{progression.selectableNodes ? `SELECTED ${progression.unitLabel.toUpperCase()}` : "NEXT SESSION"}</span>
          <strong>{progression.selectableNodes ? `${progression.unitLabel[0].toUpperCase()}${progression.unitLabel.slice(1)} ${selectedNode}` : progression.modeLabel}</strong>
          <h3>{progression.selectableNodes ? selectedName : "Fresh procedural variation"}</h3>
          <p>{progression.selectableNodes ? "Progression chooses the challenge family; the actual mission is regenerated and the Adaptive Director still controls age, support and mastery." : "A new server-generated session is created from current mastery and recent play. There is no fixed Level 1 script."}</p>
          <button type="button" className="v5-launch-button" onClick={launch}><Play size={19} fill="currentColor"/>{progression.startLabel}</button>
          <small><ShieldCheck size={13}/> Progression locks, session generation and grading are checked on the server.</small>
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
  </section>;
}
