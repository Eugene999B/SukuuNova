"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import encodeQR from "qr";

type DisplayLocation = { latitude: number; longitude: number; accuracyM?: number };
type ChallengeMeta = { refreshAfterSeconds: number; requireFace: boolean; presenceMode: "network_or_location" | "location" | "network" };

export default function AttendanceDisplay({ schoolName }: { schoolName: string }) {
  const [token, setToken] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(() => Date.now());
  const [location, setLocation] = useState<DisplayLocation>();
  const [meta, setMeta] = useState<ChallengeMeta>({ refreshAfterSeconds: 60, requireFace: false, presenceMode: "network_or_location" });

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy }),
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 5000 }
    );
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/school/attendance/staff-qr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "challenge", displayLocation: location ?? null })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Unable to refresh the school check-in code.");
      setToken(body.result.token);
      setExpiresAt(new Date(body.result.expiresAt));
      setMeta({
        refreshAfterSeconds: Number(body.result.refreshAfterSeconds ?? body.refreshAfterSeconds ?? 60),
        requireFace: Boolean(body.result.requireFace),
        presenceMode: body.result.presenceMode ?? "network_or_location",
      });
    } catch (err) {
      setToken("");
      setExpiresAt(null);
      setError(err instanceof Error ? err.message : "Unable to refresh the school check-in code.");
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => void refresh(), Math.max(30, meta.refreshAfterSeconds) * 1000);
    return () => window.clearTimeout(timer);
  }, [meta.refreshAfterSeconds, refresh, token]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const svg = useMemo(() => token ? encodeQR(token, "svg", { ecc: "high", border: 4, scale: 8 }) : "", [token]);
  const remaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - clock) / 1000)) : 0;
  const presenceLabel = meta.presenceMode === "network" ? "school network" : meta.presenceMode === "location" ? "school location" : "school network or location";

  return <main className="attendance-live-display">
    <div className="attendance-live-frame">
      <header className="attendance-live-header">
        <div>
          <span>SukuuNova Attendance · Live Staff Check-In</span>
          <h1>{schoolName}</h1>
          <p>Scan the live code with your signed-in staff account. The code rotates automatically and cannot be reused by the same account.</p>
        </div>
        <div className="attendance-live-clock"><small>Code changes in</small><strong>{remaining}s</strong><span>{meta.refreshAfterSeconds}s rotation</span></div>
      </header>

      <section className="attendance-live-stage">
        <div className="attendance-live-qr">
          {svg ? <div aria-label="Live school staff check-in QR code" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="attendance-live-empty">{loading ? "Generating secure check-in code…" : "QR code unavailable"}</div>}
        </div>
        <aside className="attendance-live-guide">
          <span className="attendance-live-kicker">Verification path</span>
          <ol>
            <li><b>1</b><div><strong>Open School Check-In</strong><small>Use your own signed-in staff account.</small></div></li>
            <li><b>2</b><div><strong>Scan this live code</strong><small>A screenshot quickly becomes useless because the code rotates.</small></div></li>
            <li><b>3</b><div><strong>Prove school presence</strong><small>Verification uses {presenceLabel}.</small></div></li>
            <li><b>4</b><div><strong>{meta.requireFace ? "Verify your face" : "Attendance is recorded"}</strong><small>{meta.requireFace ? "The face must match the same staff account that scanned the code." : "The server applies the school's late and closing-time rules."}</small></div></li>
          </ol>
          <div className="attendance-live-status">
            <strong>{location ? "Display location ready" : "Display location unavailable"}</strong>
            <small>{location ? "Location can be used as part of school-presence verification." : "The configured network rule may still allow verification."}</small>
          </div>
          {error ? <div className="attendance-live-error">{error}</div> : null}
        </aside>
      </section>

      <footer>Keep this page open only on the school's designated attendance screen. Do not publish or share live-code screenshots.</footer>
    </div>
  </main>;
}
