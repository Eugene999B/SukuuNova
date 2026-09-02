"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import encodeQR from "qr";

export default function AttendanceDisplay({ schoolName }: { schoolName: string }) {
  const [token, setToken] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracyM?: number }>();

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
        body: JSON.stringify({ action: "challenge", displayLocation: location ?? null })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to refresh the school check-in code.");
      setToken(body.result.token);
      setExpiresAt(new Date(body.result.expiresAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh the school check-in code.");
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const svg = useMemo(() => token ? encodeQR(token, "svg", { ecc: "high", border: 4, scale: 8 }) : "", [token]);
  const remaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)) : 0;

  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setExpiresAt((current) => current ? new Date(current) : null), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt?.getTime()]);

  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white sm:px-10">
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col items-center justify-center">
      <div className="mb-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300">SukuuNova · Staff Check-In</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-5xl">{schoolName}</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">Scan this live school code from your logged-in SukuuNova Teacher Portal. The code changes automatically and cannot be used as a permanent attendance code.</p>
      </div>

      <section className="grid w-full gap-6 rounded-3xl border border-white/10 bg-white p-6 text-slate-900 shadow-2xl sm:p-10 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-h-[320px] items-center justify-center rounded-2xl bg-white p-4 sm:min-h-[430px]">
          {svg ? <div aria-label="Live school staff check-in QR code" className="w-full max-w-[430px] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="text-center text-slate-500">{loading ? "Generating secure check-in code…" : "QR code unavailable"}</div>}
        </div>

        <div className="flex flex-col justify-between rounded-2xl bg-slate-50 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">How it works</p>
            <ol className="mt-4 space-y-4 text-sm text-slate-700">
              <li><strong>1.</strong> Teacher logs into SukuuNova.</li>
              <li><strong>2.</strong> Teacher opens <strong>School Check-In</strong>.</li>
              <li><strong>3.</strong> Teacher scans this live code.</li>
              <li><strong>4.</strong> Server verifies the session, freshness and school presence.</li>
            </ol>
          </div>
          <div className="mt-8 border-t border-slate-200 pt-5">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Code status</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{remaining}s</p>
            <p className="mt-1 text-xs text-slate-500">Refreshes automatically every 30 seconds.</p>
            {location ? <p className="mt-3 text-xs font-medium text-emerald-700">Display location verification ready.</p> : <p className="mt-3 text-xs font-medium text-amber-700">Location unavailable; network-bound verification will be used.</p>}
            {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700">{error}</p> : null}
          </div>
        </div>
      </section>
      <p className="mt-6 text-center text-xs text-slate-400">Keep this page on the school's designated attendance screen. Do not share screenshots of the code.</p>
    </div>
  </main>;
}
