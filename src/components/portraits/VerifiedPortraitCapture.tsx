/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Camera, CheckCircle2, RefreshCw, ShieldCheck, Smartphone, Upload, X } from "lucide-react";
import "@/components/students/student-photo-capture.css";
import "@/components/portraits/verified-portrait-capture.css";

type PortraitTarget = "student" | "staff";
type CameraFacing = "user" | "environment";

type VerificationCheck = {
  key: "face" | "position" | "pose" | "eyes" | "occlusion" | "quality";
  label: string;
  passed: boolean;
  detail: string;
};

type VerificationPayload = {
  ok?: boolean;
  biometricReady?: boolean;
  message?: string;
  checks?: VerificationCheck[];
  verificationToken?: string | null;
  error?: string;
};

type Candidate = {
  image: string;
  token: string;
};

type Props = {
  target: PortraitTarget;
  subjectLabel: string;
  value?: string | null;
  onUse: (image: string, verificationToken: string) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
  removeLabel?: string;
  allowFileFallback?: boolean;
  busy?: boolean;
};

type FrameSignal = {
  qualityOk: boolean;
  stable: boolean;
  message: string;
  grey: Float32Array;
};

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access is blocked. Allow camera access for SukuuNova in your browser settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "That camera is not available on this device. Switch cameras or use the device-camera fallback.";
  if (name === "NotReadableError" || name === "AbortError") return "The camera is busy in another app. Close other camera apps and try again.";
  return error instanceof Error && error.message ? error.message : "The camera could not start. Check camera permission and try again.";
}

function cropRect(sourceWidth: number, sourceHeight: number) {
  const targetRatio = 4 / 5;
  let width = sourceWidth;
  let height = sourceHeight;
  if (sourceWidth / sourceHeight > targetRatio) width = sourceHeight * targetRatio;
  else height = sourceWidth / targetRatio;
  return {
    sx: Math.max(0, (sourceWidth - width) / 2),
    sy: Math.max(0, (sourceHeight - height) / 2),
    width,
    height,
  };
}

function portraitCanvas(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
  const crop = cropRect(sourceWidth, sourceHeight);
  const outputWidth = Math.min(720, Math.max(1, Math.round(crop.width)));
  const outputHeight = Math.max(1, Math.round(outputWidth / (4 / 5)));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Portrait processing is unavailable in this browser.");
  context.drawImage(source, crop.sx, crop.sy, crop.width, crop.height, 0, 0, outputWidth, outputHeight);
  return canvas;
}

function encodePortrait(canvas: HTMLCanvasElement) {
  for (let quality = 0.9; quality >= 0.54; quality -= 0.06) {
    const image = canvas.toDataURL("image/jpeg", quality);
    if (image.length <= 680_000) return image;
  }
  return canvas.toDataURL("image/jpeg", 0.5);
}

function localFrameQuality(canvas: HTMLCanvasElement) {
  if (canvas.width < 480 || canvas.height < 480) return { ok: false, message: "Camera resolution is too low for verification." };
  const sample = document.createElement("canvas");
  sample.width = 96;
  sample.height = 120;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return { ok: true, message: "" };
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
  if (mean < 36) return { ok: false, message: "Move into better light so the face is clearly visible." };
  if (mean > 230) return { ok: false, message: "Move away from strong direct light." };
  let edge = 0;
  let samples = 0;
  for (let y = 1; y < sample.height; y += 1) {
    for (let x = 1; x < sample.width; x += 1) {
      const i = y * sample.width + x;
      edge += Math.abs(grey[i] - grey[i - 1]) + Math.abs(grey[i] - grey[i - sample.width]);
      samples += 2;
    }
  }
  if (edge / Math.max(1, samples) < 2.6) return { ok: false, message: "Hold the camera steady while it focuses." };
  return { ok: true, message: "" };
}

function liveFrameSignal(video: HTMLVideoElement, previous: Float32Array | null): FrameSignal {
  const crop = cropRect(video.videoWidth, video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 90;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { qualityOk: true, stable: true, message: "Hold steady for automatic capture.", grey: new Float32Array(0) };
  context.drawImage(video, crop.sx, crop.sy, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const grey = new Float32Array(canvas.width * canvas.height);
  let sum = 0;
  let edge = 0;
  let edgeSamples = 0;
  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const value = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    grey[pixel] = value;
    sum += value;
  }
  const mean = sum / Math.max(1, grey.length);
  if (mean < 34) return { qualityOk: false, stable: false, message: "More light is needed.", grey };
  if (mean > 232) return { qualityOk: false, stable: false, message: "Move away from direct light.", grey };
  for (let y = 1; y < canvas.height; y += 1) {
    for (let x = 1; x < canvas.width; x += 1) {
      const i = y * canvas.width + x;
      edge += Math.abs(grey[i] - grey[i - 1]) + Math.abs(grey[i] - grey[i - canvas.width]);
      edgeSamples += 2;
    }
  }
  if (edge / Math.max(1, edgeSamples) < 2.35) return { qualityOk: false, stable: false, message: "Hold steady while the camera focuses.", grey };
  if (!previous || previous.length !== grey.length) return { qualityOk: true, stable: false, message: "Hold steady for automatic capture.", grey };
  let motion = 0;
  for (let index = 0; index < grey.length; index += 1) motion += Math.abs(grey[index] - previous[index]);
  const motionScore = motion / grey.length;
  return {
    qualityOk: true,
    stable: motionScore <= 6.5,
    message: motionScore <= 6.5 ? "Hold steady — SukuuNova is checking the face." : "Keep the camera still for a moment.",
    grey,
  };
}

function imageFromFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose an image from the camera or photo library."));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error("Choose an image smaller than 10 MB."));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        resolve(encodePortrait(portraitCanvas(image, image.naturalWidth, image.naturalHeight)));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be loaded."));
    };
    image.src = url;
  });
}

export function VerifiedPortraitCapture({
  target,
  subjectLabel,
  value,
  onUse,
  onRemove,
  removeLabel = "Remove portrait",
  allowFileFallback = true,
  busy = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const validatingRef = useRef(false);
  const settleUntilRef = useRef(0);
  const previousScanRef = useRef<Float32Array | null>(null);
  const steadySamplesRef = useRef(0);
  const lastServerAttemptRef = useRef(0);
  const feedbackUntilRef = useRef(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [checks, setChecks] = useState<VerificationCheck[]>([]);
  const [status, setStatus] = useState("Ready for fast automatic face capture");
  const [message, setMessage] = useState("Open the camera. SukuuNova will capture automatically as soon as one clear biometric-ready face is stable.");
  const [usingCandidate, setUsingCandidate] = useState(false);

  function resetScanner() {
    previousScanRef.current = null;
    steadySamplesRef.current = 0;
    lastServerAttemptRef.current = 0;
    feedbackUntilRef.current = 0;
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    resetScanner();
    setCameraReady(false);
    setChecking(false);
  }

  useEffect(() => () => releaseStream(), []);

  useEffect(() => {
    if (!cameraOpen && !candidate) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [cameraOpen, candidate]);

  function closeCamera() {
    releaseStream();
    setCameraOpen(false);
    setCameraStarting(false);
  }

  async function waitForVideoElement() {
    for (let attempt = 0; attempt < 24; attempt += 1) {
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
      timeout = window.setTimeout(() => { cleanup(); reject(new Error("Camera preview timed out.")); }, 8000);
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) ready();
    });
    await video.play();
    if (!video.videoWidth || !video.videoHeight) throw new Error("The camera started without a usable video frame.");
    settleUntilRef.current = Date.now() + 700;
    setCameraReady(true);
  }

  async function startCamera(requestedFacing: CameraFacing) {
    if (cameraStarting || busy) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Live camera unavailable in this browser");
      setMessage("Use the device-camera fallback. The resulting image will still need to pass server verification.");
      return;
    }
    setCameraStarting(true);
    setCandidate(null);
    setChecks([]);
    resetScanner();
    setFacing(requestedFacing);
    setStatus(requestedFacing === "environment" ? "Starting rear camera…" : "Starting selfie camera…");
    setMessage("Allow camera access when your browser asks.");
    releaseStream();
    setCameraOpen(true);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: requestedFacing },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
            frameRate: { ideal: 30 },
          },
        });
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        if (name !== "OverconstrainedError" && name !== "NotFoundError") throw error;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      const actualFacing = stream.getVideoTracks()[0]?.getSettings().facingMode;
      if (actualFacing === "user" || actualFacing === "environment") setFacing(actualFacing);
      await attachAndPlay(stream);
      setStatus("Automatic face capture is active");
      setMessage("Keep one face and the shoulders clearly visible. There is no oval to fit — just look toward the camera and hold still briefly.");
    } catch (error) {
      releaseStream();
      setCameraOpen(false);
      setStatus("Camera could not start");
      setMessage(cameraErrorMessage(error));
    } finally {
      setCameraStarting(false);
    }
  }

  function currentFrame() {
    const video = videoRef.current;
    if (!cameraReady || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      throw new Error("The camera is still preparing. Keep it open briefly and try again.");
    }
    const canvas = portraitCanvas(video, video.videoWidth, video.videoHeight);
    const local = localFrameQuality(canvas);
    if (!local.ok) throw new Error(local.message);
    return encodePortrait(canvas);
  }

  async function verifyImage(image: string, mode: "auto" | "manual" | "fallback") {
    if (validatingRef.current || busy || candidate) return;
    validatingRef.current = true;
    setChecking(true);
    setStatus("Checking biometric readiness…");
    setMessage("Confirming one face, visibility, position, head angle, eyes, lighting and sharpness.");
    try {
      const response = await fetch("/api/school/portrait/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, image }),
      });
      const payload = await response.json() as VerificationPayload;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Face verification could not be completed.");
      setChecks(payload.checks ?? []);
      if (!payload.ok || !payload.biometricReady || !payload.verificationToken) {
        feedbackUntilRef.current = Date.now() + (mode === "auto" ? 850 : 0);
        steadySamplesRef.current = 0;
        setStatus("Keep the camera open");
        setMessage(payload.message ?? "Adjust slightly and SukuuNova will try again automatically.");
        return;
      }

      setCandidate({ image, token: payload.verificationToken });
      setStatus("Verified face captured");
      setMessage("Review the portrait, then use it to continue registration or retry immediately.");
      closeCamera();
    } catch (error) {
      steadySamplesRef.current = 0;
      feedbackUntilRef.current = Date.now() + (mode === "auto" ? 900 : 0);
      setStatus(mode === "auto" ? "Automatic verification will retry" : "Face was not accepted");
      setMessage(error instanceof Error ? error.message : "Face verification could not be completed.");
    } finally {
      validatingRef.current = false;
      setChecking(false);
    }
  }

  async function autoEvaluate() {
    if (validatingRef.current || candidate || !cameraReady || Date.now() < settleUntilRef.current || busy) return;
    if (Date.now() < feedbackUntilRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;

    const signal = liveFrameSignal(video, previousScanRef.current);
    previousScanRef.current = signal.grey;
    if (!signal.qualityOk) {
      steadySamplesRef.current = 0;
      setStatus("Preparing a clear frame");
      setMessage(signal.message);
      return;
    }
    if (!signal.stable) {
      steadySamplesRef.current = 0;
      setStatus("Automatic capture is watching");
      setMessage(signal.message);
      return;
    }

    steadySamplesRef.current += 1;
    setStatus("Hold still — almost ready");
    setMessage("The frame is stable. SukuuNova is selecting a clean frame for face verification.");
    if (steadySamplesRef.current < 3 || Date.now() - lastServerAttemptRef.current < 700) return;

    lastServerAttemptRef.current = Date.now();
    try {
      await verifyImage(currentFrame(), "auto");
    } catch (error) {
      steadySamplesRef.current = 0;
      feedbackUntilRef.current = Date.now() + 700;
      setStatus("Preparing another frame");
      setMessage(error instanceof Error ? error.message : "Hold still in even lighting.");
    }
  }

  useEffect(() => {
    if (!cameraOpen || !cameraReady || candidate || busy) return;
    const timer = window.setInterval(() => { void autoEvaluate(); }, 180);
    return () => window.clearInterval(timer);
  // autoEvaluate intentionally reads the newest refs/state on each tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen, cameraReady, candidate, busy]);

  async function captureNow() {
    try {
      await verifyImage(currentFrame(), "manual");
    } catch (error) {
      setStatus("Frame not ready");
      setMessage(error instanceof Error ? error.message : "Hold still and try again.");
    }
  }

  async function fileFallback(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const image = await imageFromFile(file);
      setCandidate(null);
      setChecks([]);
      await verifyImage(image, "fallback");
    } catch (error) {
      setStatus("Image not accepted");
      setMessage(error instanceof Error ? error.message : "This image could not be verified.");
    }
  }

  async function acceptCandidate() {
    if (!candidate || usingCandidate || busy) return;
    setUsingCandidate(true);
    try {
      await onUse(candidate.image, candidate.token);
      setCandidate(null);
      setStatus("Verified portrait accepted");
      setMessage("The verified portrait is attached. Continue the registration form.");
    } catch (error) {
      setStatus("Portrait could not be saved");
      setMessage(error instanceof Error ? error.message : "Could not save this portrait.");
    } finally {
      setUsingCandidate(false);
    }
  }

  function retryCandidate() {
    setCandidate(null);
    setChecks([]);
    setStatus("Ready to retry");
    setMessage("The camera will reopen and capture automatically when the face is ready.");
    void startCamera(facing);
  }

  const displayImage = candidate?.image || value || "";
  const locked = busy || usingCandidate || cameraStarting;
  const portalReady = typeof document !== "undefined";

  const cameraScreen = cameraOpen && portalReady ? createPortal(
    <div className="sukuunova-camera-screen" role="dialog" aria-modal="true" aria-label={`Capture ${subjectLabel} portrait`}>
      <div className="sukuunova-camera-topbar">
        <button type="button" className="sukuunova-camera-icon-button" onClick={closeCamera} disabled={locked} aria-label="Close camera"><X size={20}/></button>
        <div className="sukuunova-camera-title"><strong>Automatic biometric portrait</strong><span>Full-screen camera · one clear face · automatic capture</span></div>
        <button
          type="button"
          className="sukuunova-camera-icon-button"
          onClick={() => void startCamera(facing === "user" ? "environment" : "user")}
          disabled={locked}
          aria-label={facing === "user" ? "Switch to rear camera" : "Switch to selfie camera"}
        >{facing === "user" ? <Camera size={20}/> : <Smartphone size={20}/>}</button>
      </div>
      <div className="sukuunova-camera-viewport">
        <video ref={videoRef} muted autoPlay playsInline className={`sukuunova-camera-video${facing === "user" ? " selfie" : ""}`}/>
        <div className="sukuunova-camera-capture-zone" aria-hidden="true"/>
        <div className={`sukuunova-camera-progress${checking ? " checking" : ""}`}><span className="sukuunova-camera-progress-dot"/>{checking ? "Verifying face…" : "Auto capture active"}</div>
        <div className="sukuunova-camera-live-status" role="status"><strong>{status}</strong><span>{message}</span></div>
      </div>
      <div className="sukuunova-camera-bottombar">
        <button type="button" className="sukuunova-camera-action" onClick={() => void startCamera(facing === "user" ? "environment" : "user")} disabled={locked}>{facing === "user" ? "Use rear camera" : "Use selfie camera"}</button>
        <button type="button" className="sukuunova-camera-action primary" onClick={() => void captureNow()} disabled={!cameraReady || locked}>Capture now</button>
      </div>
    </div>,
    document.body,
  ) : null;

  const reviewScreen = candidate && portalReady ? createPortal(
    <div className="sukuunova-portrait-review-screen" role="dialog" aria-modal="true" aria-label="Review verified portrait">
      <div className="sukuunova-review-heading"><strong>Verified portrait captured</strong><span>Check the photo, then continue registration or retry.</span></div>
      <div className="sukuunova-review-photo-wrap"><img src={candidate.image} alt={`${subjectLabel} verified portrait`} className="sukuunova-review-photo"/></div>
      <div className="sukuunova-review-actions">
        <button type="button" className="sukuunova-camera-action" onClick={retryCandidate} disabled={locked}><RefreshCw size={16}/> Retry</button>
        <button type="button" className="sukuunova-camera-action primary" onClick={() => void acceptCandidate()} disabled={locked}><CheckCircle2 size={16}/>{usingCandidate || busy ? " Saving…" : " Use photo & continue"}</button>
      </div>
    </div>,
    document.body,
  ) : null;

  return <section className="photo-capture professional-portrait-capture verified-portrait-capture">
    <div className="verified-portrait-heading">
      <div><span className="verified-portrait-eyebrow"><ShieldCheck size={14}/> Fast verified capture</span><strong>Biometric-ready {subjectLabel} portrait</strong><p>Open the full-screen camera and look toward it naturally. SukuuNova automatically chooses a stable frame and only accepts it after server face verification.</p></div>
      <span className={candidate ? "verified-portrait-badge ready" : "verified-portrait-badge"}>{candidate ? "Verified · review" : "Automatic capture ready"}</span>
    </div>

    <div className="portrait-capture-layout">
      <div className="photo-preview-wrap portrait-preview-wrap">
        {displayImage ? <img src={displayImage} alt={`${subjectLabel} portrait preview`} className="photo-preview" /> : <div className="photo-placeholder"><Camera size={28}/><span>No verified portrait yet</span><small>Full-screen automatic capture is ready</small></div>}
      </div>
      <div className="portrait-guidance">
        <strong>Easy framing — no face oval</strong>
        <p>Keep one person visible from the head through the shoulders. The guide is deliberately wide so the user does not have to force their face into a small shape.</p>
        <ul><li>Look toward the camera with both eyes visible.</li><li>Use even light and keep the camera steady briefly.</li><li>Remove masks, dark sunglasses or anything covering the face.</li><li>SukuuNova captures automatically once the image is verification-ready.</li></ul>
      </div>
    </div>

    <div className="verified-camera-launchers">
      <button type="button" className="button primary" onClick={() => void startCamera("environment")} disabled={locked}><Camera size={16}/> Open rear camera</button>
      <button type="button" className="button secondary" onClick={() => void startCamera("user")} disabled={locked}><Smartphone size={16}/> Open selfie camera</button>
      {allowFileFallback ? <label className="button secondary photo-upload"><Upload size={16}/> Device-camera fallback<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={fileFallback} disabled={locked}/></label> : null}
      {value && onRemove ? <button type="button" className="photo-remove" onClick={() => void onRemove()} disabled={locked}>{removeLabel}</button> : null}
    </div>

    <p className="sukuunova-capture-note">Automatic capture uses rapid local stability and image-quality checks to avoid unnecessary network delay; the accepted frame still has to pass SukuuNova's server verification before it can be saved.</p>
    <div className="verified-portrait-status" role="status"><strong>{status}</strong><span>{message}</span></div>
    {checks.length && !candidate ? <div className="portrait-quality-grid verified-quality-grid" aria-label="Face verification checks">{checks.map((check) => <div key={check.key} className={check.passed ? "passed" : "failed"}><span>{check.passed ? "✓" : "!"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div> : null}
    {cameraScreen}
    {reviewScreen}
  </section>;
}
