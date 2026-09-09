"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import "./staff-checkin.css";

type Location = { latitude: number; longitude: number; accuracyM?: number } | null;
type Phase = "loading" | "qr" | "face" | "submitting" | "done" | "error";
type QrPolicy = { enabled: boolean; requireFace: boolean; rotationSeconds: number; presenceMode: string };

async function currentLocation(): Promise<Location> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 5000 }
    );
  });
}

export default function StaffQrScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrStopRef = useRef<(() => void) | null>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const [policy, setPolicy] = useState<QrPolicy | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("Loading your school's attendance rules…");
  const [token, setToken] = useState("");
  const [location, setLocation] = useState<Location>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [result, setResult] = useState<{ late?: boolean; verification?: string; time?: string } | null>(null);

  const stopAllCameras = useCallback(() => {
    qrStopRef.current?.();
    qrStopRef.current = null;
    faceStreamRef.current?.getTracks().forEach((track) => track.stop());
    faceStreamRef.current = null;
  }, []);

  useEffect(() => () => stopAllCameras(), [stopAllCameras]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/school/attendance/staff-qr", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? body.error ?? "Could not load attendance rules.");
        if (!body.qr?.enabled) throw new Error("Rotating QR attendance is currently disabled by your school.");
        setPolicy(body.qr);
        setPhase("qr");
        setMessage("Point your rear camera at the live school QR code.");
      } catch (error) {
        setPhase("error");
        setMessage(error instanceof Error ? error.message : "Could not load attendance rules.");
      }
    })();
  }, []);

  useEffect(() => {
    if (phase !== "qr" || !policy) return;
    let cancelled = false;
    async function startQrCamera() {
      try {
        if (!videoRef.current) return;
        const { QRCanvas, frameLoop, rearCamera } = await import("qr/dom.js");
        const camera = await rearCamera(videoRef.current);
        if (cancelled) {
          camera.stop();
          return;
        }
        const canvas = new QRCanvas();
        const cancelLoop = frameLoop(async () => {
          if (busyRef.current) return;
          const decoded = camera.readFrame(canvas);
          if (!decoded) return;
          busyRef.current = true;
          camera.stop();
          cancelLoop();
          qrStopRef.current = null;
          setMessage("QR verified by your camera. Checking school presence…");
          const scanLocation = await currentLocation();
          const requestKey = crypto.randomUUID();
          setToken(decoded);
          setLocation(scanLocation);
          setIdempotencyKey(requestKey);
          if (policy.requireFace) {
            setPhase("face");
            setMessage("Now verify your face. This proves the signed-in account holder is physically checking in.");
          } else {
            setPhase("submitting");
            await submit(decoded, scanLocation, requestKey);
          }
          busyRef.current = false;
        });
        qrStopRef.current = () => { cancelLoop(); camera.stop(); };
      } catch (error) {
        setPhase("error");
        setMessage(error instanceof Error ? `${error.message} Make sure camera permission is enabled and the site uses HTTPS.` : "Camera access is unavailable.");
      }
    }
    void startQrCamera();
    return () => {
      cancelled = true;
      qrStopRef.current?.();
      qrStopRef.current = null;
    };
  }, [phase, policy]);

  useEffect(() => {
    if (phase !== "face") return;
    let cancelled = false;
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Front camera is unavailable in this browser.");
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        faceStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (error) {
        setPhase("error");
        setMessage(error instanceof Error ? error.message : "Face camera could not be started.");
      }
    })();
    return () => {
      cancelled = true;
      faceStreamRef.current?.getTracks().forEach((track) => track.stop());
      faceStreamRef.current = null;
    };
  }, [phase]);

  async function submit(scanToken: string, scanLocation: Location, requestKey: string, faceImage?: string) {
    try {
      const response = await fetch("/api/school/attendance/staff-qr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "scan", token: scanToken, location: scanLocation, idempotencyKey: requestKey, ...(faceImage ? { faceImage } : {}) })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Unable to complete school check-in.");
      stopAllCameras();
      setResult({ late: Boolean(body.result?.event?.isLate), verification: body.result?.verification, time: body.result?.event?.timestamp });
      setPhase("done");
      setMessage(body.result?.event?.isLate ? "Checked in successfully. The school attendance rule marked this arrival late." : "Checked in successfully and marked on time.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Unable to complete school check-in.");
    }
  }

  async function captureFace() {
    if (!videoRef.current || !token || !idempotencyKey) return;
    setPhase("submitting");
    setMessage("Matching your face to your signed-in staff account…");
    const video = videoRef.current;
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 720;
    const max = 720;
    const scale = Math.min(1, max / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      setPhase("error");
      setMessage("Your browser could not capture the face image.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const faceImage = canvas.toDataURL("image/jpeg", 0.78);
    faceStreamRef.current?.getTracks().forEach((track) => track.stop());
    faceStreamRef.current = null;
    await submit(token, location, idempotencyKey, faceImage);
  }

  function restart() {
    stopAllCameras();
    busyRef.current = false;
    setToken("");
    setLocation(null);
    setIdempotencyKey("");
    setResult(null);
    setMessage("Point your rear camera at the current live school QR code.");
    setPhase("qr");
  }

  return <main className="staff-checkin-shell">
    <section className="staff-checkin-card">
      <header className="staff-checkin-header">
        <div><span>Staff attendance</span><h1>School Check-In</h1><p>Secure attendance in a few seconds. Your school decides the time window and verification level.</p></div>
        <div className={`staff-checkin-state ${phase}`}><small>Status</small><strong>{phase === "done" ? "Recorded" : phase === "face" ? "Face proof" : phase === "qr" ? "Scan QR" : phase === "submitting" ? "Verifying" : phase === "error" ? "Needs attention" : "Starting"}</strong></div>
      </header>

      <div className="staff-checkin-progress" aria-label="Check-in progress">
        <span className={phase !== "loading" ? "active" : ""}>1 · Live QR</span>
        <span className={phase === "face" || phase === "submitting" || phase === "done" ? "active" : ""}>2 · {policy?.requireFace ? "Face proof" : "School presence"}</span>
        <span className={phase === "done" ? "active" : ""}>3 · Attendance</span>
      </div>

      {phase !== "done" ? <div className="staff-checkin-camera"><video ref={videoRef} autoPlay muted playsInline aria-label={phase === "face" ? "Front camera for staff face verification" : "Camera for scanning school QR code"} /><div className="staff-checkin-camera-label">{phase === "face" ? "Look directly at the camera" : phase === "qr" ? "Place the live QR inside the frame" : "Please wait"}</div></div> : null}

      <div className={`staff-checkin-message ${phase === "error" ? "error" : phase === "done" ? "success" : ""}`} role="status"><strong>{phase === "error" ? "Check-in could not finish" : phase === "done" ? "Attendance recorded" : "Secure check-in"}</strong><p>{message}</p></div>

      {phase === "face" ? <button className="staff-checkin-primary" type="button" onClick={() => void captureFace()}>Verify my face & check in</button> : null}

      {phase === "done" && result ? <div className="staff-checkin-receipt"><div><span>Arrival</span><strong>{result.late ? "Late" : "On time"}</strong></div><div><span>Verification</span><strong>{result.verification ?? "Secure QR"}</strong></div><div><span>Recorded</span><strong>{result.time ? new Date(result.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Now"}</strong></div></div> : null}

      <footer className="staff-checkin-actions">
        {phase === "error" ? <button type="button" onClick={restart}>Scan a fresh code</button> : null}
        <Link href="/teacher">Back to Teacher Portal</Link>
        {phase === "done" ? <Link className="primary" href="/school/attendance">Attendance overview</Link> : null}
      </footer>
    </section>
  </main>;
}
