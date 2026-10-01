"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { simulateTruss, type StructuralModel, type StructuralSimulationResult } from "@/lib/game-engine/structural-simulation";
import styles from "./game-movement-lab.module.css";

type Palette = {
  canvas: string;
  surface: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  warning: string;
  danger: string;
  accent2: string;
};

function readPalette(): Palette {
  const computed = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => computed.getPropertyValue(name).trim() || fallback;
  return {
    canvas: token("--arcade-canvas", "black"),
    surface: token("--arcade-surface", "black"),
    line: token("--arcade-line", "gray"),
    text: token("--arcade-text", "white"),
    muted: token("--arcade-muted", "gray"),
    accent: token("--arcade-accent", "cyan"),
    warning: token("--arcade-warning", "yellow"),
    danger: token("--arcade-danger", "red"),
    accent2: token("--arcade-accent-2", "blue"),
  };
}

function createBridge(loadKn: number, areaCm2: number): StructuralModel {
  const areaM2 = Math.max(0.0001, areaCm2 / 10_000);
  return {
    nodes: [
      { id: "A", x: 0, y: 0, fixedX: true, fixedY: true },
      { id: "B", x: 4, y: 0, fixedY: true },
      { id: "C", x: 2, y: 2.5, loadY: -loadKn * 1000 },
    ],
    members: [
      { id: "AB", nodeA: "A", nodeB: "B", area: areaM2, youngModulus: 200e9, yieldStrength: 250e6 },
      { id: "AC", nodeA: "A", nodeB: "C", area: areaM2, youngModulus: 200e9, yieldStrength: 250e6 },
      { id: "BC", nodeA: "B", nodeB: "C", area: areaM2, youngModulus: 200e9, yieldStrength: 250e6 },
    ],
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

function utilizationColor(utilization: number, palette: Palette) {
  if (utilization > 1) return palette.danger;
  if (utilization >= 0.7) return palette.warning;
  return palette.accent;
}

function drawBridge(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  model: StructuralModel,
  result: StructuralSimulationResult,
  palette: Palette,
) {
  context.fillStyle = palette.canvas;
  context.fillRect(0, 0, width, height);

  const marginX = width * 0.16;
  const groundY = height * 0.8;
  const scaleX = (width - marginX * 2) / 4;
  const scaleY = Math.min(scaleX, height * 0.2);
  const deformationBoost = 1400;

  const screenPosition = (nodeId: string, deformed: boolean) => {
    const node = model.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    const displacement = deformed ? result.displacements[nodeId] ?? { x: 0, y: 0 } : { x: 0, y: 0 };
    return {
      x: marginX + (node.x + displacement.x * deformationBoost) * scaleX,
      y: groundY - (node.y + displacement.y * deformationBoost) * scaleY,
    };
  };

  context.strokeStyle = palette.line;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(marginX * 0.6, groundY);
  context.lineTo(width - marginX * 0.6, groundY);
  context.stroke();

  context.save();
  context.setLineDash([6, 6]);
  context.globalAlpha = 0.55;
  for (const member of model.members) {
    const a = screenPosition(member.nodeA, false);
    const b = screenPosition(member.nodeB, false);
    context.strokeStyle = palette.line;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
  context.restore();

  for (const member of model.members) {
    const memberResult = result.members.find((candidate) => candidate.memberId === member.id);
    if (!memberResult) continue;
    const a = screenPosition(member.nodeA, true);
    const b = screenPosition(member.nodeB, true);
    context.strokeStyle = utilizationColor(memberResult.utilization, palette);
    context.lineWidth = memberResult.failed ? 8 : 5;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();

    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    context.fillStyle = palette.text;
    context.font = "700 12px system-ui";
    context.fillText(`${member.id} ${(memberResult.utilization * 100).toFixed(0)}%`, midX + 6, midY - 5);
  }

  for (const node of model.nodes) {
    const point = screenPosition(node.id, true);
    context.fillStyle = palette.accent2;
    context.beginPath();
    context.arc(point.x, point.y, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = palette.text;
    context.font = "800 12px system-ui";
    context.fillText(node.id, point.x + 10, point.y - 9);

    if (node.fixedX || node.fixedY) {
      context.strokeStyle = palette.muted;
      context.beginPath();
      context.moveTo(point.x - 12, point.y + 15);
      context.lineTo(point.x + 12, point.y + 15);
      context.lineTo(point.x, point.y + 2);
      context.closePath();
      context.stroke();
    }

    if ((node.loadY ?? 0) < 0) {
      context.strokeStyle = palette.warning;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(point.x, point.y - 62);
      context.lineTo(point.x, point.y - 15);
      context.stroke();
      context.beginPath();
      context.moveTo(point.x - 7, point.y - 24);
      context.lineTo(point.x, point.y - 15);
      context.lineTo(point.x + 7, point.y - 24);
      context.stroke();
    }
  }

  context.fillStyle = palette.muted;
  context.font = "600 13px system-ui";
  context.fillText("Dashed = undeformed · Solid = amplified displacement for visibility", 18, 28);
}

export function FailurePointPrototype() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loadKn, setLoadKn] = useState(180);
  const [areaCm2, setAreaCm2] = useState(18);
  const model = useMemo(() => createBridge(loadKn, areaCm2), [loadKn, areaCm2]);
  const result = useMemo(() => simulateTruss(model), [model]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const palette = readPalette();
    const draw = () => {
      const prepared = prepareCanvas(canvas);
      if (prepared) drawBridge(prepared.context, prepared.width, prepared.height, model, result, palette);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [model, result]);

  const apexDisplacementMm = Math.hypot(result.displacements.C?.x ?? 0, result.displacements.C?.y ?? 0) * 1000;
  const maximumPercent = result.maxUtilization * 100;

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Playable engineering simulation</p>
            <h1 className={styles.title}>Engineer: Failure Point</h1>
            <p className={styles.subtitle}>
              Increase the load or reduce member area and watch the structure respond. The solver computes actual linear truss displacement, axial force, stress and yield utilization; failure is the feedback.
            </p>
          </div>
          <span className={styles.badge}>{result.failedMemberIds.length ? "Structural failure" : "Structure stable"}</span>
        </header>

        <div className={styles.grid}>
          <section className={styles.stageCard}>
            <canvas ref={canvasRef} className={styles.canvas} aria-label="Structural truss simulation" />
            <div className={styles.stageFooter}>
              <span>Green/cyan &lt; 70% · Yellow 70–100% · Red &gt; yield</span>
              <span>Linear elastic educational model</span>
            </div>
          </section>

          <aside className={styles.panel}>
            <div>
              <h2>Load test</h2>
              <p className={styles.note}>Applied load at node C: <strong>{loadKn} kN</strong></p>
              <input
                aria-label="Applied load in kilonewtons"
                type="range"
                min={20}
                max={1600}
                step={10}
                value={loadKn}
                onChange={(event) => setLoadKn(Number(event.target.value))}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <p className={styles.note}>Member cross-section: <strong>{areaCm2} cm²</strong></p>
              <input
                aria-label="Member cross-sectional area"
                type="range"
                min={4}
                max={40}
                step={1}
                value={areaCm2}
                onChange={(event) => setAreaCm2(Number(event.target.value))}
                style={{ width: "100%" }}
              />
            </div>

            <div className={styles.metrics}>
              <div className={styles.metric}><span>Max utilization</span><strong>{maximumPercent.toFixed(1)}%</strong></div>
              <div className={styles.metric}><span>Apex movement</span><strong>{apexDisplacementMm.toFixed(3)} mm</strong></div>
              <div className={styles.metric}><span>Failed members</span><strong>{result.failedMemberIds.length}</strong></div>
              <div className={styles.metric}><span>Solver</span><strong>{result.stable ? "stable" : "unstable"}</strong></div>
            </div>

            <div>
              <h3>Member forces</h3>
              <div className={styles.metrics}>
                {result.members.map((member) => (
                  <div className={styles.metric} key={member.memberId}>
                    <span>{member.memberId} · {member.mode}</span>
                    <strong>{(member.axialForce / 1000).toFixed(1)} kN</strong>
                  </div>
                ))}
              </div>
            </div>

            <p className={styles.note}>
              This prototype intentionally uses a small-displacement pin-jointed truss model. It is for learning/gameplay, not professional engineering certification or construction decisions.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
