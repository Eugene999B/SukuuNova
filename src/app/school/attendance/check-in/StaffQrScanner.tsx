"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function StaffQrScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const doneRef = useRef(false);
  const [cameraError, setCameraError] = useState("");
  const [message, setMessage] = useState("Point your rear camera at the live school QR code.");
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { doneRef.current = done; }, [done]);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (!videoRef.current) return;
        const { QRCanvas, frameLoop, rearCamera } = await import("qr/dom.js");
        const camera = await rearCamera(videoRef.current);
        if (cancelled) {
          camera.stop();
          return;
        }
        const canvas = new QRCanvas();
        let busy = false;
        const cancelLoop = frameLoop(async () => {
          if (busy || doneRef.current) return;
          const decoded = camera.readFrame(canvas);
          if (decoded === undefined || !decoded) return;
          busy = true;
          setWorking(true);
          setMessage("QR detected. Verifying your school check-in…");
          try {
            let location: { latitude: number; longitude: number; accuracyM?: number } | null = null;
            if (navigator.geolocation) {
              location = await new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                  (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy }),
                  () => resolve(null),
                  { enableHighAccuracy: false, maximumAge: 30000, timeout: 5000 }
                );
              });
            }
            const idempotencyKey = crypto.randomUUID();
            const response = await fetch("/api/school/attendance/staff-qr", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: "scan", token: decoded, location, idempotencyKey })
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Unable to complete school check-in.");
            doneRef.current = true;
            setDone(true);
            setMessage(body.result?.verification ? `Checked in successfully · ${body.result.verification}` : "Checked in successfully.");
            camera.stop();
            cancelLoop();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to complete school check-in.");
            busy = false;
            setWorking(false);
          }
        });
        stopRef.current = () => { cancelLoop(); camera.stop(); };
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : "Camera access is unavailable.");
      }
    }
    void start();
    return () => { cancelled = true; stopRef.current?.(); };
  }, []);

  return <div className="mx-auto max-w-2xl">
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6 sm:p-8">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Staff attendance</span>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">School Check-In</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Use your logged-in account to scan the school's live attendance code. SukuuNova verifies the school challenge and records the time from the server.</p>
      </div>
      <div className="space-y-5 p-5 sm:p-8">
        <div className="overflow-hidden rounded-2xl bg-slate-950">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" autoPlay muted playsInline aria-label="Camera for scanning school QR code" />
        </div>
        {cameraError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{cameraError} Make sure your browser has permission to use the camera and that you are using HTTPS.</div> : null}
        <div className={`rounded-2xl p-4 text-sm ${done ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-700"}`}>
          <strong>{done ? "Attendance recorded" : working ? "Checking…" : "Ready"}</strong>
          <p className="mt-1">{message}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/teacher" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Back to Teacher Portal</Link>
          {done ? <Link href="/school/attendance" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Attendance overview</Link> : null}
        </div>
      </div>
    </section>
  </div>;
}
