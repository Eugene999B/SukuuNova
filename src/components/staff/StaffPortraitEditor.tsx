/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, ImageUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import "@/components/students/student-photo-capture.css";

type CameraFacing = "user" | "environment";
type FaceBox = { x: number; y: number; width: number; height: number };
type FaceDetectorInstance = { detect: (source: CanvasImageSource) => Promise<Array<{ boundingBox: FaceBox }>> };
type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorInstance;

function preparePortrait(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
  if (sourceWidth < 480 || sourceHeight < 480) throw new Error("Use a portrait of at least 480×480 pixels.");
  const targetRatio = 4 / 5;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceWidth / sourceHeight > targetRatio) cropWidth = sourceHeight * targetRatio;
  else cropHeight = sourceWidth / targetRatio;
  const sx = Math.max(0, (sourceWidth - cropWidth) / 2);
  const sy = Math.max(0, (sourceHeight - cropHeight) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(720, Math.max(1, Math.round(cropWidth)));
  canvas.height = Math.round(canvas.width / targetRatio);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Portrait processing is unavailable in this browser.");
  context.drawImage(source, sx, sy, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);

  const sample = document.createElement("canvas");
  sample.width = 80;
  sample.height = 100;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) throw new Error("Portrait quality checks are unavailable.");
  sampleContext.drawImage(canvas, 0, 0, sample.width, sample.height);
  const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
  let brightness = 0;
  for (let index = 0; index < pixels.length; index += 4) brightness += pixels[index] * .299 + pixels[index + 1] * .587 + pixels[index + 2] * .114;
  brightness /= pixels.length / 4;
  if (brightness < 40) throw new Error("The portrait is too dark. Use brighter, even front lighting.");
  if (brightness > 225) throw new Error("The portrait is overexposed. Move away from strong direct light.");

  for (let quality = .82; quality >= .46; quality -= .06) {
    const value = canvas.toDataURL("image/jpeg", quality);
    if (value.length <= 700_000) return value;
  }
  return canvas.toDataURL("image/jpeg", .42);
}

function liveFrameLooksClear(video: HTMLVideoElement) {
  if (video.videoWidth < 480 || video.videoHeight < 480) return false;
  const sample = document.createElement("canvas");
  sample.width = 80;
  sample.height = 100;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(video, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  const grey = new Float32Array(sample.width * sample.height);
  let brightness = 0;
  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const value = pixels[index] * .299 + pixels[index + 1] * .587 + pixels[index + 2] * .114;
    grey[pixel] = value;
    brightness += value;
  }
  brightness /= grey.length;
  if (brightness < 45 || brightness > 220) return false;
  let edge = 0;
  let samples = 0;
  for (let y = 1; y < sample.height; y += 1) {
    for (let x = 1; x < sample.width; x += 1) {
      const index = y * sample.width + x;
      edge += Math.abs(grey[index] - grey[index - 1]) + Math.abs(grey[index] - grey[index - sample.width]);
      samples += 2;
    }
  }
  return edge / Math.max(1, samples) >= 3.2;
}

function faceIsWellPlaced(box: FaceBox, width: number, height: number) {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const horizontalOffset = Math.abs(centerX - width / 2) / width;
  const verticalOffset = Math.abs(centerY - height * .43) / height;
  const faceRatio = (box.width * box.height) / Math.max(1, width * height);
  return horizontalOffset <= .14 && verticalOffset <= .18 && faceRatio >= .06 && faceRatio <= .55;
}

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access is blocked. On iPhone, allow Camera for SukuuNova in Safari and try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "That camera is not available. Try the other camera or use Upload portrait.";
  if (name === "NotReadableError" || name === "AbortError") return "The camera is busy or could not start. Close other camera apps and try again.";
  return "The camera could not start. Check permission and try again, or upload a portrait.";
}

export function StaffPortraitEditor({ staffId, staffName, initialPhoto }: { staffId: string; staffName: string; initialPhoto: string | null }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stableFramesRef = useRef(0);
  const evaluatingRef = useRef(false);
  const settleUntilRef = useRef(0);
  const [preview, setPreview] = useState(initialPhoto ?? "");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    stableFramesRef.current = 0;
    setCameraReady(false);
  }

  useEffect(() => () => releaseStream(), []);

  async function save(photoData: string | null) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/school/staff/${encodeURIComponent(staffId)}/photo`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photoData }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Could not update staff portrait.");
      setPreview(photoData ?? "");
      setMessage(photoData ? "Portrait saved. New ID-card downloads will use this image." : "Portrait removed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update staff portrait.");
    } finally {
      setBusy(false);
    }
  }

  async function accept(source: CanvasImageSource, width: number, height: number) {
    try {
      stableFramesRef.current = 0;
      await save(preparePortrait(source, width, height));
      stopCamera();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not process this portrait.");
    }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMessage("Choose a portrait image file."); return; }
    if (file.size > 8 * 1024 * 1024) { setMessage("Choose an image smaller than 8 MB."); return; }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { void accept(image, image.naturalWidth, image.naturalHeight).finally(() => URL.revokeObjectURL(url)); };
    image.onerror = () => { URL.revokeObjectURL(url); setMessage("This image could not be loaded."); };
    image.src = url;
  }

  async function waitForVideoElement() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (videoRef.current) return videoRef.current;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    throw new Error("The camera preview could not be prepared. Try again.");
  }

  async function attachAndPlay(stream: MediaStream) {
    const video = await waitForVideoElement();
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      let timeout = 0;
      const cleanup = () => {
        if (timeout) window.clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", ready);
        video.removeEventListener("error", failed);
      };
      const ready = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error("Camera preview could not be loaded.")); };
      video.addEventListener("loadedmetadata", ready);
      video.addEventListener("error", failed);
      timeout = window.setTimeout(() => { cleanup(); reject(new Error("Camera preview timed out.")); }, 6000);
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) ready();
    });
    await video.play();
    if (!video.videoWidth || !video.videoHeight) throw new Error("The camera started without a usable video frame.");
    setCameraReady(true);
    settleUntilRef.current = Date.now() + 1400;
  }

  async function startCamera(requestedFacing: CameraFacing = facing) {
    if (cameraStarting) return;
    if (!navigator.mediaDevices?.getUserMedia) { setMessage("Camera access is unavailable. Upload a portrait instead."); return; }
    setCameraStarting(true);
    setMessage(requestedFacing === "environment" ? "Starting rear camera…" : "Starting front camera…");
    releaseStream();
    setCameraOpen(true);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: requestedFacing }, width: { ideal: 1280 }, height: { ideal: 1600 } }, audio: false });
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        if (name !== "OverconstrainedError" && name !== "NotFoundError") throw error;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      const actualFacing = stream.getVideoTracks()[0]?.getSettings().facingMode;
      setFacing(actualFacing === "user" || actualFacing === "environment" ? actualFacing : requestedFacing);
      await attachAndPlay(stream);
      setMessage("Camera ready. Automatic capture will wait for a clear, steady face. Use Capture now whenever you prefer.");
    } catch (error) {
      releaseStream();
      setCameraOpen(false);
      setMessage(cameraErrorMessage(error));
    } finally {
      setCameraStarting(false);
    }
  }

  async function flipCamera() {
    const next: CameraFacing = facing === "environment" ? "user" : "environment";
    setFacing(next);
    await startCamera(next);
  }

  function stopCamera() {
    releaseStream();
    setCameraOpen(false);
    setCameraStarting(false);
  }

  function capture() {
    const video = videoRef.current;
    if (!cameraReady || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) { setMessage("The camera is still starting. Keep it open briefly and try again."); return; }
    void accept(video, video.videoWidth, video.videoHeight);
  }

  async function evaluateLiveFrame() {
    if (evaluatingRef.current || busy || !cameraReady || Date.now() < settleUntilRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
    evaluatingRef.current = true;
    try {
      if (!liveFrameLooksClear(video)) {
        stableFramesRef.current = 0;
        setMessage("Automatic capture is checking focus and lighting. Hold still in even light, or use Capture now.");
        return;
      }
      const FaceDetectorApi = (window as typeof window & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
      if (FaceDetectorApi) {
        const detector = new FaceDetectorApi({ fastMode: true, maxDetectedFaces: 2 });
        const faces = await detector.detect(video);
        if (faces.length !== 1) {
          stableFramesRef.current = 0;
          setMessage(faces.length ? "Keep only one person in the portrait guide." : "Move the face into the portrait guide.");
          return;
        }
        if (!faceIsWellPlaced(faces[0].boundingBox, video.videoWidth, video.videoHeight)) {
          stableFramesRef.current = 0;
          setMessage("Centre the face and move slightly closer.");
          return;
        }
      }
      stableFramesRef.current += 1;
      setMessage(stableFramesRef.current >= 3 ? "Clear and steady — capturing automatically…" : "Good position — hold still.");
      if (stableFramesRef.current >= 4) await accept(video, video.videoWidth, video.videoHeight);
    } catch {
      stableFramesRef.current = 0;
      setMessage("Automatic quality check could not confirm this frame. You can still use Capture now.");
    } finally {
      evaluatingRef.current = false;
    }
  }

  useEffect(() => {
    if (!cameraOpen || !cameraReady || busy) return;
    const timer = window.setInterval(() => { void evaluateLiveFrame(); }, 700);
    return () => window.clearInterval(timer);
  // evaluateLiveFrame intentionally reads current refs/state on each interval tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen, cameraReady, busy]);

  return <section className="photo-capture professional-portrait-capture">
    <div className="portrait-capture-layout">
      <div className="photo-preview-wrap portrait-preview-wrap">
        {preview ? <img src={preview} alt={`${staffName} portrait`} className="photo-preview" /> : <div className="photo-placeholder"><span>Staff portrait</span><small>Face centred · head &amp; shoulders</small></div>}
      </div>
      <div className="portrait-guidance"><strong>Official staff portrait</strong><p>The rear camera opens first so another staff member can take the portrait. Flip to selfie mode only when needed. Automatic capture waits for a clear, steady frame.</p><ul><li>Use a clear front-facing face.</li><li>Use even lighting and a simple background.</li><li>Avoid sunglasses, masks and strong shadows.</li></ul></div>
    </div>
    <div className="photo-controls">
      <button type="button" className="button secondary" onClick={() => cameraOpen ? stopCamera() : void startCamera()} disabled={busy || cameraStarting}><Camera size={15}/>{cameraOpen ? " Close camera" : cameraStarting ? " Starting…" : " Use camera"}</button>
      <label className="button secondary photo-upload"><ImageUp size={15}/> Upload portrait<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={upload} disabled={busy}/></label>
      {preview ? <button type="button" className="photo-remove" onClick={() => void save(null)} disabled={busy}><Trash2 size={14}/> Remove</button> : null}
    </div>
    {cameraOpen ? <div className="camera-panel portrait-camera-panel">
      <div className="portrait-camera-toolbar"><span>{facing === "environment" ? "Rear camera" : "Front camera"}</span><button type="button" className="button secondary portrait-camera-flip" onClick={() => void flipCamera()} disabled={busy || cameraStarting} aria-label="Switch between front and rear camera">↻ Flip camera</button></div>
      <div className="portrait-camera-stage"><video ref={videoRef} muted autoPlay playsInline className="camera-video" style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}/><div className="portrait-camera-guide" aria-hidden="true"><span/></div></div>
      <div className="portrait-camera-actions"><button type="button" className="button primary" onClick={capture} disabled={busy || !cameraReady || cameraStarting}>Capture now &amp; save portrait</button></div>
    </div> : null}
    {message ? <p className="photo-message" role="status">{message}</p> : null}
  </section>;
}
