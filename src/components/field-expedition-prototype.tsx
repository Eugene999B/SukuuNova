"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { advanceFixedStep, createFixedStepState } from "@/lib/game-engine/fixed-step";
import {
  attemptFieldInteraction,
  createFieldExpeditionSession,
  FIELD_EXPEDITION_SITES,
  type FieldExpeditionEvent,
  type FieldExpeditionSession,
  type FieldTool,
} from "@/lib/game-engine/field-expedition-session";
import {
  createOpenWorldState,
  selectInteractionTarget,
  stepOpenWorldMovement,
  type InteractionSelection,
  type OpenWorldState,
} from "@/lib/game-engine/open-world-simulation";
import styles from "./game-movement-lab.module.css";

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
  warning: string;
  danger: string;
};

const TOOLS: Array<{ id: FieldTool; label: string; key: string }> = [
  { id: "notebook", label: "Notebook", key: "1" },
  { id: "sample-kit", label: "Sample kit", key: "2" },
  { id: "camera", label: "Camera", key: "3" },
  { id: "meter", label: "Meter", key: "4" },
];

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
    warning: token("--arcade-warning", "yellow"),
    danger: token("--arcade-danger", "red"),
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

function domainGlyph(domain: string) {
  if (domain === "science") return "H₂O";
  if (domain === "agriculture") return "SOIL";
  if (domain === "geography") return "GEO";
  return "CIV";
}

function drawWorld(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  player: OpenWorldState,
  cameraYaw: number,
  expedition: FieldExpeditionSession,
  target: InteractionSelection | null,
  palette: Palette,
) {
  context.fillStyle = palette.canvas;
  context.fillRect(0, 0, width, height);

  const scale = Math.max(18, Math.min(34, width / 28));
  const centerX = width / 2;
  const centerY = height / 2;
  const cos = Math.cos(-cameraYaw);
  const sin = Math.sin(-cameraYaw);

  const project = (x: number, z: number) => {
    const dx = x - player.position.x;
    const dz = z - player.position.z;
    const rx = dx * cos - dz * sin;
    const rz = dx * sin + dz * cos;
    return { x: centerX + rx * scale, y: centerY - rz * scale };
  };

  context.strokeStyle = palette.line;
  context.lineWidth = 1;
  for (let x = -20; x <= 20; x += 2) {
    const a = project(x, -20);
    const b = project(x, 20);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
  for (let z = -20; z <= 20; z += 2) {
    const a = project(-20, z);
    const b = project(20, z);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }

  const riverA = project(-11, -12);
  const riverB = project(-5, 13);
  context.strokeStyle = palette.accent2;
  context.lineWidth = 18;
  context.globalAlpha = 0.36;
  context.beginPath();
  context.moveTo(riverA.x, riverA.y);
  context.lineTo(riverB.x, riverB.y);
  context.stroke();
  context.globalAlpha = 1;

  const farmA = project(4, 3);
  const farmB = project(11, 11);
  context.fillStyle = palette.raised;
  context.globalAlpha = 0.5;
  context.fillRect(Math.min(farmA.x, farmB.x), Math.min(farmA.y, farmB.y), Math.abs(farmB.x - farmA.x), Math.abs(farmB.y - farmA.y));
  context.globalAlpha = 1;

  for (const site of FIELD_EXPEDITION_SITES) {
    const point = project(site.x, site.z);
    if (point.x < -80 || point.x > width + 80 || point.y < -80 || point.y > height + 80) continue;
    const completed = expedition.completedSiteIds.includes(site.id);
    const selected = target?.target.id === site.id;
    context.fillStyle = completed ? palette.muted : selected ? palette.warning : palette.accent;
    context.beginPath();
    context.arc(point.x, point.y, selected ? 14 : 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = palette.text;
    context.font = "800 11px system-ui";
    context.textAlign = "center";
    context.fillText(domainGlyph(site.domain), point.x, point.y - 18);
    context.font = "700 10px system-ui";
    context.fillText(site.name, point.x, point.y + 28);
  }
  context.textAlign = "start";

  const facingLength = 28;
  context.strokeStyle = palette.warning;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(centerX, centerY);
  context.lineTo(
    centerX + Math.sin(player.facingRadians - cameraYaw) * facingLength,
    centerY - Math.cos(player.facingRadians - cameraYaw) * facingLength,
  );
  context.stroke();

  context.fillStyle = palette.accent;
  context.beginPath();
  context.arc(centerX, centerY, 11, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = palette.canvas;
  context.beginPath();
  context.arc(centerX + 3, centerY - 3, 2.5, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = palette.muted;
  context.font = "600 12px system-ui";
  context.fillText("Q/E rotate field camera · Shift sprint · F use selected tool", 16, 24);
}

function eventMessage(event: FieldExpeditionEvent | null) {
  if (!event) return "Explore the district and approach a field site.";
  if (event.type === "site-completed") return `${event.site.action} — +${event.scoreDelta} field points.`;
  if (event.type === "already-completed") return `${event.site.name} is already documented.`;
  return `${event.attemptedTool.replace("-", " ")} is not suitable here. Try the ${event.suggestedTool.replace("-", " ")}.`;
}

export function FieldExpeditionPrototype() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const movementRef = useRef(createOpenWorldState());
  const sessionRef = useRef(createFieldExpeditionSession());
  const clockRef = useRef(createFixedStepState());
  const keysRef = useRef(new Set<string>());
  const cameraYawRef = useRef(0);
  const toolRef = useRef<FieldTool>("notebook");
  const targetRef = useRef<InteractionSelection | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const lastHudTickRef = useRef(0);
  const paletteRef = useRef<Palette | null>(null);

  const [tool, setTool] = useState<FieldTool>("notebook");
  const [hud, setHud] = useState({ score: 0, completed: 0, streak: 0, speed: 0, targetName: "None", droppedMs: 0 });
  const [event, setEvent] = useState<FieldExpeditionEvent | null>(null);

  const chooseTool = useCallback((nextTool: FieldTool) => {
    toolRef.current = nextTool;
    setTool(nextTool);
  }, []);

  const interact = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;
    const result = attemptFieldInteraction(sessionRef.current, target.target.id, toolRef.current);
    sessionRef.current = result.session;
    setEvent(result.event);
  }, []);

  const reset = useCallback(() => {
    movementRef.current = createOpenWorldState();
    sessionRef.current = createFieldExpeditionSession();
    clockRef.current = createFixedStepState();
    cameraYawRef.current = 0;
    keysRef.current.clear();
    lastFrameRef.current = null;
    setEvent(null);
    setHud({ score: 0, completed: 0, streak: 0, speed: 0, targetName: "None", droppedMs: 0 });
  }, []);

  useEffect(() => {
    paletteRef.current = readPalette();
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      const prevented = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyQ", "KeyE", "KeyF", "Digit1", "Digit2", "Digit3", "Digit4"];
      if (prevented.includes(keyboardEvent.code)) keyboardEvent.preventDefault();
      keysRef.current.add(keyboardEvent.code);
      if (keyboardEvent.repeat) return;
      if (keyboardEvent.code === "KeyF") interact();
      const numeric = Number(keyboardEvent.code.replace("Digit", ""));
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= TOOLS.length) chooseTool(TOOLS[numeric - 1].id);
    };
    const onKeyUp = (keyboardEvent: KeyboardEvent) => keysRef.current.delete(keyboardEvent.code);
    const onBlur = () => keysRef.current.clear();
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [chooseTool, interact]);

  useEffect(() => {
    let frameId = 0;
    const frame = (timestamp: number) => {
      const previousTimestamp = lastFrameRef.current ?? timestamp;
      const elapsed = Math.min(0.1, Math.max(0, (timestamp - previousTimestamp) / 1000));
      lastFrameRef.current = timestamp;
      const keys = keysRef.current;

      advanceFixedStep(clockRef.current, elapsed, (fixedDt) => {
        const rotationDirection = (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0);
        cameraYawRef.current += rotationDirection * 1.8 * fixedDt;
        const moveX = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
        const moveY = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
        movementRef.current = stepOpenWorldMovement(
          movementRef.current,
          { moveX, moveY, cameraYawRadians: cameraYawRef.current, sprint: keys.has("ShiftLeft") || keys.has("ShiftRight") },
          fixedDt,
        );
      });

      targetRef.current = selectInteractionTarget(
        movementRef.current.position,
        movementRef.current.facingRadians,
        FIELD_EXPEDITION_SITES.map((site) => ({
          id: site.id,
          position: { x: site.x, z: site.z },
          interactionRadius: 0.8,
          priority: sessionRef.current.completedSiteIds.includes(site.id) ? -0.5 : 0.5,
        })),
        { maxDistance: 2.8, coneDegrees: 120 },
      );

      const canvas = canvasRef.current;
      if (canvas) {
        const prepared = prepareCanvas(canvas);
        const palette = paletteRef.current ?? readPalette();
        paletteRef.current = palette;
        if (prepared) drawWorld(prepared.context, prepared.width, prepared.height, movementRef.current, cameraYawRef.current, sessionRef.current, targetRef.current, palette);
      }

      if (timestamp - lastHudTickRef.current >= 100) {
        lastHudTickRef.current = timestamp;
        const movement = movementRef.current;
        const session = sessionRef.current;
        const target = targetRef.current ? FIELD_EXPEDITION_SITES.find((site) => site.id === targetRef.current?.target.id) : null;
        setHud({
          score: session.score,
          completed: session.completedSiteIds.length,
          streak: session.streak,
          speed: Math.hypot(movement.velocity.x, movement.velocity.z),
          targetName: target?.name ?? "None",
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
            <p className={styles.eyebrow}>Open-world traversal prototype</p>
            <h1 className={styles.title}>Field Expedition</h1>
            <p className={styles.subtitle}>
              Explore freely, discover field sites and use the appropriate real-world tool in context. The learner keeps moving through one connected district; academic work happens as an action inside the world rather than as a popup quiz.
            </p>
          </div>
          <button type="button" className={styles.button} onClick={reset}>Reset expedition</button>
        </header>

        <div className={styles.modeBar} aria-label="Field tools">
          {TOOLS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`${styles.button} ${tool === item.id ? styles.buttonActive : ""}`}
              onClick={() => chooseTool(item.id)}
            >
              {item.key} · {item.label}
            </button>
          ))}
          <button type="button" className={styles.button} onClick={interact}>F · Use tool</button>
        </div>

        <div className={styles.grid}>
          <section className={styles.stageCard}>
            <canvas ref={canvasRef} className={styles.canvas} tabIndex={0} aria-label="Field Expedition exploration prototype" />
            <div className={styles.stageFooter}>
              <span>WASD/Arrows move · Shift sprint · Q/E camera · F interact</span>
              <span>{hud.completed}/{FIELD_EXPEDITION_SITES.length} sites documented</span>
            </div>
          </section>

          <aside className={styles.panel}>
            <div><span className={styles.badge}>{tool.replace("-", " ")}</span></div>
            <div>
              <h2>Expedition state</h2>
              <div className={styles.metrics}>
                <div className={styles.metric}><span>Field score</span><strong>{hud.score}</strong></div>
                <div className={styles.metric}><span>Sites</span><strong>{hud.completed}/{FIELD_EXPEDITION_SITES.length}</strong></div>
                <div className={styles.metric}><span>Streak</span><strong>x{hud.streak}</strong></div>
                <div className={styles.metric}><span>Speed</span><strong>{hud.speed.toFixed(1)}</strong></div>
                <div className={styles.metric}><span>Nearby</span><strong>{hud.targetName}</strong></div>
                <div className={styles.metric}><span>Dropped sim</span><strong>{hud.droppedMs} ms</strong></div>
              </div>
            </div>
            <div>
              <h3>Field note</h3>
              <p className={styles.note}>{eventMessage(event)}</p>
            </div>
            {sessionRef.current.discoveries.length ? (
              <div>
                <h3>Latest discovery</h3>
                <p className={styles.note}>{sessionRef.current.discoveries[sessionRef.current.discoveries.length - 1]}</p>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
