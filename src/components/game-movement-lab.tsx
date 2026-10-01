"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { advanceFixedStep, createFixedStepState } from "@/lib/game-engine/fixed-step";
import { createPlatformerState, stepPlatformer, type PlatformerState } from "@/lib/game-engine/platformer-simulation";
import { applyRunnerAction, createRunnerState, stepRunner, type RunnerAction, type RunnerState } from "@/lib/game-engine/runner-simulation";
import styles from "./game-movement-lab.module.css";

type LabMode = "platformer" | "runner";

type LabTelemetry = {
  primary: string;
  secondary: string;
  tertiary: string;
  simulationSteps: number;
  droppedMs: number;
};

type Palette = {
  canvas: string;
  surface: string;
  raised: string;
  soft: string;
  line: string;
  lineStrong: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  danger: string;
  warning: string;
};

const EMPTY_TELEMETRY: LabTelemetry = {
  primary: "0",
  secondary: "0",
  tertiary: "0",
  simulationSteps: 0,
  droppedMs: 0,
};

function readPalette(): Palette {
  const computed = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => computed.getPropertyValue(name).trim() || fallback;
  return {
    canvas: token("--arcade-canvas", "black"),
    surface: token("--arcade-surface", "black"),
    raised: token("--arcade-surface-raised", "black"),
    soft: token("--arcade-surface-soft", "gray"),
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
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width, height };
}

function drawPlatformer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: PlatformerState,
  palette: Palette,
) {
  context.fillStyle = palette.canvas;
  context.fillRect(0, 0, width, height);

  const groundY = height * 0.8;
  const scale = Math.max(28, Math.min(52, width / 18));
  const cameraX = state.x;

  context.strokeStyle = palette.line;
  context.lineWidth = 1;
  for (let offset = -12; offset <= 12; offset += 1) {
    const worldX = Math.floor(cameraX) + offset;
    const x = width / 2 + (worldX - cameraX) * scale;
    context.beginPath();
    context.moveTo(x, groundY - 8);
    context.lineTo(x, groundY + 8);
    context.stroke();
  }

  context.fillStyle = palette.raised;
  context.fillRect(0, groundY, width, height - groundY);
  context.strokeStyle = palette.accent;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(0, groundY);
  context.lineTo(width, groundY);
  context.stroke();

  const jumpY = groundY - state.y * scale;
  const bodyWidth = Math.max(24, scale * 0.62);
  const bodyHeight = Math.max(34, scale * 0.9);
  const playerX = width / 2 - bodyWidth / 2;
  const playerY = jumpY - bodyHeight;

  context.fillStyle = palette.accent;
  context.fillRect(playerX, playerY, bodyWidth, bodyHeight);
  context.fillStyle = palette.canvas;
  const facingX = state.velocityX < -0.05 ? playerX + 7 : playerX + bodyWidth - 11;
  context.fillRect(facingX, playerY + 9, 5, 5);

  context.fillStyle = palette.muted;
  context.font = "600 13px system-ui";
  context.fillText("Ground truth line", 16, groundY + 26);
  context.fillText("Camera follows world position; avatar remains readable", 16, 28);

  const velocityWidth = Math.min(width * 0.25, Math.abs(state.velocityX) * 18);
  context.fillStyle = palette.soft;
  context.fillRect(16, 46, width * 0.25, 8);
  context.fillStyle = palette.accent2;
  context.fillRect(16, 46, velocityWidth, 8);
}

function laneX(width: number, lane: number, laneCount: number, yRatio: number) {
  const topWidth = width * 0.28;
  const bottomWidth = width * 0.78;
  const roadWidth = topWidth + (bottomWidth - topWidth) * yRatio;
  const left = width / 2 - roadWidth / 2;
  return left + roadWidth * ((lane + 0.5) / laneCount);
}

function drawRunner(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RunnerState,
  palette: Palette,
) {
  context.fillStyle = palette.canvas;
  context.fillRect(0, 0, width, height);

  const horizon = height * 0.16;
  const roadBottom = height * 0.95;
  const topHalf = width * 0.14;
  const bottomHalf = width * 0.39;

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
    const topX = width / 2 - topHalf + topHalf * 2 * ratio;
    const bottomX = width / 2 - bottomHalf + bottomHalf * 2 * ratio;
    context.beginPath();
    context.moveTo(topX, horizon);
    context.lineTo(bottomX, roadBottom);
    context.stroke();
  }

  const stripeOffset = (state.distance * 0.08) % 1;
  for (let index = 0; index < 9; index += 1) {
    const raw = (index + stripeOffset) / 9;
    const depth = raw * raw;
    const y = horizon + (roadBottom - horizon) * depth;
    const half = topHalf + (bottomHalf - topHalf) * depth;
    context.strokeStyle = palette.line;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(width / 2 - half, y);
    context.lineTo(width / 2 + half, y);
    context.stroke();
  }

  for (let index = 0; index < 4; index += 1) {
    const cycle = ((state.distance * 0.025 + index * 0.24) % 1 + 1) % 1;
    const depth = cycle * cycle;
    if (depth < 0.08 || depth > 0.88) continue;
    const lane = Math.abs((Math.floor(state.distance / 12) + index * 2) % 3);
    const x = laneX(width, lane, 3, depth);
    const y = horizon + (roadBottom - horizon) * depth;
    const size = 10 + 34 * depth;
    context.fillStyle = index % 2 === 0 ? palette.warning : palette.danger;
    context.fillRect(x - size / 2, y - size, size, size);
  }

  const playerDepth = 0.86;
  const playerX = laneX(width, state.renderedLane, 3, playerDepth);
  const baseY = horizon + (roadBottom - horizon) * playerDepth - state.height * 34;
  const sliding = state.slideRemainingMs > 0;
  const bodyWidth = sliding ? 48 : 30;
  const bodyHeight = sliding ? 24 : 48;

  context.fillStyle = palette.accent;
  context.fillRect(playerX - bodyWidth / 2, baseY - bodyHeight, bodyWidth, bodyHeight);
  context.fillStyle = palette.canvas;
  context.fillRect(playerX + bodyWidth * 0.12, baseY - bodyHeight * 0.72, 5, 5);

  context.fillStyle = palette.muted;
  context.font = "600 13px system-ui";
  context.fillText("Logical lane reacts immediately; avatar animation catches up", 16, 28);
}

export function GameMovementLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<LabMode>("platformer");
  const pausedRef = useRef(false);
  const keysRef = useRef(new Set<string>());
  const platformJumpPressedRef = useRef(false);
  const runnerActionsRef = useRef<RunnerAction[]>([]);
  const platformerRef = useRef(createPlatformerState());
  const runnerRef = useRef(createRunnerState());
  const clockRef = useRef(createFixedStepState());
  const lastFrameRef = useRef<number | null>(null);
  const lastTelemetryRef = useRef(0);
  const paletteRef = useRef<Palette | null>(null);

  const [mode, setMode] = useState<LabMode>("platformer");
  const [paused, setPaused] = useState(false);
  const [telemetry, setTelemetry] = useState<LabTelemetry>(EMPTY_TELEMETRY);

  const reset = useCallback((nextMode?: LabMode) => {
    const resolvedMode = nextMode ?? modeRef.current;
    modeRef.current = resolvedMode;
    platformerRef.current = createPlatformerState();
    runnerRef.current = createRunnerState();
    clockRef.current = createFixedStepState();
    keysRef.current.clear();
    runnerActionsRef.current = [];
    platformJumpPressedRef.current = false;
    lastFrameRef.current = null;
    setTelemetry(EMPTY_TELEMETRY);
  }, []);

  const chooseMode = useCallback((nextMode: LabMode) => {
    setMode(nextMode);
    reset(nextMode);
    requestAnimationFrame(() => canvasRef.current?.focus());
  }, [reset]);

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    lastFrameRef.current = null;
  }, []);

  const queueAction = useCallback((action: RunnerAction) => {
    if (modeRef.current === "runner") {
      runnerActionsRef.current.push(action);
      return;
    }
    if (action === "jump") {
      platformJumpPressedRef.current = true;
      keysRef.current.add("Space");
    }
  }, []);

  useEffect(() => {
    paletteRef.current = readPalette();

    const preventKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyS"]);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!preventKeys.has(event.code)) return;
      event.preventDefault();
      keysRef.current.add(event.code);

      if (modeRef.current === "runner" && !event.repeat) {
        if (event.code === "ArrowLeft" || event.code === "KeyA") runnerActionsRef.current.push("left");
        if (event.code === "ArrowRight" || event.code === "KeyD") runnerActionsRef.current.push("right");
        if (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space") runnerActionsRef.current.push("jump");
        if (event.code === "ArrowDown" || event.code === "KeyS") runnerActionsRef.current.push("slide");
      } else if (modeRef.current === "platformer" && !event.repeat && (event.code === "ArrowUp" || event.code === "KeyW" || event.code === "Space")) {
        platformJumpPressedRef.current = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };

    const clearKeys = () => keysRef.current.clear();
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
    };
  }, []);

  useEffect(() => {
    let animationFrame = 0;

    const frame = (timestamp: number) => {
      const canvas = canvasRef.current;
      const palette = paletteRef.current ?? readPalette();
      paletteRef.current = palette;
      if (!canvas) {
        animationFrame = requestAnimationFrame(frame);
        return;
      }

      const prepared = prepareCanvas(canvas);
      const previousTimestamp = lastFrameRef.current ?? timestamp;
      const elapsedSeconds = Math.min(0.1, Math.max(0, (timestamp - previousTimestamp) / 1000));
      lastFrameRef.current = timestamp;

      if (!pausedRef.current) {
        advanceFixedStep(clockRef.current, elapsedSeconds, (fixedDt) => {
          if (modeRef.current === "platformer") {
            const keys = keysRef.current;
            const moveX = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
            const jumpHeld = keys.has("ArrowUp") || keys.has("KeyW") || keys.has("Space");
            const previous = platformerRef.current;
            const grounded = previous.y <= 0.0001 && previous.velocityY <= 0;
            const result = stepPlatformer(
              previous,
              { moveX, jumpPressed: platformJumpPressedRef.current, jumpHeld },
              { grounded, groundY: 0 },
              fixedDt,
            );
            platformJumpPressedRef.current = false;
            const next = result.state;
            if (next.y < 0) {
              next.y = 0;
              next.velocityY = 0;
              next.grounded = true;
            }
            platformerRef.current = next;
          } else {
            let next = runnerRef.current;
            while (runnerActionsRef.current.length) {
              const action = runnerActionsRef.current.shift();
              if (action) next = applyRunnerAction(next, action);
            }
            runnerRef.current = stepRunner(next, fixedDt);
          }
        });
      }

      if (prepared) {
        const { context, width, height } = prepared;
        if (modeRef.current === "platformer") drawPlatformer(context, width, height, platformerRef.current, palette);
        else drawRunner(context, width, height, runnerRef.current, palette);
      }

      if (timestamp - lastTelemetryRef.current >= 100) {
        lastTelemetryRef.current = timestamp;
        const clock = clockRef.current;
        if (modeRef.current === "platformer") {
          const current = platformerRef.current;
          setTelemetry({
            primary: `x ${current.x.toFixed(2)}`,
            secondary: `y ${current.y.toFixed(2)}`,
            tertiary: `vx ${current.velocityX.toFixed(2)} · vy ${current.velocityY.toFixed(2)}`,
            simulationSteps: clock.totalSteps,
            droppedMs: Math.round(clock.droppedSeconds * 1000),
          });
        } else {
          const current = runnerRef.current;
          setTelemetry({
            primary: `lane ${current.logicalLane + 1}`,
            secondary: `render ${current.renderedLane.toFixed(2)}`,
            tertiary: `${current.distance.toFixed(1)} m · h ${current.height.toFixed(2)}`,
            simulationSteps: clock.totalSteps,
            droppedMs: Math.round(clock.droppedSeconds * 1000),
          });
        }
      }

      animationFrame = requestAnimationFrame(frame);
    };

    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const holdControl = useCallback((code: string, pressed: boolean) => {
    if (pressed) keysRef.current.add(code);
    else keysRef.current.delete(code);
  }, []);

  const pointerHold = (code: string, action?: RunnerAction) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (modeRef.current === "runner" && action) queueAction(action);
      else holdControl(code, true);
      if (modeRef.current === "platformer" && action === "jump") platformJumpPressedRef.current = true;
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      holdControl(code, false);
    },
    onPointerCancel: () => holdControl(code, false),
    onPointerLeave: () => {
      if (modeRef.current === "platformer") holdControl(code, false);
    },
  });

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Developer movement laboratory</p>
            <h1 className={styles.title}>Sukuunova Game Feel Lab</h1>
            <p className={styles.subtitle}>
              A dependency-free test bed for movement physics before academic content is layered on top. Tune the feel here, then reuse the verified profile inside real games.
            </p>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} type="button" onClick={togglePause}>{paused ? "Resume" : "Pause"}</button>
            <button className={styles.button} type="button" onClick={() => reset()}>Reset</button>
          </div>
        </header>

        <nav className={styles.modeBar} aria-label="Movement laboratory mode">
          <button
            type="button"
            className={`${styles.button} ${mode === "platformer" ? styles.buttonActive : ""}`}
            onClick={() => chooseMode("platformer")}
          >
            Responsive Platformer
          </button>
          <button
            type="button"
            className={`${styles.button} ${mode === "runner" ? styles.buttonActive : ""}`}
            onClick={() => chooseMode("runner")}
          >
            Nova Run
          </button>
        </nav>

        <div className={styles.grid}>
          <section className={styles.stageCard} aria-label={`${mode} movement simulation`}>
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              tabIndex={0}
              aria-label={mode === "platformer" ? "Platformer movement simulation" : "Runner movement simulation"}
            />
            <div className={styles.stageFooter}>
              <span>{mode === "platformer" ? "A/D or ←/→ · W/↑/Space jump" : "A/D or ←/→ lanes · W/↑/Space jump · S/↓ slide"}</span>
              <span>Fixed simulation: 60 Hz</span>
            </div>
          </section>

          <aside className={styles.panel}>
            <div>
              <span className={styles.badge}>{mode === "platformer" ? "Muscle-memory safe" : "Animation-independent input"}</span>
            </div>
            <div>
              <h2>Live state</h2>
              <div className={styles.metrics}>
                <div className={styles.metric}><span>Position</span><strong>{telemetry.primary}</strong></div>
                <div className={styles.metric}><span>Motion</span><strong>{telemetry.secondary}</strong></div>
                <div className={styles.metric}><span>Velocity</span><strong>{telemetry.tertiary}</strong></div>
                <div className={styles.metric}><span>Sim steps</span><strong>{telemetry.simulationSteps}</strong></div>
                <div className={styles.metric}><span>Dropped time</span><strong>{telemetry.droppedMs} ms</strong></div>
              </div>
            </div>
            <div>
              <h3>What this proves</h3>
              <p className={styles.note}>
                {mode === "platformer"
                  ? "Acceleration, stopping, coyote time, jump buffering, air control and variable jump height run independently of rendering frame rate."
                  : "Lane decisions happen immediately while the visual character catches up, allowing rapid inputs without animation lockout."}
              </p>
            </div>
          </aside>
        </div>

        <section aria-label="Touch controls">
          <div className={styles.touchControls}>
            <button type="button" className={`${styles.button} ${styles.touchButton}`} {...pointerHold("ArrowLeft", "left")} aria-label="Move left">←</button>
            <button type="button" className={`${styles.button} ${styles.touchButton}`} {...pointerHold("Space", "jump")} aria-label="Jump">Jump</button>
            <button type="button" className={`${styles.button} ${styles.touchButton}`} {...pointerHold("ArrowRight", "right")} aria-label="Move right">→</button>
            {mode === "runner" ? (
              <button type="button" className={`${styles.button} ${styles.touchButton}`} onPointerDown={() => queueAction("slide")} aria-label="Slide">Slide</button>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
