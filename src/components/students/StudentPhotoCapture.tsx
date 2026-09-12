/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import "./student-photo-capture.css";

type QualityCheck = {
  key: "resolution" | "lighting" | "contrast" | "sharpness";
  label: string;
  passed: boolean;
  detail: string;
};

type PortraitResult = {
  dataUrl: string;
  checks: QualityCheck[];
  width: number;
  height: number;
};

type CameraFacing = "user" | "environment";
type FaceBox = { x: number; y: number; width: number; height: number };
type FaceDetectorInstance = { detect: (source: CanvasImageSource) => Promise<Array<{ boundingBox: FaceBox }>> };
type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorInstance;

function cropPortrait(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
  const targetRatio = 4 / 5;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceWidth / sourceHeight > targetRatio) cropWidth = sourceHeight * targetRatio;
  else cropHeight = sourceWidth / targetRatio;
  const sx = Math.max(0, (sourceWidth - cropWidth) / 2);
  const sy = Math.max(0, (sourceHeight - cropHeight) / 2);
  const maxWidth = 720;
  const outputWidth = Math.min(maxWidth, Math.max(1, Math.round(cropWidth)));
  const outputHeight = Math.max(1, Math.round(outputWidth / targetRatio));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Photo processing is unavailable in this browser.");
  context.drawImage(source, sx, sy, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
  return canvas;
}

function analysePortrait(canvas: HTMLCanvasElement, sourceWidth: number, sourceHeight: number): QualityCheck[] {
  const sample = document.createElement("canvas");
  sample.width = 96;
  sample.height = 120;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Photo quality checks are unavailable in this browser.");
  context.drawImage(canvas, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  const grey = new Float32Array(sample.width * sample.height);
  let sum = 0;
  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const value = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    grey[pixel] = value;
    sum += value;
  }
  const mean = sum / grey.length;
  let variance = 0;
  let edge = 0;
  let edgeSamples = 0;
  for (let y = 1; y < sample.height; y += 1) {
    for (let x = 1; x < sample.width; x += 1) {
      const i = y * sample.width + x;
      const value = grey[i];
      variance += (value - mean) ** 2;
      edge += Math.abs(value - grey[i - 1]) + Math.abs(value - grey[i - sample.width]);
      edgeSamples += 2;
    }
  }
  const contrast = Math.sqrt(variance / Math.max(1, grey.length - 1));
  const sharpness = edge / Math.max(1, edgeSamples);
  const enoughResolution = sourceWidth >= 480 && sourceHeight >= 480;
  return [
    { key: "resolution", label: "Resolution", passed: enoughResolution, detail: enoughResolution ? `${sourceWidth}×${sourceHeight} source` : "Move to a device with a clearer camera." },
    { key: "lighting", label: "Lighting", passed: mean >= 45 && mean <= 220, detail: mean < 45 ? "Face area is too dark." : mean > 220 ? "Image is overexposed." : "Exposure is usable." },
    { key: "contrast", label: "Contrast", passed: contrast >= 18, detail: contrast >= 18 ? "Facial detail has usable contrast." : "Move to clearer, more even lighting." },
    { key: "sharpness", label: "Sharpness", passed: sharpness >= 3.2, detail: sharpness >= 3.2 ? "Image detail is sufficiently sharp." : "Hold still and let the camera focus." },
  ];
}

function compressImage(source: HTMLCanvasElement, maxDataUrlLength = 700_000): string {
  for (let quality = 0.82; quality >= 0.46; quality -= 0.06) {
    const value = source.toDataURL("image/jpeg", quality);
    if (value.length <= maxDataUrlLength) return value;
  }
  return source.toDataURL("image/jpeg", 0.42);
}

function preparePortrait(source: CanvasImageSource, width: number, height: number): PortraitResult {
  const canvas = cropPortrait(source, width, height);
  const checks = analysePortrait(canvas, width, height);
  return { dataUrl: compressImage(canvas), checks, width: canvas.width, height: canvas.height };
}

function faceIsWellPlaced(box: FaceBox, width: number, height: number) {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const horizontalOffset = Math.abs(centerX - width / 2) / width;
  const verticalOffset = Math.abs(centerY - height * 0.43) / height;
  const faceRatio = (box.width * box.height) / Math.max(1, width * height);
  return horizontalOffset <= 0.14 && verticalOffset <= 0.18 && faceRatio >= 0.06 && faceRatio <= 0.55;
}

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access is blocked. In iPhone Safari, allow Camera for this site, then tap Try camera again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "That camera is not available on this device. Try the other camera or reload this page.";
  if (name === "NotReadableError" || name === "AbortError") return "The camera is busy in another app or could not start. Close other camera apps and try again.";
  return "The camera could not start. Check camera permission and try again.";
}

export function StudentPhotoCapture() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stableFramesRef = useRef(0);
  const evaluatingRef = useRef(false);
  const settleUntilRef = useRef(0);
  const [photo, setPhoto] = useState("");
  const [checks, setChecks] = useState<QualityCheck[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [message, setMessage] = useState("");
  const [faceState, setFaceState] = useState("Camera not started");

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    stableFramesRef.current = 0;
    setCameraReady(false);
  }

  useEffect(() => () => releaseStream(), []);

  function stopCamera() {
    releaseStream();
    setCameraOpen(false);
    setCameraStarting(false);
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
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) { resolve(); return; }
      const timeout = window.setTimeout(() => reject(new Error("Camera preview timed out.")), 6000);
      const ready = () => { window.clearTimeout(timeout); resolve(); };
      video.addEventListener("loadedmetadata", ready, { once: true });
    });
    await video.play();
    if (!video.videoWidth || !video.videoHeight) throw new Error("The camera started without a usable video frame.");
    setCameraReady(true);
    settleUntilRef.current = Date.now() + 1400;
  }

  async function openCamera(requestedFacing: CameraFacing = facing) {
    if (cameraStarting) return;
    setCameraStarting(true);
    setMessage("");
    setChecks([]);
    stableFramesRef.current = 0;
    if (!navigator.mediaDevices?.getUserMedia) {
      setFaceState("Live camera unavailable");
      setMessage("Open SukuuNova in Safari or another camera-enabled browser on a secure HTTPS connection.");
      setCameraStarting(false);
      return;
    }
    releaseStream();
    setCameraOpen(true);
    setFaceState(requestedFacing === "environment" ? "Starting rear camera…" : "Starting front camera…");
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: requestedFacing }, width: { ideal: 1280 }, height: { ideal: 1600 } },
          audio: false,
        });
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        if (name !== "OverconstrainedError" && name !== "NotFoundError") throw error;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      const actualFacing = stream.getVideoTracks()[0]?.getSettings().facingMode;
      setFacing(actualFacing === "user" || actualFacing === "environment" ? actualFacing : requestedFacing);
      await attachAndPlay(stream);
      setFaceState("Camera ready — centre the learner and hold still");
      setMessage("Automatic capture starts after the camera focuses. Use Capture now if you want to take the photo yourself.");
    } catch (error) {
      releaseStream();
      setCameraOpen(false);
      setFaceState("Camera could not start");
      setMessage(cameraErrorMessage(error));
    } finally {
      setCameraStarting(false);
    }
  }

  async function flipCamera() {
    const next: CameraFacing = facing === "environment" ? "user" : "environment";
    setFacing(next);
    await openCamera(next);
  }

  function acceptPortrait(result: PortraitResult) {
    setChecks(result.checks);
    if (result.checks.every((check) => check.passed)) {
      setPhoto(result.dataUrl);
      setFaceState("Face captured and quality verified");
      setMessage("Portrait captured. This becomes the learner's canonical school photo; biometric device enrollment remains subject to the school's consent controls.");
      stopCamera();
      return true;
    }
    setMessage("The photo is not clear enough yet. Improve the failed checks, hold still, then try again.");
    return false;
  }

  function captureCurrentFrame() {
    const video = videoRef.current;
    if (!cameraReady || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setMessage("The camera is still preparing. Keep it open for a moment and try again.");
      return;
    }
    try {
      acceptPortrait(preparePortrait(video, video.videoWidth, video.videoHeight));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not capture this frame.");
    }
  }

  async function evaluateLiveFrame() {
    if (evaluatingRef.current || photo || !cameraReady || Date.now() < settleUntilRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
    evaluatingRef.current = true;
    try {
      const result = preparePortrait(video, video.videoWidth, video.videoHeight);
      setChecks(result.checks);
      if (!result.checks.every((check) => check.passed)) {
        stableFramesRef.current = 0;
        setFaceState("Improving focus, lighting and clarity…");
        return;
      }

      const FaceDetectorApi = (window as typeof window & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
      if (FaceDetectorApi) {
        const detector = new FaceDetectorApi({ fastMode: true, maxDetectedFaces: 2 });
        const faces = await detector.detect(video);
        if (faces.length !== 1) {
          stableFramesRef.current = 0;
          setFaceState(faces.length ? "Only one learner should be in view" : "Move the learner's face into the guide");
          return;
        }
        if (!faceIsWellPlaced(faces[0].boundingBox, video.videoWidth, video.videoHeight)) {
          stableFramesRef.current = 0;
          setFaceState("Centre the face and move slightly closer");
          return;
        }
      }

      stableFramesRef.current += 1;
      setFaceState(stableFramesRef.current >= 3 ? "Clear and steady — capturing…" : "Good position — hold still");
      if (stableFramesRef.current >= 4) acceptPortrait(result);
    } catch (error) {
      stableFramesRef.current = 0;
      setMessage(error instanceof Error ? error.message : "Live image quality verification is unavailable. Use Capture now.");
    } finally {
      evaluatingRef.current = false;
    }
  }

  useEffect(() => {
    if (!cameraOpen || !cameraReady || photo) return;
    const timer = window.setInterval(() => { void evaluateLiveFrame(); }, 650);
    return () => window.clearInterval(timer);
  // evaluateLiveFrame intentionally reads current refs/state on each interval tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen, cameraReady, photo]);

  return (
    <div className="photo-capture professional-portrait-capture">
      <div className="portrait-capture-layout">
        <div className="photo-preview-wrap portrait-preview-wrap">
          {photo ? <img src={photo} alt="Accepted student portrait preview" className="photo-preview" /> : <div className="photo-placeholder"><span>Live face capture</span><small>Face centred · head &amp; shoulders</small></div>}
        </div>
        <div className="portrait-guidance">
          <strong>Automatic face capture</strong>
          <p>The rear camera opens first so a staff member can photograph a learner. Flip to the front camera only when needed.</p>
          <ul>
            <li>Only the learner should be in the camera view.</li>
            <li>Remove sunglasses, masks and face-covering hats.</li>
            <li>Use even front lighting and keep the learner still.</li>
          </ul>
        </div>
      </div>

      <div className="photo-controls">
        {!photo ? <button type="button" className="button primary" onClick={() => (cameraOpen ? stopCamera() : void openCamera())} disabled={cameraStarting}>{cameraOpen ? "Stop camera" : cameraStarting ? "Starting camera…" : "Start live face capture"}</button> : <button type="button" className="photo-remove" onClick={() => { setPhoto(""); setChecks([]); setMessage(""); setFaceState("Ready to retake"); }}>Retake live photo</button>}
      </div>

      {cameraOpen ? <div className="camera-panel portrait-camera-panel">
        <div className="portrait-camera-toolbar">
          <span>{facing === "environment" ? "Rear camera" : "Front camera"}</span>
          <button type="button" className="button secondary portrait-camera-flip" onClick={() => void flipCamera()} disabled={cameraStarting} aria-label="Switch between front and rear camera">↻ Flip camera</button>
        </div>
        <div className="portrait-camera-stage">
          <video ref={videoRef} muted autoPlay playsInline className="camera-video" style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }} />
          <div className="portrait-camera-guide" aria-hidden="true"><span /></div>
        </div>
        <div className="portrait-camera-actions"><button type="button" className="button secondary" onClick={captureCurrentFrame} disabled={!cameraReady || cameraStarting}>Capture now</button></div>
        <div className="photo-message" role="status"><strong>{faceState}</strong><br /><span>{message || "Hold still until automatic capture completes."}</span></div>
      </div> : null}

      {checks.length ? <div className="portrait-quality-grid" aria-label="Portrait quality checks">{checks.map((check) => <div key={check.key} className={check.passed ? "passed" : "failed"}><span>{check.passed ? "✓" : "!"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div> : null}
      {!cameraOpen ? <p className="photo-message" role="status"><strong>{faceState}</strong>{message ? <><br /><span>{message}</span></> : null}</p> : null}
      <input type="hidden" name="photoData" value={photo} />
      <p className="field-help">Photo upload is disabled. Student portraits are captured from the live camera so the school has a trustworthy face image for the learner record and later controlled device enrollment.</p>
    </div>
  );
}
