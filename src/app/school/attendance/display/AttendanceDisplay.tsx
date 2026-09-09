"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import encodeQR from "qr";

type DisplayLocation = { latitude: number; longitude: number; accuracyM?: number };
type ChallengeMeta = { refreshAfterSeconds: number; requireFace: boolean; presenceMode: "network_or_location" | "location" | "network" };
type ApiBody = { message?: string; error?: string; result?: { token?: string; expiresAt?: string; refreshAfterSeconds?: number; requireFace?: boolean; presenceMode?: ChallengeMeta["presenceMode"] }; refreshAfterSeconds?: number };

async function responseBody(response: Response): Promise<ApiBody> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try { return await response.json() as ApiBody; } catch { return {}; }
  }
  const text = await response.text();
  if (response.status === 401 || response.status === 403 || /sign[ -]?in|login/i.test(text)) {
    return { message: "This attendance-display session is no longer authorised. Sign in again with the designated display account, then reopen the station." };
  }
  return { message: response.ok ? undefined : "The attendance service returned an unexpected response. The station will retry automatically." };
}

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
    try {
      const response = await fetch("/api/school/attendance/staff-qr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "challenge", displayLocation: location ?? null })
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.message ?? body.error ?? "Unable to refresh the school attendance code.");
      const nextToken = body.result?.token;
      const nextExpiry = body.result?.expiresAt;
      if (!nextToken || !nextExpiry) throw new Error("The attendance service did not return a complete QR challenge. The station will retry automatically.");
      setToken(nextToken);
      setExpiresAt(new Date(nextExpiry));
      setMeta({
        refreshAfterSeconds: Number(body.result?.refreshAfterSeconds ?? body.refreshAfterSeconds ?? 60),
        requireFace: Boolean(body.result?.requireFace),
        presenceMode: body.result?.presenceMode ?? "network_or_location",
      });
      setError("");
    } catch (err) {
      // Keep the current challenge on screen until its own signed expiry. A transient
      // refresh failure should not blank a still-valid school station.
      setError(err instanceof Error ? err.message : "Unable to refresh the school attendance code. The station will retry automatically.");
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), Math.max(30, meta.refreshAfterSeconds) * 1000);
    return () => window.clearInterval(timer);
  }, [meta.refreshAfterSeconds, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const stillValid = Boolean(token && expiresAt && expiresAt.getTime() > clock);
  const svg = useMemo(() => stillValid ? encodeQR(token, "svg", { ecc: "high", border: 4, scale: 8 }) : "", [stillValid, token]);
  const remaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - clock) / 1000)) : 0;
  const presenceLabel = meta.presenceMode === "network" ? "school network" : meta.presenceMode === "location" ? "school location" : "school network or location";

  return <main className="attendance-live-display">
    <div className="attendance-live-frame">
      <header className="attendance-live-header">
        <div>
          <span>SukuuNova Attendance · Live Staff Station</span>
          <h1>{schoolName}</h1>
          <p>Use this same live code for staff arrival and departure. Each signed-in staff account chooses the valid action before scanning.</p>
        </div>
        <div className="attendance-live-clock"><small>Code changes in</small><strong>{remaining}s</strong><span>{meta.refreshAfterSeconds}s rotation</span></div>
      </header>

      <section className="attendance-live-stage">
        <div className="attendance-live-qr">
          {svg ? <div aria-label="Live school staff attendance QR code" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="attendance-live-empty">{loading ? "Generating secure attendance code…" : "Waiting for a fresh QR code…"}</div>}
        </div>
        <aside className="attendance-live-guide">
          <span className="attendance-live-kicker">Verification path</span>
          <ol>
            <li><b>1</b><div><strong>Choose Arriving or Leaving</strong><small>The scanner recommends the next valid action from today's attendance state.</small></div></li>
            <li><b>2</b><div><strong>Scan this live code</strong><small>A screenshot quickly becomes useless because the signed challenge rotates.</small></div></li>
            <li><b>3</b><div><strong>Prove school presence</strong><small>Verification uses {presenceLabel}.</small></div></li>
            <li><b>4</b><div><strong>{meta.requireFace ? "Verify your face" : "Attendance is recorded"}</strong><small>{meta.requireFace ? "The face must match the same staff account that scanned the code." : "The server applies the school's configured arrival or departure window."}</small></div></li>
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
