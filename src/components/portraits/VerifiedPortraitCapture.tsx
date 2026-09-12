/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, CheckCircle2, RefreshCw, ShieldCheck, Smartphone, Upload } from "lucide-react";
import "@/components/students/student-photo-capture.css";

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

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access is blocked. Allow camera access for SukuuNova in your browser settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "That camera is not available on this device. Choose the other camera or use the device-camera fallback.";
  if (name === "NotReadableError" || name === "AbortError") return "The camera is busy in another app. Close other camera apps and try again.";
  return error instanceof Error && error.message ? error.message : "The camera could not start. Check camera permission and try again.";
}

function portraitCanvas(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
  const targetRatio = 4 / 5;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceWidth / sourceHeight > targetRatio) cropWidth = sourceHeight * targetRatio;
  else cropHeight = sourceWidth / targetRatio;
  const sx = Math.max(0, (sourceWidth - cropWidth) / 2);
  const sy = Math.max(0, (sourceHeight - cropHeight) / 2);
  const outputWidth = Math.min(720, Math.max(1, Math.round(cropWidth)));
  const outputHeight = Math.max(1, Math.round(outputWidth / targetRatio));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Portrait processing is unavailable in this browser.");
  context.drawImage(source, sx, sy, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
  return canvas;
}

function encodePortrait(canvas: HTMLCanvasElement) {
  for (let quality = 0.88; quality >= 0.5; quality -= 0.06) {
    const image = canvas.toDataURL("image/jpeg", quality);
    if (image.length <= 680_000) return image;
  }
  return canvas.toDataURL("image/jpeg", 0.46);
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
  if (mean < 38) return { ok: false, message: "More light is needed on the face." };
  if (mean > 228) return { ok: false, message: "The image is too bright. Move away from direct light." };
  let edge = 0;
  let samples = 0;
  for (let y = 1; y < sample.height; y += 1) {
    for (let x = 1; x < sample.width; x += 1) {
      const i = y * sample.width + x;
      edge += Math.abs(grey[i] - grey[i - 1]) + Math.abs(grey[i] - grey[i - sample.width]);
      samples += 2;
    }
  }
  if (edge / Math.max(1, samples) < 2.8) return { ok: false, message: "Hold still while the camera focuses." };
  return { ok: true, message: "" };
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
  const validFramesRef = useRef(0);
  const settleUntilRef = useRef(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [checks, setChecks] = useState<VerificationCheck[]>([]);
  const [status, setStatus] = useState("Ready for verified face capture");
  const [message, setMessage] = useState("Rear camera is recommended when a staff member is photographing someone else.");
  const [usingCandidate, setUsingCandidate] = useState(false);

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    validFramesRef.current = 0;
    setCameraReady(false);
  }

  useEffect(() => () => releaseStream(), []);

  function closeCamera() {
    releaseStream();
    setCameraOpen(false);
    setCameraStarting(false);
  }

  async function waitForVideoElement() {
    for (let attempt = 0; attempt < 18; attempt += 1) {
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
    settleUntilRef.current = Date.now() + 1200;
    setCameraReady(true);
  }

  async function startCamera(requestedFacing: CameraFacing) {
    if (cameraStarting || busy) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Live camera unavailable in this browser");
      setMessage("Use the device-camera fallback below. The image will still be verified before it can be accepted.");
      return;
    }
    setCameraStarting(true);
    setCandidate(null);
    setChecks([]);
    validFramesRef.current = 0;
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
            width: { ideal: 1280 },
            height: { ideal: 1600 },
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
      setStatus("Looking for one verification-ready face");
      setMessage("Centre one face in the oval, look straight at the camera and hold still. SukuuNova will not capture until the server confirms a usable face.");
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
    try {
      if (mode !== "auto") {
        setStatus("Verifying face…");
        setMessage("Checking face presence, position, head angle, eyes, occlusion, lighting and sharpness.");
      }
      const response = await fetch("/api/school/portrait/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, image }),
      });
      const payload = await response.json() as VerificationPayload;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Face verification could not be completed.");
      setChecks(payload.checks ?? []);
      if (!payload.ok || !payload.biometricReady || !payload.verificationToken) {
        validFramesRef.current = 0;
        setStatus("Face not ready yet");
        setMessage(payload.message ?? "Improve the face position or image quality and try again.");
        return;
      }

      if (mode === "auto") {
        validFramesRef.current += 1;
        if (validFramesRef.current < 2) {
          setStatus("Face verified — hold still once more");
          setMessage("One verification-ready frame passed. SukuuNova is confirming a second stable frame before auto-capture.");
          return;
        }
      }

      validFramesRef.current = 0;
      setCandidate({ image, token: payload.verificationToken });
      setStatus("Verified face captured");
      setMessage("Review this biometric-ready portrait. Choose Use this photo to accept it, or Retry to take another one.");
      closeCamera();
    } catch (error) {
      validFramesRef.current = 0;
      setStatus(mode === "auto" ? "Verification check paused" : "Face was not accepted");
      setMessage(error instanceof Error ? error.message : "Face verification could not be completed.");
    } finally {
      validatingRef.current = false;
    }
  }

  async function autoEvaluate() {
    if (validatingRef.current || candidate || !cameraReady || Date.now() < settleUntilRef.current || busy) return;
    try {
      const image = currentFrame();
      await verifyImage(image, "auto");
    } catch (error) {
      validFramesRef.current = 0;
      setStatus("Preparing a better frame");
      setMessage(error instanceof Error ? error.message : "Hold still in even lighting.");
    }
  }

  useEffect(() => {
    if (!cameraOpen || !cameraReady || candidate || busy) return;
    const timer = window.setInterval(() => { void autoEvaluate(); }, 1400);
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

  async function useCandidate() {
    if (!candidate || usingCandidate || busy) return;
    setUsingCandidate(true);
    try {
      await onUse(candidate.image, candidate.token);
      setCandidate(null);
      setStatus("Verified portrait accepted");
      setMessage("This portrait passed the face-verification checks and is ready to be used as the official profile image.");
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
    setMessage("Choose Rear camera or Selfie camera and SukuuNova will verify the next capture again.");
    void startCamera(facing);
  }

  const displayImage = candidate?.image || value || "";
  const locked = busy || usingCandidate || cameraStarting;

  return <section className="photo-capture professional-portrait-capture verified-portrait-capture">
    <div className="verified-portrait-heading">
      <div><span className="verified-portrait-eyebrow"><ShieldCheck size={14}/> Server-verified capture</span><strong>Biometric-ready {subjectLabel} portrait</strong><p>Automatic capture is accepted only after SukuuNova confirms exactly one usable face. Nothing is saved until you approve the preview.</p></div>
      <span className={candidate ? "verified-portrait-badge ready" : "verified-portrait-badge"}>{candidate ? "Verified · review" : "Waiting for verified face"}</span>
    </div>

    {!cameraOpen ? <div className="portrait-capture-layout">
      <div className="photo-preview-wrap portrait-preview-wrap">
        {displayImage ? <img src={displayImage} alt={`${subjectLabel} portrait preview`} className="photo-preview" /> : <div className="photo-placeholder"><Camera size={28}/><span>No verified portrait yet</span><small>Use the rear or selfie camera below</small></div>}
      </div>
      <div className="portrait-guidance">
        <strong>{candidate ? "Review before saving" : "For reliable face recognition"}</strong>
        {candidate ? <p>This image has passed face-presence and biometric-quality checks. Make sure you are happy with the expression and framing before accepting it.</p> : <p>Use a full, front-facing head-and-shoulders view in even light. The system checks the face itself, not just whether the image is bright or sharp.</p>}
        <ul><li>Only one person in the frame.</li><li>Face looking forward with both eyes visible.</li><li>No mask, dark sunglasses, hand or object covering the face.</li><li>Keep the head and shoulders inside the guide.</li></ul>
      </div>
    </div> : null}

    {candidate ? <div className="verified-portrait-review-actions">
      <button type="button" className="button primary" onClick={() => void useCandidate()} disabled={locked}><CheckCircle2 size={16}/>{usingCandidate || busy ? " Saving…" : " Use this photo"}</button>
      <button type="button" className="button secondary" onClick={retryCandidate} disabled={locked}><RefreshCw size={16}/> Retry</button>
    </div> : <div className="verified-camera-launchers">
      <button type="button" className="button primary" onClick={() => void startCamera("environment")} disabled={locked}><Camera size={16}/> Rear camera</button>
      <button type="button" className="button secondary" onClick={() => void startCamera("user")} disabled={locked}><Smartphone size={16}/> Selfie camera</button>
      {allowFileFallback ? <label className="button secondary photo-upload"><Upload size={16}/> Device-camera fallback<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={fileFallback} disabled={locked}/></label> : null}
      {value && onRemove ? <button type="button" className="photo-remove" onClick={() => void onRemove()} disabled={locked}>{removeLabel}</button> : null}
    </div>}

    {cameraOpen ? <div className="camera-panel portrait-camera-panel verified-camera-panel">
      <div className="portrait-camera-toolbar verified-camera-toolbar">
        <div><span className="live-dot"/> {facing === "environment" ? "Rear camera" : "Selfie camera"}</div>
        <div className="verified-camera-switcher" role="group" aria-label="Choose camera">
          <button type="button" className={facing === "environment" ? "active" : ""} onClick={() => void startCamera("environment")} disabled={locked}>Rear</button>
          <button type="button" className={facing === "user" ? "active" : ""} onClick={() => void startCamera("user")} disabled={locked}>Selfie</button>
        </div>
      </div>
      <div className="portrait-camera-stage verified-camera-stage">
        <video ref={videoRef} muted autoPlay playsInline className="camera-video" style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}/>
        <div className="portrait-camera-guide verified-face-guide" aria-hidden="true"><span/><small>Face inside oval · head &amp; shoulders visible</small></div>
        <div className="verified-camera-status-overlay"><strong>{status}</strong><span>{validatingRef.current ? "Checking…" : "Auto verification on"}</span></div>
      </div>
      <div className="portrait-camera-actions verified-camera-actions">
        <button type="button" className="button primary" onClick={() => void captureNow()} disabled={!cameraReady || locked}>Verify &amp; capture now</button>
        <button type="button" className="button secondary" onClick={closeCamera} disabled={locked}>Close camera</button>
      </div>
    </div> : null}

    <div className="verified-portrait-status" role="status"><strong>{status}</strong><span>{message}</span></div>
    {checks.length ? <div className="portrait-quality-grid verified-quality-grid" aria-label="Face verification checks">{checks.map((check) => <div key={check.key} className={check.passed ? "passed" : "failed"}><span>{check.passed ? "✓" : "!"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div> : null}
  </section>;
}
