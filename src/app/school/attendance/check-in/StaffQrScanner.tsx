"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Location = { latitude: number; longitude: number; accuracyM?: number } | null;
type Requirements = { requireFace: boolean; requirePresence: boolean; faceEnrolled: boolean; rotationSeconds: number; closesAt: string };
type Step = "loading" | "scan" | "face" | "submitting" | "done" | "error";

export default function StaffQrScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopQrRef = useRef<(() => void) | null>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);
  const [requirements, setRequirements] = useState<Requirements | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [message, setMessage] = useState("Checking today's school attendance requirements…");
  const [token, setToken] = useState("");
  const [location, setLocation] = useState<Location>(null);
  const [verification, setVerification] = useState("");

  const stopAll = useCallback(() => {
    stopQrRef.current?.();
    stopQrRef.current = null;
    faceStreamRef.current?.getTracks().forEach((track) => track.stop());
    faceStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/school/attendance/staff-qr/requirements", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? body.error ?? "Staff QR attendance is unavailable right now.");
        const next = body.result as Requirements;
        setRequirements(next);
        if (next.requireFace && !next.faceEnrolled) {
          setStep("error");
          setMessage("Your school requires face verification for QR attendance, but your staff face has not been enrolled yet. Ask an authorised administrator to enroll it before using School Check-In.");
          return;
        }
        setStep("scan");
        setMessage(`Scan the current live school QR code. It changes every ${next.rotationSeconds} seconds.`);
      } catch (error) {
        setStep("error");
        setMessage(error instanceof Error ? error.message : "Staff QR attendance is unavailable right now.");
      }
    })();
  }, []);

  useEffect(() => {
    if (step !== "scan" || !videoRef.current) return;
    let cancelled = false;
    let localStop: (() => void) | undefined;

    void (async () => {
      try {
        const { QRCanvas, frameLoop, rearCamera } = await import("qr/dom.js");
        if (!videoRef.current) return;
        const camera = await rearCamera(videoRef.current);
        if (cancelled) { camera.stop(); return; }
        const canvas = new QRCanvas();
        let busy = false;
        const cancelLoop = frameLoop(async () => {
          if (busy) return;
          const decoded = camera.readFrame(canvas);
          if (!decoded) return;
          busy = true;
          cancelLoop();
          camera.stop();
          stopQrRef.current = null;
          setToken(decoded);
          setMessage("Live QR detected. Confirming that this phone is at school…");
          const geo = await readLocation();
          setLocation(geo);
          if (requirements?.requireFace) {
            setStep("face");
            setMessage("QR accepted. Now use the front camera to verify that this is really you.");
          } else {
            await submitAttendance(decoded, geo, undefined);
          }
        });
        localStop = () => { cancelLoop(); camera.stop(); };
        stopQrRef.current = localStop;
      } catch (error) {
        setStep("error");
        setMessage(`${error instanceof Error ? error.message : "Camera access is unavailable."} Make sure camera permission is allowed and the page is using HTTPS.`);
      }
    })();

    return () => { cancelled = true; localStop?.(); };
    // requirements is intentionally captured for the current attendance session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step !== "face" || !videoRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Front camera is unavailable in this browser.");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false
        });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        faceStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (error) {
        setStep("error");
        setMessage(error instanceof Error ? error.message : "Unable to start the front camera for face verification.");
      }
    })();
    return () => { cancelled = true; };
  }, [step]);

  async function submitAttendance(currentToken: string, currentLocation: Location, faceImage?: string) {
    setStep("submitting");
    setMessage("Verifying your account, live code, school presence and identity…");
    try {
      const response = await fetch("/api/school/attendance/staff-qr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "scan",
          token: currentToken,
          location: currentLocation,
          faceImage,
          idempotencyKey: crypto.randomUUID()
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Unable to complete school check-in.");
      stopAll();
      setVerification(body.result?.verification ?? "verified");
      setStep("done");
      setMessage(body.result?.event?.isLate ? "Attendance recorded successfully. You were classified as late by the school's configured time rule." : "Attendance recorded successfully. Your identity and school presence were verified.");
    } catch (error) {
      stopAll();
      setStep("error");
      setMessage(error instanceof Error ? error.message : "Unable to complete school check-in.");
    }
  }

  async function captureFace() {
    if (!videoRef.current || !token) return;
    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      setMessage("The front camera is still starting. Keep your face visible and try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    const side = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = 640;
    canvas.height = 640;
    const context = canvas.getContext("2d");
    if (!context) return;
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    context.drawImage(video, sx, sy, side, side, 0, 0, 640, 640);
    const faceImage = canvas.toDataURL("image/jpeg", 0.86);
    faceStreamRef.current?.getTracks().forEach((track) => track.stop());
    faceStreamRef.current = null;
    await submitAttendance(token, location, faceImage);
  }

  function retry() {
    stopAll();
    setToken("");
    setLocation(null);
    setVerification("");
    setStep("scan");
    setMessage(`Scan a fresh live school QR code${requirements ? ` (changes every ${requirements.rotationSeconds}s)` : ""}.`);
  }

  const statusTitle = step === "done" ? "Attendance recorded" : step === "face" ? "Face verification" : step === "submitting" ? "Verifying…" : step === "scan" ? "Scan live QR" : step === "loading" ? "Preparing…" : "Check-in needs attention";

  return <div className="mx-auto max-w-3xl">
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 p-6 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Staff attendance</span><h1 className="mt-2 text-3xl font-semibold text-slate-950">School Check-In</h1><p className="mt-2 text-sm text-slate-500">Live QR + school presence{requirements?.requireFace ? " + face" : ""}</p></div>
          {requirements ? <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Closes {requirements.closesAt}</span> : null}
        </div>
      </header>

      <div className="space-y-5 p-5 sm:p-8">
        {(step === "scan" || step === "face") ? <div className="relative overflow-hidden rounded-3xl bg-slate-950"><video ref={videoRef} className={`aspect-[4/3] w-full object-cover ${step === "face" ? "-scale-x-100" : ""}`} autoPlay muted playsInline aria-label={step === "face" ? "Front camera for face verification" : "Camera for scanning school QR code"} />{step === "face" ? <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="h-[64%] w-[58%] rounded-[45%] border-2 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,.28)]" /></div> : null}</div> : null}

        <div className={`rounded-2xl border p-4 text-sm ${step === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : step === "error" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
          <strong>{statusTitle}</strong><p className="mt-1 leading-6">{message}</p>{verification ? <p className="mt-2 text-xs font-semibold uppercase tracking-[.12em] text-emerald-700">{verification}</p> : null}
        </div>

        {step === "face" ? <button type="button" className="w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-800" onClick={() => void captureFace()}>My face is clear — verify me</button> : null}

        <div className="flex flex-wrap gap-3">
          <Link href="/teacher" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Back to Teacher Portal</Link>
          {step === "error" && requirements?.faceEnrolled !== false ? <button type="button" onClick={retry} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Scan a fresh code</button> : null}
          {step === "done" ? <Link href="/teacher/attendance" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Open attendance</Link> : null}
        </div>
      </div>
    </section>
  </div>;
}

async function readLocation(): Promise<Location> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 5_000 }
    );
  });
}
