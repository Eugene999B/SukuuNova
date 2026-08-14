"use client";

import { useEffect, useRef, useState } from "react";

export function CameraCapture({ onCapture }: { onCapture: (image: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("Camera is off.");

  function stop() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
    setMessage("Camera is off.");
  }

  useEffect(() => stop, []);

  async function start() {
    try {
      stop();
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false
      });
      stream.current = next;
      if (video.current) {
        video.current.srcObject = next;
        await video.current.play();
      }
      setActive(true);
      setMessage("Camera ready. Centre one face in the frame.");
    } catch {
      setMessage("Camera permission was denied or no camera is available.");
    }
  }

  function capture() {
    if (!video.current || !active) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth || 960;
    canvas.height = video.current.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video.current, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.86));
    setMessage("Secure frame captured. SukuuNova will not store the raw image.");
  }

  return (
    <div className="space-y-3">
      <video ref={video} muted playsInline className="aspect-video w-full rounded-xl bg-slate-950 object-cover" />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={start} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
          Start camera
        </button>
        <button type="button" onClick={capture} disabled={!active} className="rounded-lg bg-nova px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Capture frame
        </button>
        <button type="button" onClick={stop} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
          Stop
        </button>
      </div>
      <p className="text-xs text-slate-500">{message}</p>
    </div>
  );
}
