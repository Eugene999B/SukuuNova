"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import encodeQR from "qr";

type DisplayLocation = { latitude: number; longitude: number; accuracyM?: number };

type ChallengeResult = {
  token: string;
  expiresAt: string;
  refreshAfterSeconds: number;
  requireFace: boolean;
  requirePresence: boolean;
  verificationCloseTime: string;
};

export default function AttendanceDisplay({ schoolName }: { schoolName: string }) {
  const [token, setToken] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(() => Date.now());
  const [location, setLocation] = useState<DisplayLocation>();
  const [refreshSeconds, setRefreshSeconds] = useState(60);
  const [requireFace, setRequireFace] = useState(true);
  const [requirePresence, setRequirePresence] = useState(true);
  const [closeTime, setCloseTime] = useState("11:00");

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
      if (!response.ok) {
        setToken("");
        setExpiresAt(null);
        throw new Error(body.message ?? body.error ?? "Unable to refresh the school check-in code.");
      }
      const result = body.result as ChallengeResult;
      setToken(result.token);
      setExpiresAt(new Date(result.expiresAt));
      setRefreshSeconds(result.refreshAfterSeconds || 60);
      setRequireFace(Boolean(result.requireFace));
      setRequirePresence(Boolean(result.requirePresence));
      setCloseTime(result.verificationCloseTime || "11:00");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh the school check-in code.");
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), Math.max(30, refreshSeconds) * 1000);
    return () => window.clearInterval(timer);
  }, [refresh, refreshSeconds]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const svg = useMemo(() => token ? encodeQR(token, "svg", { ecc: "high", border: 4, scale: 8 }) : "", [token]);
  const remaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - clock) / 1000)) : 0;
  const currentTime = new Date(clock).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white sm:px-10">
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-center">
      <header className="mb-6 flex flex-col gap-4 text-center md:flex-row md:items-end md:justify-between md:text-left">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300">SukuuNova · Live Staff Attendance</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-5xl">{schoolName}</h1>
          <p className="mt-2 text-sm text-slate-300">Scan the current code. Every code expires automatically and is replaced by the school display.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-center md:text-right">
          <span className="text-xs uppercase tracking-[.14em] text-slate-400">School time</span>
          <strong className="mt-1 block text-2xl tabular-nums">{currentTime}</strong>
        </div>
      </header>

      <section className="grid w-full gap-6 rounded-3xl border border-white/10 bg-white p-6 text-slate-900 shadow-2xl sm:p-10 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-slate-200 bg-white p-5 sm:min-h-[520px]">
          {svg ? <div aria-label="Live school staff check-in QR code" className="w-full max-w-[500px] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="max-w-md text-center"><strong className="block text-xl text-slate-800">{loading ? "Generating secure check-in code…" : "Attendance verification is not available"}</strong>{error ? <p className="mt-3 text-sm leading-6 text-amber-700">{error}</p> : null}</div>}
        </div>

        <aside className="flex flex-col justify-between rounded-3xl bg-slate-50 p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Verification flow</p>
            <div className="mt-5 space-y-3">
              <Step n="1" title="Scan live QR" detail="Open School Check-In from your signed-in staff portal." />
              {requirePresence ? <Step n="2" title="Prove you are at school" detail="School network and/or device location is verified." /> : <Step n="2" title="Session verification" detail="Your signed-in staff account is verified." />}
              {requireFace ? <Step n="3" title="Verify your face" detail="Front camera confirms the signed-in staff identity before attendance is accepted." /> : <Step n="3" title="Confirm check-in" detail="The verified staff session is recorded." />}
              <Step n="4" title="Attendance is classified" detail="SukuuNova records on-time or late status using the school's configured rule." />
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-5">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Current code</p><p className="mt-1 text-3xl font-bold tabular-nums">{remaining}s</p></div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${token ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{token ? "LIVE" : "CLOSED"}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">New QR every {refreshSeconds} seconds · staff verification closes at {closeTime}.</p>
            {location ? <p className="mt-3 text-xs font-medium text-emerald-700">Display location ready.</p> : <p className="mt-3 text-xs font-medium text-amber-700">Display location unavailable; network verification may be required.</p>}
          </div>
        </aside>
      </section>
      <p className="mt-6 text-center text-xs text-slate-400">Keep this page on the school's designated attendance screen. A screenshot becomes useless when its short-lived code expires.</p>
    </div>
  </main>;
}

function Step({ n, title, detail }: { n: string; title: string; detail: string }) {
  return <div className="grid grid-cols-[34px_1fr] gap-3 rounded-2xl border border-slate-200 bg-white p-3"><span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-900 text-xs font-bold text-white">{n}</span><div><strong className="text-sm text-slate-900">{title}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div></div>;
}
