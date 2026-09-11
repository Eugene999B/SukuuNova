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

export function StudentPhotoCapture() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stableFramesRef = useRef(0);
  const evaluatingRef = useRef(false);
  const [photo, setPhoto] = useState("");
  const [checks, setChecks] = useState<QualityCheck[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [faceState, setFaceState] = useState("Camera not started");

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    stableFramesRef.current = 0;
    setCameraOpen(false);
  }

  function acceptPortrait(result: PortraitResult) {
    setChecks(result.checks);
    if (result.checks.every((check) => check.passed)) {
      setPhoto(result.dataUrl);
      setFaceState("Face captured and quality verified");
      setMessage("Live portrait captured automatically. This becomes the learner's canonical school photo; biometric device enrollment remains subject to the school's consent controls.");
      stopCamera();
      return true;
    }
    setMessage("Hold still while SukuuNova checks lighting, clarity and face position.");
    return false;
  }

  async function evaluateLiveFrame() {
    if (evaluatingRef.current || photo) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    evaluatingRef.current = true;
    try {
      const result = preparePortrait(video, video.videoWidth, video.videoHeight);
      setChecks(result.checks);
      const qualityPassed = result.checks.every((check) => check.passed);
      if (!qualityPassed) {
        stableFramesRef.current = 0;
        setFaceState("Improving image quality…");
        return;
      }

      const FaceDetectorApi = (window as typeof window & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
      if (FaceDetectorApi) {
        const detector = new FaceDetectorApi({ fastMode: true, maxDetectedFaces: 2 });
        const faces = await detector.detect(video);
        if (faces.length !== 1) {
          stableFramesRef.current = 0;
          setFaceState(faces.length ? "Only one learner should be in view" : "Move face into the guide");
          return;
        }
        if (!faceIsWellPlaced(faces[0].boundingBox, video.videoWidth, video.videoHeight)) {
          stableFramesRef.current = 0;
          setFaceState("Centre the face and move slightly closer");
          return;
        }
      }

      stableFramesRef.current += 1;
      setFaceState(stableFramesRef.current >= 2 ? "Face verified — capturing…" : "Face detected — hold still");
      if (stableFramesRef.current >= 3) acceptPortrait(result);
    } catch (error) {
      stableFramesRef.current = 0;
      setMessage(error instanceof Error ? error.message : "Live face quality verification is unavailable.");
    } finally {
      evaluatingRef.current = false;
    }
  }

  useEffect(() => {
    if (!cameraOpen || photo) return;
    const timer = window.setInterval(() => { void evaluateLiveFrame(); }, 650);
    return () => window.clearInterval(timer);
  // evaluateLiveFrame intentionally reads current refs/state on each interval tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen, photo]);

  async function startCamera() {
    setMessage("");
    setChecks([]);
    stableFramesRef.current = 0;
    if (!navigator.mediaDevices?.getUserMedia) {
      setFaceState("Live camera unavailable");
      setMessage("Student registration requires live camera capture. Open this page on a camera-enabled browser or device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 1200 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setFaceState("Starting face verification…");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setFaceState("Camera permission required");
      setMessage("Allow camera permission to capture the learner's live portrait. File uploads are intentionally disabled for student face registration.");
    }
  }

  return (
    <div className="photo-capture professional-portrait-capture">
      <div className="portrait-capture-layout">
        <div className="photo-preview-wrap portrait-preview-wrap">
          {photo ? <img src={photo} alt="Accepted student portrait preview" className="photo-preview" /> : <div className="photo-placeholder"><span>Live face capture</span><small>Face centred · head &amp; shoulders</small></div>}
        </div>
        <div className="portrait-guidance">
          <strong>Automatic face capture</strong>
          <p>SukuuNova checks the live camera continuously and captures automatically once one clear, centred face stays stable.</p>
          <ul>
            <li>Only the learner should be in the camera view.</li>
            <li>Remove sunglasses, masks and face-covering hats.</li>
            <li>Use even front lighting and keep the learner still.</li>
          </ul>
        </div>
      </div>

      <div className="photo-controls">
        {!photo ? <button type="button" className="button primary" onClick={() => (cameraOpen ? stopCamera() : void startCamera())}>{cameraOpen ? "Stop camera" : "Start live face capture"}</button> : <button type="button" className="photo-remove" onClick={() => { setPhoto(""); setChecks([]); setMessage(""); setFaceState("Ready to retake"); }}>Retake live photo</button>}
      </div>

      {cameraOpen ? <div className="camera-panel portrait-camera-panel"><div className="portrait-camera-stage"><video ref={videoRef} muted playsInline className="camera-video" /><div className="portrait-camera-guide" aria-hidden="true"><span /></div></div><div className="photo-message" role="status"><strong>{faceState}</strong><br /><span>No shutter button is needed. Hold still until capture completes.</span></div></div> : null}

      {checks.length ? <div className="portrait-quality-grid" aria-label="Portrait quality checks">{checks.map((check) => <div key={check.key} className={check.passed ? "passed" : "failed"}><span>{check.passed ? "✓" : "!"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div> : null}
      {!cameraOpen ? <p className="photo-message" role="status"><strong>{faceState}</strong>{message ? <><br /><span>{message}</span></> : null}</p> : null}
      <input type="hidden" name="photoData" value={photo} />
      <p className="field-help">Photo upload is disabled. Student portraits are captured from the live camera so the school has a trustworthy face image for the learner record and later controlled device enrollment.</p>
    </div>
  );
}
