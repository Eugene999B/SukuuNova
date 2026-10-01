"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { advanceFixedStep, createFixedStepState } from "@/lib/game-engine/fixed-step";
import {
  applyNovaRunAction,
  createNovaRunSession,
  stepNovaRun,
  type NovaRunEvent,
  type NovaRunSession,
} from "@/lib/game-engine/nova-run-session";
import type { RunnerAction } from "@/lib/game-engine/runner-simulation";
import styles from "./game-movement-lab.module.css";

type RunPreset = "guided" | "balanced" | "challenge";

type Palette = {
  canvas: string;
  surface: string;
  raised: string;
  line: string;
  lineStrong: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  danger: string;
  warning: string;
};

const PRESETS: Record<RunPreset, { label: string; hazardDensity: number; worldSpeedScale: number }> = {
  guided: { label: "Guided", hazardDensity: 0.45, worldSpeedScale: 0.84 },
  balanced: { label: "Balanced", hazardDensity: 0.82, worldSpeedScale: 1 },
  challenge: { label: "Challenge", hazardDensity: 1.12, worldSpeedScale: 1.08 },
};

function readPalette(): Palette {
  const computed = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => computed.getPropertyValue(name).trim() || fallback;
  return {
    canvas: token("--arcade-canvas", "black"),
    surface: token("--arcade-surface", "black"),
    raised: token("--arcade-surface-raised", "gray"),
    line: token("--arcade-line", "gray"),
    lineStrong: token("--arcade-line-strong", "gray"),
    text: token("--arcade-text", "white"),
    muted: token("--arcade-muted", "gray"),
    accent: token("--arcade-accent", "cyan"),
    accent2: token("--arcade-accent-2", "blue"),
    danger: token("--arcade-danger", "red"),
    warning: token("--arcade-warning", "yellow"),
  };
}

function prepareCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width, height };
}

function roadHalfWidth(width: number, depth: number) {
  return width * (0.14 + 0.25 * depth);
}

function laneX(width: number, lane: number, depth: number) {
  const half = roadHalfWidth(width, depth);
  const left = width / 2 - half;
  return left + half * 2 * ((lane + 0.5) / 3);
}

function worldToDepth(ahead: number, viewDistance: number) {
  return 1 - Math.max(0, Math.min(1, ahead / viewDistance));
}

function drawNovaRun(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  session: NovaRunSession,
  palette: Palette,
  lastEvent: NovaRunEvent | null,
) {
  context.fillStyle = palette.canvas;
  context.fillRect(0, 0, width, height);

  const horizon = height * 0.15;
  const roadBottom = height * 0.96;
  const topHalf = roadHalfWidth(width, 0);
  const bottomHalf = roadHalfWidth(width, 1);

  context.fillStyle = palette.surface;
  context.beginPath();
  context.moveTo(width / 2 - topHalf, horizon);
  context.lineTo(width / 2 + topHalf, horizon);
  context.lineTo(width / 2 + bottomHalf, roadBottom);
  context.lineTo(width / 2 - bottomHalf, roadBottom);
  context.closePath();
  context.fill();

  context.strokeStyle = palette.lineStrong;
  context.lineWidth = 2;
  for (let separator = 1; separator < 3; separator += 1) {
    const ratio = separator / 3;
    context.beginPath();
    context.moveTo(width / 2 - topHalf + topHalf * 2 * ratio, horizon);
    context.lineTo(width / 2 - bottomHalf + bottomHalf * 2 * ratio, roadBottom);
    context.stroke();
  }

  const viewDistance = 62;
  const startIndex = Math.max(0, session.nextRowIndex - 1);
  for (let index = startIndex; index < session.timeline.length; index += 1) {
    const row = session.timeline[index];
    const ahead = row.absoluteDistance - session.movement.distance;
    if (ahead < -1.2) continue;
    if (ahead > viewDistance) break;

    const depth = worldToDepth(ahead, viewDistance);
    const perspective = depth * depth;
    const y = horizon + (roadBottom - horizon) * perspective;
    const obstacleSize = 8 + 38 * perspective;

    for (const lane of row.blockedLanes) {
      const x = laneX(width, lane, perspective);
      context.fillStyle = palette.danger;
      context.fillRect(x - obstacleSize / 2, y - obstacleSize, obstacleSize, obstacleSize);
    }

    if (row.actionCue !== "none") {
      const half = roadHalfWidth(width, perspective);
      context.strokeStyle = row.actionCue === "jump" ? palette.warning : palette.accent2;
      context.lineWidth = Math.max(2, 3 * perspective);
      context.beginPath();
      context.moveTo(width / 2 - half, y);
      context.lineTo(width / 2 + half, y);
      context.stroke();
      context.fillStyle = row.actionCue === "jump" ? palette.warning : palette.accent2;
      context.font = `${Math.max(9, 13 * perspective)}px system-ui`;
      context.fillText(row.actionCue.toUpperCase(), width / 2 - 18, y - 7);
    }

    if (row.pickupLane !== undefined) {
      const x = laneX(width, row.pickupLane, perspective);
      const radius = 3 + 9 * perspective;
      context.fillStyle = palette.accent;
      context.beginPath();
      context.arc(x, y - obstacleSize * 0.6, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  const playerDepth = 0.87;
  const playerX = laneX(width, session.movement.renderedLane, playerDepth);
  const playerBaseY = horizon + (roadBottom - horizon) * playerDepth - session.movement.height * 34;
  const sliding = session.movement.slideRemainingMs > 0;
  const bodyWidth = sliding ? 48 : 30;
  const bodyHeight = sliding ? 24 : 48;
  context.fillStyle = palette.accent;
  context.fillRect(playerX - bodyWidth / 2, playerBaseY - bodyHeight, bodyWidth, bodyHeight);

  context.fillStyle = palette.text;
  context.font = "800 18px system-ui";
  context.fillText(`Score ${session.score.toLocaleString()}`, 18, 30);
  context.fillStyle = palette.muted;
  context.font = "700 13px system-ui";
  context.fillText(`Combo x${session.combo}  ·  Hits ${session.hits}  ·  Pickups ${session.pickups}`, 18, 52);

  if (lastEvent?.type === "collision") {
    context.fillStyle = palette.danger;
    context.font = "800 16px system-ui";
    context.fillText(`RECOVER — ${lastEvent.reason.replace("-", " ")}`, 18, 78);
  } else if (lastEvent?.type === "row-cleared") {
    context.fillStyle = palette.accent;
    context.font = "800 16px system-ui";
    context.fillText(`CLEAN +${lastEvent.scoreDelta}`, 18, 78);
  }

  if (session.finished) {
    context.fillStyle = palette.raised;
    context.fillRect(width * 0.22, height * 0.35, width * 0.56, height * 0.22);
    context.strokeStyle = palette.accent;
    context.lineWidth = 2;
    context.strokeRect(width * 0.22, height * 0.35, width * 0.56, height * 0.22);
    context.fillStyle = palette.text;
    context.textAlign = "center";
    context.font = "900 26px system-ui";
    context.fillText("RUN COMPLETE", width / 2, height * 0.44);
    context.font = "700 16px system-ui";
    context.fillText(`Score ${session.score.toLocaleString()} · Best combo ${session.bestCombo}`, width / 2, height * 0.5);
    context.textAlign = "start";
  }
}

export function NovaRunPrototype() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const presetRef = useRef<RunPreset>("balanced");
  const sessionRef = useRef<NovaRunSession>(createNovaRunSession("dev:nova-run:balanced", { chunkCount: 24, hazardDensity: PRESETS.balanced.hazardDensity }));
  const clockRef = useRef(createFixedStepState());
  const queuedActionsRef = useRef<RunnerAction[]>([]);
  const lastFrameRef = useRef<number | null>(null);
  const paletteRef = useRef<Palette | null>(null);
  const lastEventRef = useRef<NovaRunEvent | null>(null);
  const telemetryTickRef = useRef(0);
  const pausedRef = useRef(false);

  const [preset, setPreset] = useState<RunPreset>("balanced");
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({ score: 0, combo: 0, bestCombo: 0, hits: 0, pickups: 0, distance: 0, progress: 0, droppedMs: 0 });

  const reset = useCallback((nextPreset: RunPreset = presetRef.current) => {
    presetRef.current = nextPreset;
    const config = PRESETS[nextPreset];
    sessionRef.current = createNovaRunSession(`dev:nova-run:${nextPreset}`, { chunkCount: 24, hazardDensity: config.hazardDensity });
    clockRef.current = createFixedStepState();
    queuedActionsRef.current = [];
    lastEventRef.current = null;
    lastFrameRef.current = null;
    setHud({ score: 0, combo: 0, bestCombo: 0, hits: 0, pickups: 0, distance: 0, progress: 0, droppedMs: 0 });
  }, []);

  const choosePreset = useCallback((nextPreset: RunPreset) => {
    setPreset(nextPreset);
    reset(nextPreset);
    requestAnimationFrame(() => canvasRef.current?.focus());
  }, [reset]);

  const queueAction = useCallback((action: RunnerAction) => {
    if (!pausedRef.current && !sessionRef.current.finished) queuedActionsRef.current.push(action);
  }, []);

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    lastFrameRef.current = null;
  }, []);

  useEffect(() => {
    paletteRef.current = readPalette();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      let action: RunnerAction | null = null;
      if (event.code === "ArrowLeft" || event.code === "KeyA") action = "left";
      if (event.code === "ArrowRight" || event.code === "KeyD") action = "right";
      if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space") action = "jump";
      if (event.code === "ArrowDown" || event.code === "KeyS") action = "slide";
      if (!action) return;
      event.preventDefault();
      queueAction(action);
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [queueAction]);

  useEffect(() => {
    let frameId = 0;
    const frame = (timestamp: number) => {
      const canvas = canvasRef.current;
      const prepared = canvas ? prepareCanvas(canvas) : null;
      const palette = paletteRef.current ?? readPalette();
      paletteRef.current = palette;
      const previousTime = lastFrameRef.current ?? timestamp;
      const elapsed = Math.min(0.1, Math.max(0, (timestamp - previousTime) / 1000));
      lastFrameRef.current = timestamp;

      if (!pausedRef.current && !sessionRef.current.finished) {
        advanceFixedStep(clockRef.current, elapsed, (fixedDt) => {
          let session = sessionRef.current;
          while (queuedActionsRef.current.length) {
            const action = queuedActionsRef.current.shift();
            if (action) session = applyNovaRunAction(session, action);
          }
          const result = stepNovaRun(session, fixedDt, undefined, { worldSpeedScale: PRESETS[presetRef.current].worldSpeedScale });
          sessionRef.current = result.session;
          if (result.events.length) lastEventRef.current = result.events[result.events.length - 1];
        });
      }

      if (prepared) drawNovaRun(prepared.context, prepared.width, prepared.height, sessionRef.current, palette, lastEventRef.current);

      if (timestamp - telemetryTickRef.current >= 100) {
        telemetryTickRef.current = timestamp;
        const session = sessionRef.current;
        setHud({
          score: session.score,
          combo: session.combo,
          bestCombo: session.bestCombo,
          hits: session.hits,
          pickups: session.pickups,
          distance: session.movement.distance,
          progress: Math.min(100, Math.round((session.movement.distance / Math.max(1, session.course.totalLength)) * 100)),
          droppedMs: Math.round(clockRef.current.droppedSeconds * 1000),
        });
      }

      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Playable vertical slice</p>
            <h1 className={styles.title}>Nova Run</h1>
            <p className={styles.subtitle}>
              Real-time lane traversal with modular safe-path generation, jump/slide action gates, pickups, recoverable collisions, combo scoring and challenge presets that change the world without changing the controls.
            </p>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="button" onClick={togglePause}>{paused ? "Resume" : "Pause"}</button>
            <button className={styles.button} type="button" onClick={() => reset()}>New run</button>
          </div>
        </header>

        <nav className={styles.modeBar} aria-label="Run challenge preset">
          {(Object.keys(PRESETS) as RunPreset[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`${styles.button} ${preset === key ? styles.buttonActive : ""}`}
              onClick={() => choosePreset(key)}
            >
              {PRESETS[key].label}
            </button>
          ))}
        </nav>

        <div className={styles.grid}>
          <section className={styles.stageCard}>
            <canvas ref={canvasRef} className={styles.canvas} tabIndex={0} aria-label="Playable Nova Run prototype" />
            <div className={styles.stageFooter}>
              <span>←/A and →/D lanes · ↑/W/Space jump · ↓/S slide</span>
              <span>60 Hz simulation · {hud.progress}% course</span>
            </div>
          </section>

          <aside className={styles.panel}>
            <div><span className={styles.badge}>{PRESETS[preset].label} run</span></div>
            <div>
              <h2>Live run</h2>
              <div className={styles.metrics}>
                <div className={styles.metric}><span>Score</span><strong>{hud.score.toLocaleString()}</strong></div>
                <div className={styles.metric}><span>Combo</span><strong>x{hud.combo}</strong></div>
                <div className={styles.metric}><span>Best combo</span><strong>x{hud.bestCombo}</strong></div>
                <div className={styles.metric}><span>Hits</span><strong>{hud.hits}</strong></div>
                <div className={styles.metric}><span>Pickups</span><strong>{hud.pickups}</strong></div>
                <div className={styles.metric}><span>Distance</span><strong>{hud.distance.toFixed(1)} m</strong></div>
                <div className={styles.metric}><span>Dropped sim</span><strong>{hud.droppedMs} ms</strong></div>
              </div>
            </div>
            <p className={styles.note}>
              Red blocks require a lane change. Yellow lines require a jump. Blue lines require a slide. Cyan pickups reward optional route precision. A collision breaks the combo but the run continues.
            </p>
          </aside>
        </div>

        <div className={styles.touchControls} aria-label="Touch controls">
          <button type="button" className={`${styles.button} ${styles.touchButton}`} onPointerDown={() => queueAction("left")}>←</button>
          <button type="button" className={`${styles.button} ${styles.touchButton}`} onPointerDown={() => queueAction("jump")}>Jump</button>
          <button type="button" className={`${styles.button} ${styles.touchButton}`} onPointerDown={() => queueAction("slide")}>Slide</button>
          <button type="button" className={`${styles.button} ${styles.touchButton}`} onPointerDown={() => queueAction("right")}>→</button>
        </div>
      </div>
    </main>
  );
}
