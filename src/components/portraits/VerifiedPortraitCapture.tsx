/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Camera, CheckCircle2, RefreshCw, ShieldCheck, Smartphone, Upload, X } from "lucide-react";
import { createLocalFaceDetector, faceBoxesAreStable, type LocalFaceBox, type LocalFaceDetector } from "@/lib/browser-face-gate";
import "@/components/students/student-photo-capture.css";
import "@/components/portraits/verified-portrait-capture.css";

type PortraitTarget = "student" | "staff";
type CameraFacing = "user" | "environment";
type CaptureMode = "auto" | "local_auto" | "manual" | "fallback";
type LocalGateState = "loading" | "ready" | "unavailable";

type VerificationCheck = {
  key: "face" | "position" | "pose" | "eyes" | "occlusion" | "quality";
  label: string;
  passed: boolean;
  detail: string;
};

type VerificationPayload = {
  ok?: boolean;
  captureReady?: boolean;
  biometricReady?: boolean;
  verificationDeferred?: boolean;
  localFaceGate?: boolean;
  message?: string;
  checks?: VerificationCheck[];
  verificationToken?: string | null;
  error?: string;
};

type Candidate = { image: string; token: string; biometricReady: boolean; localFaceGated: boolean };

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
  if (name === "NotFoundError" || name === "OverconstrainedError") return "That camera is not available on this device. Switch cameras or use the device-camera fallback.";
  if (name === "NotReadableError" || name === "AbortError") return "The camera is busy in another app. Close other camera apps and try again.";
  return error instanceof Error && error.message ? error.message : "The camera could not start. Check camera permission and try again.";
}

function cropRect(sourceWidth: number, sourceHeight: number) {
  const ratio = 4 / 5;
  let width = sourceWidth;
  let height = sourceHeight;
  if (sourceWidth / sourceHeight > ratio) width = sourceHeight * ratio;
  else height = sourceWidth / ratio;
  return {
    sx: Math.max(0, (sourceWidth - width) / 2),
    sy: Math.max(0, (sourceHeight - height) / 2),
    width,
    height,
  };
}

function portraitCanvas(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
  const crop = cropRect(sourceWidth, sourceHeight);
  const outputWidth = Math.min(640, Math.max(1, Math.round(crop.width)));
  const outputHeight = Math.max(1, Math.round(outputWidth / (4 / 5)));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Portrait processing is unavailable in this browser.");
  context.drawImage(source, crop.sx, crop.sy, crop.width, crop.height, 0, 0, outputWidth, outputHeight);
  return canvas;
}

function encodePortrait(canvas: HTMLCanvasElement) {
  for (let quality = 0.86; quality >= 0.5; quality -= 0.06) {
    const image = canvas.toDataURL("image/jpeg", quality);
    if (image.length <= 620_000) return image;
  }
  return canvas.toDataURL("image/jpeg", 0.46);
}

function imageFromFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Choose an image from the camera or photo library."));
    if (file.size > 10 * 1024 * 1024) return reject(new Error("Choose an image smaller than 10 MB."));
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
  const localInspectingRef = useRef(false);
  const localDetectorRef = useRef<LocalFaceDetector | null>(null);
  const localDetectorPromiseRef = useRef<Promise<LocalFaceDetector> | null>(null);
  const stableFaceFramesRef = useRef(0);
  const lastFaceBoxRef = useRef<LocalFaceBox | null>(null);
  const settleUntilRef = useRef(0);
  const retryAfterRef = useRef(0);
  const lastAttemptRef = useRef(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [autoCapturePaused, setAutoCapturePaused] = useState(false);
  const [localGateState, setLocalGateState] = useState<LocalGateState>("loading");
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [checks, setChecks] = useState<VerificationCheck[]>([]);
  const [status, setStatus] = useState("Ready for face-gated auto capture");
  const [message, setMessage] = useState("Open the camera. SukuuNova will look for one well-framed face before automatic capture can fire.");
  const [usingCandidate, setUsingCandidate] = useState(false);

  const resetScanner = useCallback(() => {
    settleUntilRef.current = Date.now() + 650;
    retryAfterRef.current = 0;
    lastAttemptRef.current = 0;
    stableFaceFramesRef.current = 0;
    lastFaceBoxRef.current = null;
    setAutoCapturePaused(false);
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
    setChecking(false);
    localInspectingRef.current = false;
    stableFaceFramesRef.current = 0;
    lastFaceBoxRef.current = null;
  }, []);

  useEffect(() => () => {
    releaseStream();
    localDetectorRef.current?.close();
    localDetectorRef.current = null;
  }, [releaseStream]);

  useEffect(() => {
    if (!cameraOpen && !candidate) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [cameraOpen, candidate]);

  const closeCamera = useCallback(() => {
    releaseStream();
    setCameraOpen(false);
    setCameraStarting(false);
  }, [releaseStream]);

  const prepareLocalFaceGate = useCallback(async () => {
    if (localDetectorRef.current) {
      setLocalGateState("ready");
      return localDetectorRef.current;
    }
    if (localDetectorPromiseRef.current) return localDetectorPromiseRef.current;

    setLocalGateState("loading");
    setStatus("Preparing on-device face gate…");
    setMessage("The detector checks face presence and framing on this device. It does not identify the person or prove liveness.");
    const pending = createLocalFaceDetector();
    localDetectorPromiseRef.current = pending;
    try {
      const detector = await pending;
      localDetectorRef.current = detector;
      setLocalGateState("ready");
      setStatus("On-device face gate active");
      setMessage("Center one face and hold still. Automatic capture will fire only after the face stays well framed across several checks.");
      return detector;
    } catch (error) {
      setLocalGateState("unavailable");
      setStatus("On-device face gate unavailable");
      setMessage("SukuuNova will try the school's cloud face verifier. If that is unavailable too, the camera will remain open for manual Capture now.");
      throw error;
    } finally {
      localDetectorPromiseRef.current = null;
    }
  }, []);

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
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error("Camera preview could not be loaded."));
      };
      video.addEventListener("loadedmetadata", ready);
      video.addEventListener("error", failed);
      timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Camera preview timed out."));
      }, 8000);
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) ready();
    });
    await video.play();
    if (!video.videoWidth || !video.videoHeight) throw new Error("The camera started without a usable video frame.");
    resetScanner();
    setCameraReady(true);
  }

  async function startCamera(requestedFacing: CameraFacing) {
    if (cameraStarting || busy) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Live camera unavailable in this browser");
      setMessage("Use the device-camera fallback and choose a clear head-and-shoulders portrait.");
      return;
    }

    setCameraStarting(true);
    setCandidate(null);
    setChecks([]);
    setAutoCapturePaused(false);
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
      void prepareLocalFaceGate().catch(() => undefined);
    } catch (error) {
      releaseStream();
      setCameraOpen(false);
      setStatus("Camera could not start");
      setMessage(cameraErrorMessage(error));
    } finally {
      setCameraStarting(false);
    }
  }

  const currentFrame = useCallback(() => {
    const video = videoRef.current;
    if (!cameraReady || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      throw new Error("The camera is still preparing. Keep it open briefly and try again.");
    }
    const canvas = portraitCanvas(video, video.videoWidth, video.videoHeight);
    if (canvas.width < 320 || canvas.height < 400) throw new Error("Camera resolution is too low for a clear portrait.");
    return encodePortrait(canvas);
  }, [cameraReady]);

  const verifyImage = useCallback(async (image: string, mode: CaptureMode) => {
    if (validatingRef.current || busy) return;
    validatingRef.current = true;
    setChecking(true);
    const automatic = mode === "auto" || mode === "local_auto";
    setStatus(mode === "local_auto" ? "Confirming face-gated portrait…" : mode === "auto" ? "Checking for a usable face…" : "Capturing portrait…");
    setMessage(mode === "local_auto"
      ? "The on-device face gate chose this exact frame. SukuuNova is now applying the school's server-side verification policy."
      : mode === "auto"
        ? "Automatic capture will not save anything until face verification passes."
        : "Saving this exact portrait for registration.");

    try {
      const response = await fetch("/api/school/portrait/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, image, mode }),
      });
      const payload = await response.json() as VerificationPayload;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Portrait capture could not be completed.");
      setChecks(payload.checks ?? []);

      if (payload.verificationDeferred && mode === "auto") {
        setAutoCapturePaused(true);
        setStatus("Manual capture ready");
        setMessage("Both automatic face paths are unavailable on this device right now. Keep the face clearly framed, then tap Capture now. Nothing will be captured automatically.");
        return;
      }

      const captureReady = payload.captureReady ?? Boolean(payload.ok && payload.biometricReady);
      if (!captureReady || !payload.verificationToken) {
        retryAfterRef.current = Date.now() + (automatic ? 500 : 0);
        setStatus(automatic ? "Face not ready — still checking" : "Portrait not accepted");
        setMessage(payload.message ?? "Keep one face clearly visible and try again.");
        return;
      }

      const biometricReady = Boolean(payload.biometricReady);
      const localFaceGated = Boolean(payload.localFaceGate || (mode === "local_auto" && payload.verificationDeferred));
      setCandidate({ image, token: payload.verificationToken, biometricReady, localFaceGated });
      setStatus(biometricReady ? "Verified face captured" : localFaceGated ? "Face-gated portrait captured" : "Portrait captured manually");
      setMessage(payload.verificationDeferred
        ? localFaceGated
          ? "The on-device face-presence gate passed and this exact frame is signed for registration. Biometric identity verification remains deferred."
          : "Review the portrait carefully. Biometric verification will be completed later when the school's face service is available."
        : "Review the verified portrait, then use it to continue registration or retry.");
      closeCamera();
    } catch (error) {
      retryAfterRef.current = Date.now() + (automatic ? 650 : 0);
      setStatus(automatic ? "Automatic face check unavailable — trying safely" : "Portrait was not accepted");
      setMessage(error instanceof Error ? error.message : "Portrait capture could not be completed.");
    } finally {
      validatingRef.current = false;
      setChecking(false);
    }
  }, [busy, closeCamera, target]);

  const autoEvaluate = useCallback(async () => {
    if (!cameraReady || validatingRef.current || localInspectingRef.current || busy || autoCapturePaused) return;
    const now = Date.now();
    if (now < settleUntilRef.current || now < retryAfterRef.current || now - lastAttemptRef.current < 240) return;

    if (localGateState === "loading") return;

    if (localGateState === "ready" && localDetectorRef.current) {
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
      localInspectingRef.current = true;
      try {
        const result = localDetectorRef.current.inspect(video, performance.now());
        lastAttemptRef.current = now;
        if (!result.acceptable || !result.box) {
          stableFaceFramesRef.current = 0;
          lastFaceBoxRef.current = result.box;
          setStatus(result.faceCount > 1 ? "More than one face detected" : "Align face for automatic capture");
          setMessage(result.message);
          return;
        }

        const stable = faceBoxesAreStable(lastFaceBoxRef.current, result.box);
        lastFaceBoxRef.current = result.box;
        stableFaceFramesRef.current = stable ? Math.min(3, stableFaceFramesRef.current + 1) : 1;
        if (stableFaceFramesRef.current < 3) {
          setStatus(`Face found — hold still ${stableFaceFramesRef.current}/3`);
          setMessage("Keep the face centered. SukuuNova is waiting for a stable frame before capturing automatically.");
          return;
        }

        stableFaceFramesRef.current = 0;
        lastFaceBoxRef.current = null;
        await verifyImage(currentFrame(), "local_auto");
      } catch {
        setLocalGateState("unavailable");
        stableFaceFramesRef.current = 0;
        lastFaceBoxRef.current = null;
        retryAfterRef.current = Date.now() + 350;
        setStatus("On-device face gate unavailable");
        setMessage("SukuuNova will try the school's cloud face verifier next. Automatic capture still will not become timer-based.");
      } finally {
        localInspectingRef.current = false;
      }
      return;
    }

    // If the local detector cannot run, preserve the existing authoritative cloud
    // auto path. When that provider is unavailable too, the server pauses auto and
    // the operator must explicitly choose Capture now.
    try {
      lastAttemptRef.current = now;
      await verifyImage(currentFrame(), "auto");
    } catch (error) {
      retryAfterRef.current = Date.now() + 350;
      setStatus("Camera preparing");
      setMessage(error instanceof Error ? error.message : "Preparing the next frame.");
    }
  }, [autoCapturePaused, busy, cameraReady, currentFrame, localGateState, verifyImage]);

  useEffect(() => {
    if (!cameraOpen || !cameraReady || candidate || busy || autoCapturePaused) return;
    const timer = window.setInterval(() => {
      void autoEvaluate();
    }, 180);
    return () => window.clearInterval(timer);
  }, [autoCapturePaused, autoEvaluate, busy, cameraOpen, cameraReady, candidate]);

  async function captureNow() {
    try {
      await verifyImage(currentFrame(), "manual");
    } catch (error) {
      setStatus("Frame not ready");
      setMessage(error instanceof Error ? error.message : "Try again.");
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
      setMessage(error instanceof Error ? error.message : "This image could not be captured.");
    }
  }

  async function acceptCandidate() {
    if (!candidate || usingCandidate || busy) return;
    setUsingCandidate(true);
    try {
      await onUse(candidate.image, candidate.token);
      setCandidate(null);
      setStatus("Portrait accepted");
      setMessage("The portrait is attached. Continue registration.");
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
    setMessage("The camera will reopen and wait for a stable face before automatic capture.");
    void startCamera(facing);
  }

  const displayImage = candidate?.image || value || "";
  const locked = busy || usingCandidate || cameraStarting || checking;
  const portalReady = typeof document !== "undefined";

  const cameraScreen = cameraOpen && portalReady ? createPortal(
    <div className="sukuunova-camera-screen" role="dialog" aria-modal="true" aria-label={`Capture ${subjectLabel} portrait`}>
      <div className="sukuunova-camera-topbar">
        <button type="button" className="sukuunova-camera-icon-button" onClick={closeCamera} disabled={locked} aria-label="Close camera"><X size={20}/></button>
        <div className="sukuunova-camera-title">
          <strong>{autoCapturePaused ? "Manual portrait capture" : "Face-gated automatic capture"}</strong>
          <span>{autoCapturePaused ? "Full-screen camera · operator-confirmed frame" : "On-device face presence · stable-frame gate · server policy"}</span>
        </div>
        <button type="button" className="sukuunova-camera-icon-button" onClick={() => void startCamera(facing === "user" ? "environment" : "user")} disabled={locked} aria-label={facing === "user" ? "Switch to rear camera" : "Switch to selfie camera"}>{facing === "user" ? <Camera size={20}/> : <Smartphone size={20}/>}</button>
      </div>
      <div className="sukuunova-camera-viewport">
        <video ref={videoRef} muted autoPlay playsInline className={`sukuunova-camera-video${facing === "user" ? " selfie" : ""}`}/>
        <div className="sukuunova-camera-capture-zone" aria-hidden="true"/>
        <div className={`sukuunova-camera-progress${checking || localGateState === "loading" ? " checking" : ""}`}>
          <span className="sukuunova-camera-progress-dot"/>
          {checking ? "Confirming portrait…" : autoCapturePaused ? "Manual capture ready" : localGateState === "loading" ? "Loading face gate…" : localGateState === "ready" ? "On-device face gate active" : "Cloud face gate fallback"}
        </div>
        <div className="sukuunova-camera-live-status" role="status"><strong>{status}</strong><span>{message}</span></div>
      </div>
      <div className="sukuunova-camera-bottombar">
        <button type="button" className="sukuunova-camera-action" onClick={() => void startCamera(facing === "user" ? "environment" : "user")} disabled={locked}>{facing === "user" ? "Use rear camera" : "Use selfie camera"}</button>
        <button type="button" className="sukuunova-camera-action primary" onClick={() => void captureNow()} disabled={!cameraReady || locked}>Capture now</button>
      </div>
    </div>, document.body) : null;

  const reviewScreen = candidate && portalReady ? createPortal(
    <div className="sukuunova-portrait-review-screen" role="dialog" aria-modal="true" aria-label="Review portrait">
      <div className="sukuunova-review-heading">
        <strong>{candidate.biometricReady ? "Verified portrait captured" : candidate.localFaceGated ? "Face-gated portrait captured" : "Portrait captured"}</strong>
        <span>{candidate.biometricReady ? "Server face checks passed. Review the photo, then continue registration or retry." : candidate.localFaceGated ? "One stable face was detected on this device. Review the exact frame; biometric identity verification remains deferred." : "Review the face carefully before continuing. Biometric verification will be completed later."}</span>
      </div>
      <div className="sukuunova-review-photo-wrap"><img src={candidate.image} alt={`${subjectLabel} portrait`} className="sukuunova-review-photo"/></div>
      <div className="sukuunova-review-actions">
        <button type="button" className="sukuunova-camera-action" onClick={retryCandidate} disabled={locked}><RefreshCw size={16}/> Retry</button>
        <button type="button" className="sukuunova-camera-action primary" onClick={() => void acceptCandidate()} disabled={locked}><CheckCircle2 size={16}/>{usingCandidate || busy ? " Saving…" : " Use photo & continue"}</button>
      </div>
    </div>, document.body) : null;

  return <section className="photo-capture professional-portrait-capture verified-portrait-capture">
    <div className="verified-portrait-heading">
      <div>
        <span className="verified-portrait-eyebrow"><ShieldCheck size={14}/> Face-gated portrait capture</span>
        <strong>Registration-ready {subjectLabel} portrait</strong>
        <p>Automatic capture is gated by one stable, well-framed face on the device and then follows the school's server verification policy. Local face presence is not identity verification, liveness or anti-spoofing.</p>
      </div>
      <span className={candidate ? "verified-portrait-badge ready" : "verified-portrait-badge"}>{candidate ? (candidate.biometricReady ? "Verified · review" : candidate.localFaceGated ? "Face-gated · review" : "Captured · review") : "Face gate ready"}</span>
    </div>
    <div className="portrait-capture-layout">
      <div className="photo-preview-wrap portrait-preview-wrap">
        {displayImage ? <img src={displayImage} alt={`${subjectLabel} portrait preview`} className="photo-preview" /> : <div className="photo-placeholder"><Camera size={28}/><span>No portrait yet</span><small>Open the full-screen camera</small></div>}
      </div>
      <div className="portrait-guidance">
        <strong>One clear face, no restrictive oval</strong>
        <p>Keep one person visible from the head through the shoulders. SukuuNova waits for the face to be centered and stable before it can capture automatically.</p>
        <ul>
          <li>Look toward the camera with the face clearly visible.</li>
          <li>Use reasonable, even light.</li>
          <li>Automatic capture requires a stable on-device face gate or the configured cloud verifier.</li>
          <li>If both automatic paths are unavailable, use Capture now only when the face is clearly framed.</li>
        </ul>
      </div>
    </div>
    <div className="verified-camera-launchers">
      <button type="button" className="button primary" onClick={() => void startCamera("environment")} disabled={locked}><Camera size={16}/> Open rear camera</button>
      <button type="button" className="button secondary" onClick={() => void startCamera("user")} disabled={locked}><Smartphone size={16}/> Open selfie camera</button>
      {allowFileFallback ? <label className="button secondary photo-upload"><Upload size={16}/> Device-camera fallback<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={fileFallback} disabled={locked}/></label> : null}
      {value && onRemove ? <button type="button" className="photo-remove" onClick={() => void onRemove()} disabled={locked}>{removeLabel}</button> : null}
    </div>
    <p className="sukuunova-capture-note">The local detector evaluates face presence and framing on the device. The exact-image signed token remains the registration authority, and biometric identity/liveness verification is never inferred from the local gate.</p>
    <div className="verified-portrait-status" role="status"><strong>{status}</strong><span>{message}</span></div>
    {checks.length && !candidate ? <div className="portrait-quality-grid verified-quality-grid" aria-label="Face verification checks">{checks.map((check) => <div key={check.key} className={check.passed ? "passed" : "failed"}><span>{check.passed ? "✓" : "!"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div> : null}
    {cameraScreen}
    {reviewScreen}
  </section>;
}
