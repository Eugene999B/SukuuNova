"use client";

import { useEffect, useRef, useState } from "react";

function compressImage(source: HTMLCanvasElement, maxSize = 720): string {
  const ratio = Math.min(1, maxSize / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * ratio));
  canvas.height = Math.max(1, Math.round(source.height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Camera is unavailable in this browser.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

export function StudentPhotoCapture() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function startCamera() {
    setMessage("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("This browser does not expose a camera. Use Upload photo instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setMessage("Camera access was blocked. Allow camera permission or use Upload photo.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setMessage("The camera is still starting. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(compressImage(canvas));
    stopCamera();
  }

  function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Please choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMessage("Please choose an image smaller than 8 MB.");
      return;
    }
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0);
      setPhoto(compressImage(canvas));
      URL.revokeObjectURL(image.src);
    };
    image.src = URL.createObjectURL(file);
  }

  return (
    <div className="photo-capture">
      <div className="photo-preview-wrap">
        {photo ? <img src={photo} alt="Student preview" className="photo-preview" /> : <div className="photo-placeholder">Photo</div>}
      </div>
      <div className="photo-controls">
        <button type="button" className="button secondary" onClick={() => (cameraOpen ? stopCamera() : void startCamera())}>{cameraOpen ? "Close camera" : "Use camera"}</button>
        <label className="button secondary photo-upload">Upload photo<input type="file" accept="image/*" capture="user" onChange={upload} /></label>
        {photo ? <button type="button" className="photo-remove" onClick={() => setPhoto("")}>Remove</button> : null}
      </div>
      {cameraOpen ? <div className="camera-panel"><video ref={videoRef} muted playsInline className="camera-video" /><button type="button" className="button primary" onClick={capture}>Capture student photo</button></div> : null}
      {message ? <p className="photo-message" role="status">{message}</p> : null}
      <input type="hidden" name="photoData" value={photo} />
      <p className="field-help">A clear head-and-shoulders photo works best. The same photo appears on the student list and profile.</p>
    </div>
  );
}
