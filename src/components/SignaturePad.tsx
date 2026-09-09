/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createSignatureVectorEvidence,
  restoreSignatureStrokes,
  type RawSignaturePoint,
  type RawSignatureStroke,
  type SignaturePointerType,
  type SignatureVectorEvidence,
} from "@/lib/signature-vector";

type PointerKind = SignaturePointerType;
type Point = RawSignaturePoint;
type Stroke = RawSignatureStroke;

type SignaturePadProps = {
  initialDataUrl?: string | null;
  initialVectorEvidence?: SignatureVectorEvidence | null;
  disabled?: boolean;
  onChange?: (dataUrl: string) => void;
  onEvidenceChange?: (evidence: SignatureVectorEvidence | null) => void;
};

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 280;
const MIN_WIDTH = 1.15;
const MAX_WIDTH = 6.2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function midpoint(a: Point, b: Point) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pointerKind(value: string): PointerKind {
  if (value === "mouse" || value === "pen" || value === "touch") return value;
  return "unknown";
}

function inkColor() {
  if (typeof window === "undefined") return "currentColor";
  const value = getComputedStyle(document.documentElement).getPropertyValue("--color-text-primary").trim();
  return value || "currentColor";
}

function smoothedVelocity(stroke: Stroke, index: number) {
  if (index <= 0) return 0;
  const from = Math.max(1, index - 3);
  let distance = 0;
  let elapsed = 0;
  for (let cursor = from; cursor <= index; cursor += 1) {
    const current = stroke.points[cursor];
    const previous = stroke.points[cursor - 1];
    distance += Math.hypot(current.x - previous.x, current.y - previous.y);
    elapsed += Math.max(1, current.time - previous.time);
  }
  return distance / Math.max(1, elapsed);
}

function segmentWidth(stroke: Stroke, index: number) {
  const current = stroke.points[index];
  const velocity = smoothedVelocity(stroke, index);
  const velocityFactor = clamp(1 - velocity / 2.25, 0.28, 1);
  const pressure = current.pointerType === "pen" ? clamp(current.pressure || 0.5, 0.08, 1) : 0.5;
  const pressureFactor = current.pointerType === "pen" ? 0.5 + pressure * 0.85 : 0.7 + velocityFactor * 0.6;
  const motionFactor = current.pointerType === "pen" ? 0.82 + velocityFactor * 0.18 : 1;
  return clamp(stroke.width * pressureFactor * motionFactor, MIN_WIDTH, MAX_WIDTH);
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points.length) return;
  const points = stroke.points;
  ctx.save();
  ctx.strokeStyle = inkColor();
  ctx.fillStyle = inkColor();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (points.length === 1) {
    const radius = segmentWidth(stroke, 0) / 2;
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const start = index === 1 ? previous : midpoint(points[index - 2], previous);
    const end = index === points.length - 1 ? current : midpoint(previous, current);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(previous.x, previous.y, end.x, end.y);
    ctx.lineWidth = (segmentWidth(stroke, index - 1) + segmentWidth(stroke, index)) / 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawStrokes(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokes.forEach((stroke) => drawStroke(ctx, stroke));
}

function trimmedPng(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "";
  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < left || bottom < top) return "";
  const padding = 14;
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);
  const output = document.createElement("canvas");
  output.width = right - left + 1;
  output.height = bottom - top + 1;
  output.getContext("2d")?.drawImage(canvas, left, top, output.width, output.height, 0, 0, output.width, output.height);
  return output.toDataURL("image/png");
}

export function SignaturePad({ initialDataUrl, initialVectorEvidence, disabled = false, onChange, onEvidenceChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<Stroke | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [baseImage, setBaseImage] = useState(initialDataUrl ?? "");
  const [width, setWidth] = useState(2.7);

  useEffect(() => {
    activeStroke.current = null;
    setRedoStack([]);
    if (initialVectorEvidence) {
      setStrokes(restoreSignatureStrokes(initialVectorEvidence, CANVAS_WIDTH, CANVAS_HEIGHT));
      setBaseImage("");
    } else {
      setStrokes([]);
      setBaseImage(initialDataUrl ?? "");
    }
  }, [initialDataUrl, initialVectorEvidence]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const drawAll = () => strokes.forEach((stroke) => drawStroke(ctx, stroke));
    if (baseImage) {
      const image = new Image();
      image.onload = () => {
        const maxW = canvas.width * 0.82;
        const maxH = canvas.height * 0.72;
        const ratio = Math.min(maxW / image.width, maxH / image.height, 1);
        const w = image.width * ratio;
        const h = image.height * ratio;
        ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        drawAll();
      };
      image.src = baseImage;
      return;
    }
    drawAll();
  }, [baseImage, strokes]);

  useEffect(() => { redraw(); }, [redraw]);

  const position = (event: Pick<PointerEvent, "clientX" | "clientY" | "pressure" | "timeStamp" | "pointerType">): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
      pressure: event.pressure > 0 ? event.pressure : 0.5,
      time: event.timeStamp,
      pointerType: pointerKind(event.pointerType),
    };
  };

  const emitStrokes = (next: Stroke[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawStrokes(canvas, next);
    onChange?.(trimmedPng(canvas));
    onEvidenceChange?.(createSignatureVectorEvidence(next, canvas.width, canvas.height));
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    if (event.pointerType === "touch" && Math.max(event.width, event.height) > 60) return;
    event.preventDefault();
    canvasRef.current?.setPointerCapture(event.pointerId);
    if (baseImage && strokes.length === 0) setBaseImage("");
    activeStroke.current = { width, points: [position(event.nativeEvent)] };
    setRedoStack([]);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !activeStroke.current) return;
    event.preventDefault();
    const events = typeof event.nativeEvent.getCoalescedEvents === "function"
      ? event.nativeEvent.getCoalescedEvents()
      : [event.nativeEvent];
    for (const native of events) activeStroke.current.points.push(position(native));
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawStrokes(canvas, strokes);
    const ctx = canvas.getContext("2d");
    if (ctx) drawStroke(ctx, activeStroke.current);
  };

  const finish = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !activeStroke.current) return;
    if (event) {
      event.preventDefault();
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
    }
    const completed = activeStroke.current;
    activeStroke.current = null;
    const next = [...strokes, completed];
    setStrokes(next);
    emitStrokes(next);
  };

  const clear = () => {
    if (disabled) return;
    setBaseImage("");
    setStrokes([]);
    setRedoStack([]);
    const canvas = canvasRef.current;
    if (canvas) drawStrokes(canvas, []);
    onChange?.("");
    onEvidenceChange?.(null);
  };

  const undo = () => {
    if (disabled || !strokes.length) return;
    const removed = strokes[strokes.length - 1];
    const next = strokes.slice(0, -1);
    setStrokes(next);
    setRedoStack((current) => [...current, removed]);
    emitStrokes(next);
  };

  const redo = () => {
    if (disabled || !redoStack.length) return;
    const restored = redoStack[redoStack.length - 1];
    const next = [...strokes, restored];
    setRedoStack((current) => current.slice(0, -1));
    setStrokes(next);
    emitStrokes(next);
  };

  const status = useMemo(() => baseImage || strokes.length ? "Signature present" : "No signature drawn", [baseImage, strokes.length]);

  return (
    <div className="signature-pad-shell">
      <div className="signature-pad-toolbar" aria-label="Signature controls">
        <div className="signature-pad-status"><strong>{status}</strong><span>Natural ink · velocity smoothing · stylus pressure</span></div>
        <div className="signature-pad-controls">
          <label>Pen <input aria-label="Signature pen thickness" type="range" min="1.5" max="5" step=".25" value={width} disabled={disabled} onChange={(event) => setWidth(Number(event.target.value))} /></label>
          <button type="button" onClick={undo} disabled={disabled || !strokes.length}>Undo</button>
          <button type="button" onClick={redo} disabled={disabled || !redoStack.length}>Redo</button>
          <button type="button" onClick={clear} disabled={disabled || (!baseImage && !strokes.length)}>Clear</button>
        </div>
      </div>
      <div className="signature-pad-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="signature-pad-canvas"
          aria-label="Draw your signature"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onPointerLeave={(event) => { if (event.buttons === 0) finish(event); }}
        />
        <span className="signature-pad-guide" aria-hidden="true" />
      </div>
      <p className="signature-pad-note">This is an electronic handwritten signature, not biometric authentication or a PKI digital signature. Stylus pressure affects natural ink rendering; when supported, SukuuNova also preserves normalized stroke evidence with separate integrity hashes.</p>
    </div>
  );
}