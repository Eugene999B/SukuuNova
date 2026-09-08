/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number; pressure: number };
type Stroke = { points: Point[]; width: number };

type SignaturePadProps = {
  initialDataUrl?: string | null;
  disabled?: boolean;
  onChange?: (dataUrl: string) => void;
};

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 280;
const MIN_WIDTH = 1.25;
const MAX_WIDTH = 5.5;

function midpoint(a: Point, b: Point) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function inkColor() {
  if (typeof window === "undefined") return "currentColor";
  const value = getComputedStyle(document.documentElement).getPropertyValue("--color-text-primary").trim();
  return value || "currentColor";
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
    const radius = Math.max(MIN_WIDTH, stroke.width * Math.max(.45, points[0].pressure || .5)) / 2;
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const mid = midpoint(current, next);
    ctx.lineWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, stroke.width * Math.max(.45, current.pressure || .5)));
    ctx.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
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

export function SignaturePad({ initialDataUrl, disabled = false, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<Stroke | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [baseImage, setBaseImage] = useState(initialDataUrl ?? "");
  const [width, setWidth] = useState(2.7);

  useEffect(() => setBaseImage(initialDataUrl ?? ""), [initialDataUrl]);

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
        const maxW = canvas.width * .82;
        const maxH = canvas.height * .72;
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

  const position = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
      pressure: event.pressure > 0 ? event.pressure : .55,
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.preventDefault();
    canvasRef.current?.setPointerCapture(event.pointerId);
    if (baseImage && strokes.length === 0) setBaseImage("");
    activeStroke.current = { width, points: [position(event)] };
    setRedoStack([]);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !activeStroke.current) return;
    event.preventDefault();
    const events = typeof event.nativeEvent.getCoalescedEvents === "function"
      ? event.nativeEvent.getCoalescedEvents()
      : [event.nativeEvent];
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    for (const native of events) {
      activeStroke.current.points.push({
        x: (native.clientX - rect.left) * (canvas.width / rect.width),
        y: (native.clientY - rect.top) * (canvas.height / rect.height),
        pressure: native.pressure > 0 ? native.pressure : .55,
      });
    }
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      strokes.forEach((stroke) => drawStroke(ctx, stroke));
      drawStroke(ctx, activeStroke.current);
    }
  };

  const finish = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !activeStroke.current) return;
    if (event) {
      event.preventDefault();
      if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
    }
    const next = [...strokes, activeStroke.current];
    activeStroke.current = null;
    setStrokes(next);
    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const data = trimmedPng(canvas);
      onChange?.(data);
    });
  };

  const clear = () => {
    if (disabled) return;
    setBaseImage("");
    setStrokes([]);
    setRedoStack([]);
    onChange?.("");
  };

  const undo = () => {
    if (disabled || !strokes.length) return;
    const removed = strokes[strokes.length - 1];
    const next = strokes.slice(0, -1);
    setStrokes(next);
    setRedoStack((current) => [...current, removed]);
    requestAnimationFrame(() => onChange?.(canvasRef.current ? trimmedPng(canvasRef.current) : ""));
  };

  const redo = () => {
    if (disabled || !redoStack.length) return;
    const restored = redoStack[redoStack.length - 1];
    setRedoStack((current) => current.slice(0, -1));
    setStrokes((current) => [...current, restored]);
    requestAnimationFrame(() => onChange?.(canvasRef.current ? trimmedPng(canvasRef.current) : ""));
  };

  const status = useMemo(() => baseImage || strokes.length ? "Signature present" : "No signature drawn", [baseImage, strokes.length]);

  return (
    <div className="signature-pad-shell">
      <div className="signature-pad-toolbar" aria-label="Signature controls">
        <div className="signature-pad-status"><strong>{status}</strong><span>Transparent PNG · mouse, touch or stylus</span></div>
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
      <p className="signature-pad-note">This is an electronic document signature, not biometric authentication. SukuuNova stores only the image you choose to save.</p>
    </div>
  );
}
