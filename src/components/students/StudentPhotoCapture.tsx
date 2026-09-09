/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
    { key: "resolution", label: "Resolution", passed: enoughResolution, detail: enoughResolution ? `${sourceWidth}×${sourceHeight} source` : "Use at least a 480×480 source image." },
    { key: "lighting", label: "Lighting", passed: mean >= 45 && mean <= 220, detail: mean < 45 ? "Face area is too dark." : mean > 220 ? "Image is overexposed." : "Exposure is usable." },
    { key: "contrast", label: "Contrast", passed: contrast >= 18, detail: contrast >= 18 ? "Facial detail has usable contrast." : "Move to clearer, more even lighting." },
    { key: "sharpness", label: "Sharpness", passed: sharpness >= 3.2, detail: sharpness >= 3.2 ? "Image detail is sufficiently sharp." : "Hold the camera steady and focus before capture." },
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

export function StudentPhotoCapture() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState("");
  const [checks, setChecks] = useState<QualityCheck[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function startCamera() {
    setMessage("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("This browser does not expose a camera. Use Upload portrait instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 1200 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setMessage("Camera access was blocked. Allow camera permission or use Upload portrait.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  function acceptPortrait(result: PortraitResult) {
    setChecks(result.checks);
    if (result.checks.every((check) => check.passed)) {
      setPhoto(result.dataUrl);
      setMessage("Portrait quality passed. This image will be used consistently on the learner profile, supported documents and face enrollment.");
      return true;
    }
    setPhoto("");
    setMessage("Portrait not accepted yet. Correct the failed quality checks and capture again.");
    return false;
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setMessage("The camera is still starting. Wait for a clear preview, then try again.");
      return;
    }
    try {
      const passed = acceptPortrait(preparePortrait(video, video.videoWidth, video.videoHeight));
      if (passed) stopCamera();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The portrait could not be processed.");
    }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Please choose a JPEG, PNG or WebP portrait image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMessage("Please choose an image smaller than 8 MB.");
      return;
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      try {
        acceptPortrait(preparePortrait(image, image.naturalWidth, image.naturalHeight));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "This portrait could not be processed.");
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setMessage("This portrait could not be loaded. Please choose another image.");
    };
    image.src = objectUrl;
  }

  return (
    <div className="photo-capture professional-portrait-capture">
      <div className="portrait-capture-layout">
        <div className="photo-preview-wrap portrait-preview-wrap">
          {photo ? <img src={photo} alt="Accepted student portrait preview" className="photo-preview" /> : <div className="photo-placeholder"><span>Student portrait</span><small>Face centred · head &amp; shoulders</small></div>}
        </div>
        <div className="portrait-guidance">
          <strong>Official learner portrait</strong>
          <p>Use one learner only, looking directly at the camera, with the full face visible and a simple background.</p>
          <ul>
            <li>No sunglasses, mask or face-covering hat.</li>
            <li>Use even front lighting; avoid a bright window behind the learner.</li>
            <li>Hold the camera steady and keep head and shoulders inside the guide.</li>
          </ul>
        </div>
      </div>

      <div className="photo-controls">
        <button type="button" className="button secondary" onClick={() => (cameraOpen ? stopCamera() : void startCamera())}>{cameraOpen ? "Close camera" : "Use camera"}</button>
        <label className="button secondary photo-upload">Upload portrait<input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={upload} /></label>
        {photo ? <button type="button" className="photo-remove" onClick={() => { setPhoto(""); setChecks([]); setMessage(""); }}>Retake</button> : null}
      </div>

      {cameraOpen ? <div className="camera-panel portrait-camera-panel"><div className="portrait-camera-stage"><video ref={videoRef} muted playsInline className="camera-video" /><div className="portrait-camera-guide" aria-hidden="true"><span /></div></div><button type="button" className="button primary" onClick={capture}>Capture &amp; check portrait</button></div> : null}

      {checks.length ? <div className="portrait-quality-grid" aria-label="Portrait quality checks">{checks.map((check) => <div key={check.key} className={check.passed ? "passed" : "failed"}><span>{check.passed ? "✓" : "!"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div> : null}
      {message ? <p className="photo-message" role="status">{message}</p> : null}
      <input type="hidden" name="photoData" value={photo} />
      <p className="field-help">Only a portrait that passes the quality checks is submitted. The same accepted portrait becomes the learner&apos;s canonical school photo.</p>
    </div>
  );
}
