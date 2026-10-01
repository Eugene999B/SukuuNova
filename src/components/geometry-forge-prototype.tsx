"use client";

import { useMemo, useRef, useState } from "react";
import {
  FORGE_CHALLENGES,
  FORGE_GRID,
  addForgeVertex,
  createGeometryForgeState,
  evaluateGeometryForge,
  moveForgeVertex,
  removeForgeVertex,
  submitGeometryForge,
  type ForgeChallengeId,
  type GeometryForgeState,
} from "@/lib/game-engine/geometry-forge";
import styles from "./geometry-forge.module.css";

const LETTERS = "ABCDEFGH";

export function GeometryForgePrototype() {
  const [state, setState] = useState<GeometryForgeState>(() => createGeometryForgeState());
  const [dragging, setDragging] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const evaluation = useMemo(() => evaluateGeometryForge(state), [state]);
  const challenge = FORGE_CHALLENGES[state.challengeId];

  const reset = (challengeId: ForgeChallengeId = state.challengeId) => {
    setState(createGeometryForgeState(challengeId));
    setDragging(null);
  };

  const moveFromPointer = (vertexIndex: number, clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * FORGE_GRID.width;
    const y = ((clientY - rect.top) / Math.max(1, rect.height)) * FORGE_GRID.height;
    setState((current) => moveForgeVertex(current, vertexIndex, x, y));
  };

  const points = state.points.map((point) => `${point.x},${point.y}`).join(" ");
  const constraints = [
    { label: "Area", value: `${evaluation.area.toFixed(1)} / ${challenge.targetArea} m²`, pass: evaluation.areaWithinTarget },
    { label: "Perimeter", value: `${evaluation.perimeter.toFixed(1)} / ≤ ${challenge.maxPerimeter} m`, pass: evaluation.perimeterWithinLimit },
    { label: "Right angles", value: `${evaluation.rightAngles} / ≥ ${challenge.requiredRightAngles}`, pass: evaluation.rightAngleRequirementMet },
    { label: "Vertices", value: `${state.points.length} / ${challenge.minVertices}-${challenge.maxVertices}`, pass: evaluation.validVertexCount },
    { label: "Shape integrity", value: evaluation.selfIntersecting ? "Crossed edges" : "Valid polygon", pass: !evaluation.selfIntersecting },
  ];

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Spatial construction prototype</p>
            <h1 className={styles.title}>Geometry Forge</h1>
            <p className={styles.subtitle}>
              Drag the actual vertices of a design. Area, perimeter, right angles and material efficiency update from the geometry you create. There is no answer card to guess—multiple shapes can satisfy the same design brief.
            </p>
          </div>
          <button type="button" className={styles.button} onClick={() => reset()}>Reset design</button>
        </header>

        <div className={styles.toolbar}>
          {(Object.keys(FORGE_CHALLENGES) as ForgeChallengeId[]).map((challengeId) => (
            <button type="button" key={challengeId} className={`${styles.button} ${state.challengeId === challengeId ? styles.active : ""}`} onClick={() => reset(challengeId)}>
              {FORGE_CHALLENGES[challengeId].title}
            </button>
          ))}
        </div>

        <section className={styles.brief}>
          <h2>{challenge.title}</h2>
          <p>{challenge.brief}</p>
        </section>

        <section className={styles.metrics} aria-label="Live design measurements">
          <div className={styles.metric}><span>Area</span><strong>{evaluation.area.toFixed(1)} m²</strong></div>
          <div className={styles.metric}><span>Perimeter</span><strong>{evaluation.perimeter.toFixed(1)} m</strong></div>
          <div className={styles.metric}><span>Right angles</span><strong>{evaluation.rightAngles}</strong></div>
          <div className={styles.metric}><span>Current score</span><strong>{evaluation.score}</strong></div>
          <div className={styles.metric}><span>Best submitted</span><strong>{state.bestScore || "—"}</strong></div>
          <div className={styles.metric}><span>Attempts</span><strong>{state.attempts}</strong></div>
        </section>

        <div className={styles.layout}>
          <section className={styles.stage}>
            <svg ref={svgRef} className={styles.canvas} viewBox={`0 0 ${FORGE_GRID.width} ${FORGE_GRID.height}`} aria-label="Geometry construction grid">
              {Array.from({ length: FORGE_GRID.width + 1 }, (_, index) => (
                <line key={`v-${index}`} className={styles.gridLine} x1={index} y1={0} x2={index} y2={FORGE_GRID.height} />
              ))}
              {Array.from({ length: FORGE_GRID.height + 1 }, (_, index) => (
                <line key={`h-${index}`} className={styles.gridLine} x1={0} y1={index} x2={FORGE_GRID.width} y2={index} />
              ))}
              <polygon className={styles.shape} points={points} />
              {state.points.map((point, index) => (
                <g key={`${index}-${point.x}-${point.y}`}>
                  <circle
                    className={`${styles.vertex} ${state.selectedVertex === index ? styles.vertexSelected : ""}`}
                    cx={point.x}
                    cy={point.y}
                    r={0.34}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDragging(index);
                      setState((current) => ({ ...current, selectedVertex: index }));
                    }}
                    onPointerMove={(event) => {
                      if (dragging === index) moveFromPointer(index, event.clientX, event.clientY);
                    }}
                    onPointerUp={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                      setDragging(null);
                    }}
                    onPointerCancel={() => setDragging(null)}
                  />
                  <text className={styles.vertexLabel} x={point.x + 0.45} y={point.y - 0.45}>{LETTERS[index]}</text>
                </g>
              ))}
            </svg>
            <div className={styles.actions}>
              <span className={styles.badge}>Drag yellow points · snaps to 1 m grid</span>
              <button type="button" className={styles.button} onClick={() => setState((current) => addForgeVertex(current))}>Add corner</button>
              <button type="button" className={styles.button} disabled={state.selectedVertex === null} onClick={() => setState((current) => removeForgeVertex(current))}>Remove selected</button>
              <button type="button" className={styles.primaryButton} onClick={() => setState((current) => submitGeometryForge(current))}>Submit design</button>
            </div>
          </section>

          <aside className={styles.panel}>
            <h2>Constraint board</h2>
            <ul className={styles.constraintList}>
              {constraints.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong className={item.pass ? styles.pass : styles.fail}>{item.value}</strong>
                </li>
              ))}
            </ul>
            <div className={styles.statuses}>
              <span className={styles.badge}>{state.points.length} vertices</span>
              <span className={styles.badge}>Tolerance ±{challenge.areaTolerance} m²</span>
            </div>
            <section className={styles.result} aria-live="polite">
              <h2>{evaluation.complete ? "Design passes" : "Keep refining"}</h2>
              <p>
                {evaluation.complete
                  ? "This shape satisfies the brief. Try another valid design with fewer edges or a better score to prove there is more than one solution."
                  : "Change the geometry until every constraint passes. A larger area can increase usefulness but may also increase boundary material, so the shape itself is the trade-off."}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
