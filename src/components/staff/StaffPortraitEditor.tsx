/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, ImageUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import "@/components/students/student-photo-capture.css";

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

export function StaffPortraitEditor({ staffId, staffName, initialPhoto }: { staffId: string; staffName: string; initialPhoto: string | null }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState(initialPhoto ?? "");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

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

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { setMessage("Camera access is unavailable. Upload a portrait instead."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 1200 } }, audio: false });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } });
    } catch { setMessage("Camera permission was blocked. Upload a portrait instead."); }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) { setMessage("The camera is still starting."); return; }
    void accept(video, video.videoWidth, video.videoHeight);
  }

  return <section className="photo-capture professional-portrait-capture">
    <div className="portrait-capture-layout">
      <div className="photo-preview-wrap portrait-preview-wrap">
        {preview ? <img src={preview} alt={`${staffName} portrait`} className="photo-preview" /> : <div className="photo-placeholder"><span>Staff portrait</span><small>Face centred · head &amp; shoulders</small></div>}
      </div>
      <div className="portrait-guidance"><strong>Official staff portrait</strong><p>This portrait is used on the staff profile and printed SukuuNova ID card.</p><ul><li>Use a clear front-facing face.</li><li>Use even lighting and a simple background.</li><li>Avoid sunglasses, masks and strong shadows.</li></ul></div>
    </div>
    <div className="photo-controls">
      <button type="button" className="button secondary" onClick={() => cameraOpen ? stopCamera() : void startCamera()} disabled={busy}><Camera size={15}/>{cameraOpen ? " Close camera" : " Use camera"}</button>
      <label className="button secondary photo-upload"><ImageUp size={15}/> Upload portrait<input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={upload} disabled={busy}/></label>
      {preview ? <button type="button" className="photo-remove" onClick={() => void save(null)} disabled={busy}><Trash2 size={14}/> Remove</button> : null}
    </div>
    {cameraOpen ? <div className="camera-panel portrait-camera-panel"><div className="portrait-camera-stage"><video ref={videoRef} muted playsInline className="camera-video"/><div className="portrait-camera-guide" aria-hidden="true"><span/></div></div><button type="button" className="button primary" onClick={capture} disabled={busy}>Capture &amp; save portrait</button></div> : null}
    {message ? <p className="photo-message" role="status">{message}</p> : null}
  </section>;
}
