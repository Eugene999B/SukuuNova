"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from "lucide-react";

type RunnerQuestion = { id: string; prompt: string; options: string[] };
type RunnerRound = {
  id: string;
  difficulty: number;
  ageBand: string | null;
  answers: string[];
  questions: RunnerQuestion[];
};

type Props = {
  learnerName: string;
  round: RunnerRound;
  onComplete: (answers: string[]) => void;
  onExit: (answers: string[]) => void;
};

type PhaserGameHandle = { destroy: (removeCanvas?: boolean) => void };
type PhaserNamespace = {
  AUTO: number;
  Scale: { FIT: number; CENTER_BOTH: number };
  Game: new (config: Record<string, unknown>) => PhaserGameHandle;
};
type KeyLike = { isDown: boolean };
type TextLike = {
  setText: (value: string) => TextLike;
  setPosition: (x: number, y: number) => TextLike;
  setVisible: (visible: boolean) => TextLike;
  setOrigin: (x: number, y?: number) => TextLike;
};
type GraphicsLike = {
  clear: () => GraphicsLike;
  fillStyle: (color: number, alpha?: number) => GraphicsLike;
  lineStyle: (width: number, color: number, alpha?: number) => GraphicsLike;
  fillRect: (x: number, y: number, width: number, height: number) => GraphicsLike;
  fillRoundedRect: (x: number, y: number, width: number, height: number, radius?: number) => GraphicsLike;
  strokeRoundedRect: (x: number, y: number, width: number, height: number, radius?: number) => GraphicsLike;
  fillCircle: (x: number, y: number, radius: number) => GraphicsLike;
  strokeCircle: (x: number, y: number, radius: number) => GraphicsLike;
  fillTriangle: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => GraphicsLike;
};
type SceneLike = {
  add: {
    graphics: () => GraphicsLike;
    text: (x: number, y: number, value: string, style?: Record<string, unknown>) => TextLike;
  };
  input: {
    keyboard?: { addKeys: (keys: string) => Record<string, KeyLike> };
    on: (event: string, handler: (pointer: { x: number; y: number }) => void) => void;
  };
};

declare global {
  interface Window {
    Phaser?: PhaserNamespace;
    __sukuuNovaPhaser?: Promise<PhaserNamespace>;
  }
}

const PHASER_URL = "https://cdnjs.cloudflare.com/ajax/libs/phaser/4.2.1/phaser.min.js";

function loadPhaser() {
  if (window.Phaser) return Promise.resolve(window.Phaser);
  if (window.__sukuuNovaPhaser) return window.__sukuuNovaPhaser;
  window.__sukuuNovaPhaser = new Promise<PhaserNamespace>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PHASER_URL}"]`);
    const ready = () => window.Phaser ? resolve(window.Phaser) : reject(new Error("Phaser loaded without a game runtime."));
    if (existing) {
      existing.addEventListener("load", ready, { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load the game engine.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = PHASER_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.dataset.sukuunovaGameEngine = "phaser-4.2.1";
    script.addEventListener("load", ready, { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load the game engine. Check the connection and retry.")), { once: true });
    document.head.appendChild(script);
  });
  return window.__sukuuNovaPhaser;
}

function shortOption(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 24 ? `${trimmed.slice(0, 22)}…` : trimmed;
}

function beep(enabled: boolean, high = false) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = high ? 720 : 420;
    gain.gain.setValueAtTime(0.045, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(); oscillator.stop(ctx.currentTime + 0.13);
    oscillator.addEventListener("ended", () => void ctx.close(), { once: true });
  } catch { /* Audio is optional. */ }
}

export default function NovaRunner({ learnerName, round, onComplete, onExit }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const game = useRef<PhaserGameHandle | null>(null);
  const answers = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const pausedRef = useRef(false);
  const soundRef = useRef(true);
  const reducedMotionRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [engineError, setEngineError] = useState("");
  const [checkpoint, setCheckpoint] = useState(() => {
    const first = round.answers.findIndex((answer) => !answer.trim());
    return first < 0 ? round.questions.length : first;
  });

  completeRef.current = onComplete;
  exitRef.current = onExit;
  pausedRef.current = paused;
  soundRef.current = sound;
  reducedMotionRef.current = reducedMotion;

  const progress = useMemo(() => Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100), [checkpoint, round.questions.length]);

  useEffect(() => {
    let cancelled = false;
    const parent = mount.current;
    if (!parent) return;
    setEngineError("");

    void loadPhaser().then((Phaser) => {
      if (cancelled || !mount.current) return;
      const width = 960;
      const height = 540;
      const laneY = [205, 275, 345, 415];
      const initialQuestion = Math.max(0, round.answers.findIndex((answer) => !answer.trim()));
      const startIndex = initialQuestion < 0 ? round.questions.length : initialQuestion;
      const selectedAnswers = [...round.answers];
      let questionIndex = startIndex;
      let phase: "running" | "gate" | "finish" = startIndex >= round.questions.length ? "finish" : "running";
      let gateX = 1040;
      let worldOffset = 0;
      let lane = 1;
      let targetLane = 1;
      let jumpY = 0;
      let jumpVelocity = 0;
      let energy = 3;
      let coins = 0;
      let distance = startIndex * 180;
      let lastUp = false;
      let lastDown = false;
      let lastSpace = false;
      let flash = 0;
      let obstacleX = [520, 790];
      let coinX = [390, 650, 900];
      let obstacleHit = new Set<number>();
      const optionTexts: TextLike[] = [];
      let gfx: GraphicsLike;
      let promptText: TextLike;
      let statusText: TextLike;
      let missionText: TextLike;
      let controlsText: TextLike;
      let keys: Record<string, KeyLike> = {};

      const moveLane = (delta: number) => {
        if (phase !== "gate") return;
        targetLane = Math.max(0, Math.min(3, targetLane + delta));
        beep(soundRef.current, true);
      };
      const jump = () => {
        if (phase !== "running" || jumpY < -3) return;
        jumpVelocity = -540;
        beep(soundRef.current, true);
      };
      const choose = () => {
        if (phase !== "gate" || questionIndex >= round.questions.length) return;
        const question = round.questions[questionIndex];
        const value = question.options[targetLane];
        if (!value) return;
        selectedAnswers[questionIndex] = value;
        answers.current = [...selectedAnswers];
        setCheckpoint(questionIndex + 1);
        beep(soundRef.current, true);
        flash = 1;
        questionIndex += 1;
        if (questionIndex >= round.questions.length) {
          phase = "finish";
          window.setTimeout(() => completeRef.current([...selectedAnswers]), 650);
          return;
        }
        phase = "running";
        gateX = 1020 + Math.random() * 180;
        obstacleX = [470 + Math.random() * 160, 760 + Math.random() * 160];
        coinX = [330 + Math.random() * 120, 590 + Math.random() * 120, 870 + Math.random() * 100];
        obstacleHit = new Set<number>();
      };

      const config = {
        type: Phaser.AUTO,
        width,
        height,
        parent: mount.current,
        backgroundColor: "#071225",
        transparent: false,
        antialias: true,
        render: { antialias: true, roundPixels: true },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width, height },
        scene: {
          create: function (this: SceneLike) {
            gfx = this.add.graphics();
            promptText = this.add.text(width / 2, 82, "", { fontFamily: "system-ui, sans-serif", fontSize: "26px", fontStyle: "bold", color: "#ffffff", align: "center", wordWrap: { width: 760 } }).setOrigin(0.5, 0.5);
            statusText = this.add.text(28, 26, "", { fontFamily: "system-ui, sans-serif", fontSize: "18px", fontStyle: "bold", color: "#d8f9ff" });
            missionText = this.add.text(width - 28, 26, "", { fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#b6c8ff" }).setOrigin(1, 0);
            controlsText = this.add.text(width / 2, 510, "RUN: SPACE/tap to jump  •  GATE: ↑ ↓ choose lane, SPACE enter", { fontFamily: "system-ui, sans-serif", fontSize: "14px", color: "#9fb1d6" }).setOrigin(0.5, 0.5);
            for (let index = 0; index < 4; index++) optionTexts.push(this.add.text(610, laneY[index], "", { fontFamily: "system-ui, sans-serif", fontSize: "17px", fontStyle: "bold", color: "#ffffff", backgroundColor: "rgba(5,12,35,.68)", padding: { x: 10, y: 7 } }).setOrigin(0.5, 0.5).setVisible(false));
            keys = this.input.keyboard?.addKeys("UP,DOWN,SPACE,W,S") ?? {};
            this.input.on("pointerdown", (pointer) => {
              if (pausedRef.current) return;
              if (phase === "running") { jump(); return; }
              if (phase === "gate") {
                let closest = 0;
                let distanceToLane = Number.POSITIVE_INFINITY;
                laneY.forEach((value, index) => { const diff = Math.abs(pointer.y - value); if (diff < distanceToLane) { closest = index; distanceToLane = diff; } });
                targetLane = closest;
                choose();
              }
            });
          },
          update: function (_time: number, delta: number) {
            if (!gfx) return;
            const dt = Math.min(delta, 40) / 1000;
            const up = Boolean(keys.UP?.isDown || keys.W?.isDown);
            const down = Boolean(keys.DOWN?.isDown || keys.S?.isDown);
            const space = Boolean(keys.SPACE?.isDown);
            if (!pausedRef.current) {
              if (up && !lastUp) moveLane(-1);
              if (down && !lastDown) moveLane(1);
              if (space && !lastSpace) phase === "gate" ? choose() : jump();
            }
            lastUp = up; lastDown = down; lastSpace = space;
            if (pausedRef.current) return;

            const speed = 210 + round.difficulty * 24;
            if (phase === "running") {
              worldOffset += speed * dt;
              distance += speed * dt * 0.05;
              gateX -= speed * dt;
              obstacleX = obstacleX.map((value) => value - speed * dt);
              coinX = coinX.map((value) => value - speed * dt);
              if (jumpY < 0 || jumpVelocity < 0) {
                jumpVelocity += 1320 * dt;
                jumpY += jumpVelocity * dt;
                if (jumpY > 0) { jumpY = 0; jumpVelocity = 0; }
              }
              obstacleX.forEach((x, index) => {
                if (Math.abs(x - 145) < 20 && jumpY > -46 && !obstacleHit.has(index)) {
                  obstacleHit.add(index); energy = Math.max(0, energy - 1); flash = -1; beep(soundRef.current, false);
                }
              });
              coinX = coinX.map((x) => {
                if (Math.abs(x - 145) < 24) { coins += 1; beep(soundRef.current, true); return -1000; }
                return x;
              });
              if (gateX <= 720) { phase = "gate"; targetLane = lane; }
            } else if (phase === "gate") {
              lane += (targetLane - lane) * Math.min(1, dt * 10);
            }
            flash *= Math.pow(0.04, dt);

            gfx.clear();
            gfx.fillStyle(0x071225, 1).fillRect(0, 0, width, height);
            gfx.fillStyle(0x0b2451, 1).fillRect(0, 112, width, 328);
            gfx.fillStyle(0x123d6a, 0.9).fillTriangle(0, 440, 180 - (worldOffset * 0.06) % 240, 210, 360, 440);
            gfx.fillStyle(0x174d73, 0.85).fillTriangle(280, 440, 500 - (worldOffset * 0.04) % 260, 230, 760, 440);
            for (let star = 0; star < 24; star++) {
              const x = (star * 173 - worldOffset * (reducedMotionRef.current ? 0.02 : 0.08)) % (width + 40);
              const safeX = x < 0 ? x + width + 40 : x;
              gfx.fillStyle(star % 3 === 0 ? 0x80f3ff : 0xffffff, 0.7).fillCircle(safeX, 135 + (star * 67) % 230, star % 5 === 0 ? 2.2 : 1.2);
            }
            gfx.fillStyle(0x09172c, 1).fillRect(0, 440, width, 100);
            for (let stripe = 0; stripe < 11; stripe++) {
              const x = ((stripe * 105 - worldOffset) % 1150 + 1150) % 1150 - 80;
              gfx.fillStyle(0x1b3553, 0.75).fillRoundedRect(x, 463, 62, 7, 4);
            }

            const playerY = laneY[Math.max(0, Math.min(3, Math.round(lane)))] + jumpY;
            const bob = reducedMotionRef.current ? 0 : Math.sin(worldOffset * 0.045) * 3;
            gfx.fillStyle(flash < -0.08 ? 0xff5470 : 0x6cf2ff, 0.28).fillCircle(145, playerY + bob, 43);
            gfx.fillStyle(0x132f59, 1).fillRoundedRect(122, playerY - 24 + bob, 46, 54, 12);
            gfx.fillStyle(0x7af6ff, 1).fillRoundedRect(126, playerY - 20 + bob, 38, 20, 8);
            gfx.fillStyle(0x071225, 1).fillRoundedRect(132, playerY - 14 + bob, 9, 7, 4).fillRoundedRect(150, playerY - 14 + bob, 9, 7, 4);
            gfx.fillStyle(0xfdd66b, 1).fillCircle(145, playerY + 13 + bob, 5);
            gfx.lineStyle(7, 0x7af6ff, 1).strokeCircle(131, playerY + 34 + bob, 7).strokeCircle(159, playerY + 34 + bob, 7);

            obstacleX.forEach((x, index) => {
              if (x < -60 || x > width + 60) return;
              gfx.fillStyle(obstacleHit.has(index) ? 0x435068 : 0xff5470, 0.9).fillRoundedRect(x - 17, laneY[1] + 18, 34, 55, 7);
              gfx.fillStyle(0xffd45f, 0.9).fillTriangle(x - 15, laneY[1] + 18, x + 15, laneY[1] + 18, x, laneY[1] - 9);
            });
            coinX.forEach((x, index) => {
              if (x < -30 || x > width + 30) return;
              const y = laneY[1] - (index % 2 ? 54 : 15);
              gfx.fillStyle(0xffd45f, 0.22).fillCircle(x, y, 17);
              gfx.lineStyle(4, 0xffd45f, 1).strokeCircle(x, y, 10);
            });

            optionTexts.forEach((text) => text.setVisible(false));
            const question = round.questions[questionIndex];
            if (phase === "gate" && question) {
              promptText.setText(question.prompt).setVisible(true);
              question.options.slice(0, 4).forEach((option, index) => {
                const selected = targetLane === index;
                gfx.fillStyle(selected ? 0x38e6cf : 0x31528c, selected ? 0.3 : 0.16).fillRoundedRect(510, laneY[index] - 28, 365, 56, 14);
                gfx.lineStyle(selected ? 4 : 2, selected ? 0x67ffe7 : 0x5f7fbb, 0.95).strokeRoundedRect(510, laneY[index] - 28, 365, 56, 14);
                optionTexts[index].setText(`${index + 1}. ${shortOption(option)}`).setPosition(692, laneY[index]).setVisible(true);
              });
              controlsText.setText("Choose a portal with ↑ ↓, then SPACE — or tap a portal");
            } else {
              promptText.setText(phase === "finish" ? "MISSION COMPLETE" : "Run to the next Knowledge Gate").setVisible(true);
              controlsText.setText("SPACE / tap to jump  •  Reach the Knowledge Gate");
            }
            statusText.setText(`⚡ ${energy}   ◆ ${coins}   ↗ ${Math.floor(distance)}m`);
            missionText.setText(`KNOWLEDGE GATE ${Math.min(questionIndex + 1, round.questions.length)}/${round.questions.length}  •  LV ${round.difficulty}`);
            if (flash > 0.08) gfx.fillStyle(0x61ffe3, Math.min(0.16, flash * 0.16)).fillRect(0, 0, width, height);
            if (flash < -0.08) gfx.fillStyle(0xff395f, Math.min(0.13, Math.abs(flash) * 0.13)).fillRect(0, 0, width, height);
          },
        },
      };
      game.current = new Phaser.Game(config);
    }).catch((error: unknown) => {
      if (!cancelled) setEngineError(error instanceof Error ? error.message : "Could not start Nova Runner.");
    });

    return () => {
      cancelled = true;
      game.current?.destroy(true);
      game.current = null;
      if (parent) parent.replaceChildren();
    };
  }, [round.id, round.answers, round.difficulty, round.questions]);

  const toggleFullscreen = async () => {
    const element = mount.current?.parentElement;
    if (!element) return;
    if (!document.fullscreenElement) { await element.requestFullscreen?.(); setFullscreen(true); }
    else { await document.exitFullscreen?.(); setFullscreen(false); }
  };

  return <section className="nova-runner-shell" aria-label={`Nova Runner mission for ${learnerName}`}>
    <div className="nova-runner-bar">
      <div><span className="nova-runner-logo" aria-hidden="true">N</span><div><strong>NOVA RUNNER</strong><small>Math World · adaptive mission</small></div></div>
      <div className="nova-runner-tools">
        <button type="button" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>{paused ? <Play size={16}/> : <Pause size={16}/>}<span>{paused ? "Resume" : "Pause"}</span></button>
        <button type="button" onClick={() => setSound((value) => !value)} aria-pressed={!sound}>{sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}<span>Sound</span></button>
        <button type="button" onClick={() => setReducedMotion((value) => !value)} aria-pressed={reducedMotion}><span className="nova-runner-motion">◌</span><span>Motion</span></button>
        <button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}<span>Full screen</span></button>
      </div>
    </div>
    <div className="nova-runner-progress"><i><b style={{ width: `${progress}%` }}/></i><span>{checkpoint}/{round.questions.length} gates</span></div>
    <div className="nova-runner-stage-wrap">
      <div ref={mount} className="nova-runner-stage"/>
      {paused ? <div className="nova-runner-pause"><span>MISSION PAUSED</span><strong>Nova is waiting for you.</strong><button type="button" onClick={() => setPaused(false)}><Play size={18}/>Continue</button></div> : null}
      {engineError ? <div className="nova-runner-engine-error" role="alert"><strong>Game engine unavailable</strong><p>{engineError}</p><button type="button" onClick={() => window.location.reload()}>Retry</button></div> : null}
    </div>
    <div className="nova-runner-footer"><p><strong>Desktop:</strong> Space to jump · ↑ ↓ at Knowledge Gates. <strong>Touch:</strong> tap to jump · tap a portal to answer.</p><button type="button" onClick={() => exitRef.current([...answers.current])}>Save & exit</button></div>
  </section>;
}
