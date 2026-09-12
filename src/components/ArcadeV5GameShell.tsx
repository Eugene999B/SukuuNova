"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Expand, Minimize2, Music, Volume2, VolumeX } from "lucide-react";
import { arcadeAudioSettings, playArcadeSound, setArcadeAudioSettings, startArcadeMusic, stopArcadeMusic } from "@/lib/arcade-audio";
import { arcadeV5Identity, type ArcadeV5GameKey } from "@/lib/arcade-v5-design";
import ArcadeGameLogo from "./ArcadeGameLogo";
import "./arcade-v5.css";

type Props = { game: ArcadeV5GameKey; sessionLabel: string; sessionDetail?: string; children: ReactNode };

export default function ArcadeV5GameShell({ game, sessionLabel, sessionDetail, children }: Props) {
  const identity = arcadeV5Identity(game);
  const shellRef = useRef<HTMLElement | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [audio, setAudio] = useState(arcadeAudioSettings);
  const theme = {
    "--v5-accent": identity.accent,
    "--v5-accent-2": identity.accent2,
    "--v5-glow": identity.glow,
    "--v5-canvas": identity.canvas,
    "--v5-surface": identity.surface,
  } as CSSProperties;

  useEffect(() => {
    if (audio.music) startArcadeMusic(game);
    return () => stopArcadeMusic();
  }, [audio.music, game]);
  useEffect(() => {
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    playArcadeSound("select", game);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFocusMode(false);
      } else if (shellRef.current?.requestFullscreen) {
        await shellRef.current.requestFullscreen();
      } else {
        setFocusMode((value) => !value);
      }
    } catch {
      setFocusMode((value) => !value);
    }
  };
  const toggleMusic = () => {
    const next = setArcadeAudioSettings({ music: !audio.music });
    setAudio(next ?? { ...audio, music: !audio.music });
    if (!audio.music) startArcadeMusic(game);
  };
  const toggleSfx = () => {
    const next = setArcadeAudioSettings({ soundEffects: !audio.soundEffects });
    setAudio(next ?? { ...audio, soundEffects: !audio.soundEffects });
    if (!audio.soundEffects) playArcadeSound("select", game);
  };

  return <section ref={shellRef} className={`v5-game-shell ${focusMode ? "focus-mode" : ""}`} style={theme} data-game={game}>
    <header className="v5-game-chrome">
      <div className="v5-game-chrome-brand"><ArcadeGameLogo game={game} size="small"/><div><span>{identity.name}</span><strong>{sessionLabel}</strong>{sessionDetail ? <small>{sessionDetail}</small> : null}</div></div>
      <div className="v5-game-chrome-tools">
        <button type="button" onClick={toggleMusic} aria-pressed={audio.music}>{audio.music ? <Music size={16}/> : <VolumeX size={16}/>}<span>Music</span><b>{audio.music ? "On" : "Off"}</b></button>
        <button type="button" onClick={toggleSfx} aria-pressed={audio.soundEffects}>{audio.soundEffects ? <Volume2 size={16}/> : <VolumeX size={16}/>}<span>SFX</span><b>{audio.soundEffects ? "On" : "Off"}</b></button>
        <button type="button" onClick={() => void toggleFullscreen()}>{isFullscreen || focusMode ? <Minimize2 size={16}/> : <Expand size={16}/>}<span>{isFullscreen || focusMode ? "Exit full screen" : "Full screen"}</span></button>
      </div>
    </header>
    <div className="v5-game-canvas">{children}</div>
  </section>;
}
