"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import "./staff-checkin.css";

type Location = { latitude: number; longitude: number; accuracyM?: number } | null;
type Phase = "loading" | "qr" | "face" | "submitting" | "done" | "error";
type Direction = "in" | "out";
type QrPolicy = { enabled: boolean; requireFace: boolean; rotationSeconds: number; presenceMode: string };
type AttendanceState = {
  state: "not_checked_in" | "checked_in" | "checked_out";
  suggestedType: Direction;
  canScan: boolean;
  lastTimestamp?: string | null;
};

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
  const [attendanceState, setAttendanceState] = useState<AttendanceState | null>(null);
  const [direction, setDirection] = useState<Direction>("in");
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("Loading your school's attendance rules…");
  const [token, setToken] = useState("");
  const [location, setLocation] = useState<Location>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [result, setResult] = useState<{ type?: Direction; late?: boolean; verification?: string; time?: string } | null>(null);

  const stopAllCameras = useCallback(() => {
    qrStopRef.current?.();
    qrStopRef.current = null;
    faceStreamRef.current?.getTracks().forEach((track) => track.stop());
    faceStreamRef.current = null;
  }, []);

  useEffect(() => () => stopAllCameras(), [stopAllCameras]);

  const loadState = useCallback(async () => {
    const response = await fetch("/api/school/attendance/staff-qr", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message ?? body.error ?? "Could not load attendance rules.");
    if (!body.qr?.enabled) throw new Error("Rotating QR attendance is currently disabled by your school.");
    const current = body.currentAttendance as AttendanceState;
    setPolicy(body.qr);
    setAttendanceState(current);
    setDirection(current.suggestedType ?? "in");
    return current;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const current = await loadState();
        if (!current.canScan) {
          setPhase("done");
          setMessage("Your attendance is already closed for today. A supervisor can correct it if another entry is genuinely required.");
          return;
        }
        setPhase("qr");
        setMessage(current.suggestedType === "out" ? "You are currently checked in. Scan the live code to record that you are leaving school." : "Point your rear camera at the live school QR code to record your arrival.");
      } catch (error) {
        setPhase("error");
        setMessage(error instanceof Error ? error.message : "Could not load attendance rules.");
      }
    })();
  }, [loadState]);

  useEffect(() => {
    if (phase !== "qr" || !policy) return;
    const activePolicy = policy;
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
          busyRef.current = true;
          try {
            const rawDecoded = await camera.readFrame(canvas);
            const decoded = typeof rawDecoded === "string"
              ? rawDecoded
              : Array.isArray(rawDecoded)
                ? rawDecoded.find((item): item is string => typeof item === "string")
                : undefined;
            if (!decoded || cancelled) return;
            camera.stop();
            cancelLoop();
            qrStopRef.current = null;
            setMessage("QR verified by your camera. Checking school presence…");
            const scanLocation = await currentLocation();
            const requestKey = crypto.randomUUID();
            setToken(decoded);
            setLocation(scanLocation);
            setIdempotencyKey(requestKey);
            if (activePolicy.requireFace) {
              setPhase("face");
              setMessage(`Now verify your face. This proves the signed-in account holder is physically ${direction === "out" ? "leaving" : "arriving at"} school.`);
            } else {
              setPhase("submitting");
              await submit(decoded, scanLocation, requestKey);
            }
          } finally {
            busyRef.current = false;
          }
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
  }, [direction, phase, policy]);

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
        body: JSON.stringify({ action: "scan", token: scanToken, type: direction, location: scanLocation, idempotencyKey: requestKey, ...(faceImage ? { faceImage } : {}) })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? body.error ?? `Unable to complete school ${direction === "out" ? "check-out" : "check-in"}.`);
      stopAllCameras();
      const eventType = body.result?.event?.type as Direction | undefined;
      setResult({ type: eventType, late: Boolean(body.result?.event?.isLate), verification: body.result?.verification, time: body.result?.event?.timestamp });
      setPhase("done");
      setMessage(eventType === "out" ? "Checked out successfully. Your departure is now recorded." : body.result?.event?.isLate ? "Checked in successfully. The school attendance rule marked this arrival late." : "Checked in successfully and marked on time.");
      await loadState();
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : `Unable to complete school ${direction === "out" ? "check-out" : "check-in"}.`);
    }
  }

  async function captureFace() {
    if (!videoRef.current || !token || !idempotencyKey) return;
    setPhase("submitting");
    setMessage(`Matching your face to your signed-in staff account before ${direction === "out" ? "check-out" : "check-in"}…`);
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

  function restart(nextDirection = direction) {
    stopAllCameras();
    busyRef.current = false;
    setDirection(nextDirection);
    setToken("");
    setLocation(null);
    setIdempotencyKey("");
    setResult(null);
    setMessage(`Point your rear camera at the current live school QR code to record ${nextDirection === "out" ? "departure" : "arrival"}.`);
    setPhase("qr");
  }

  const directionLocked = phase === "face" || phase === "submitting";

  return <main className="staff-checkin-shell">
    <section className="staff-checkin-card">
      <header className="staff-checkin-header">
        <div><span>Staff attendance</span><h1>School Attendance Scan</h1><p>Use the same rotating school QR for arrival and departure. The system recommends the next valid action from your attendance state.</p></div>
        <div className={`staff-checkin-state ${phase}`}><small>Status</small><strong>{phase === "done" ? "Recorded" : phase === "face" ? "Face proof" : phase === "qr" ? "Scan QR" : phase === "submitting" ? "Verifying" : phase === "error" ? "Needs attention" : "Starting"}</strong></div>
      </header>

      <div className="staff-checkin-direction" aria-label="Attendance direction">
        <button type="button" className={direction === "in" ? "active" : ""} disabled={directionLocked || attendanceState?.state === "checked_out"} onClick={() => restart("in")}><strong>Arriving</strong><small>Check in to school</small></button>
        <button type="button" className={direction === "out" ? "active" : ""} disabled={directionLocked || attendanceState?.state !== "checked_in"} onClick={() => restart("out")}><strong>Leaving</strong><small>Check out from school</small></button>
      </div>

      <div className="staff-checkin-progress" aria-label="Attendance scan progress">
        <span className={phase !== "loading" ? "active" : ""}>1 · Live QR</span>
        <span className={phase === "face" || phase === "submitting" || phase === "done" ? "active" : ""}>2 · {policy?.requireFace ? "Face proof" : "School presence"}</span>
        <span className={phase === "done" ? "active" : ""}>3 · {direction === "out" ? "Departure" : "Arrival"}</span>
      </div>

      {phase !== "done" ? <div className="staff-checkin-camera"><video ref={videoRef} autoPlay muted playsInline aria-label={phase === "face" ? "Front camera for staff face verification" : "Camera for scanning school QR code"} /><div className="staff-checkin-camera-label">{phase === "face" ? "Look directly at the camera" : phase === "qr" ? "Place the live QR inside the frame" : "Please wait"}</div></div> : null}

      <div className={`staff-checkin-message ${phase === "error" ? "error" : phase === "done" ? "success" : ""}`} role="status"><strong>{phase === "error" ? "Attendance scan could not finish" : phase === "done" ? "Attendance recorded" : direction === "out" ? "Secure check-out" : "Secure check-in"}</strong><p>{message}</p></div>

      {phase === "face" ? <button className="staff-checkin-primary" type="button" onClick={() => void captureFace()}>Verify my face &amp; {direction === "out" ? "check out" : "check in"}</button> : null}

      {phase === "done" && result ? <div className="staff-checkin-receipt"><div><span>{result.type === "out" ? "Departure" : "Arrival"}</span><strong>{result.type === "out" ? "Checked out" : result.late ? "Late" : "On time"}</strong></div><div><span>Verification</span><strong>{result.verification ?? "Secure QR"}</strong></div><div><span>Recorded</span><strong>{result.time ? new Date(result.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Now"}</strong></div></div> : null}

      <footer className="staff-checkin-actions">
        {phase === "error" ? <button type="button" onClick={() => restart()}>Scan a fresh code</button> : null}
        <Link href="/teacher">Back to Teacher Portal</Link>
        {phase === "done" ? <Link className="primary" href="/school/attendance">Attendance overview</Link> : null}
      </footer>
    </section>
  </main>;
}
