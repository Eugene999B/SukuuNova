"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BusFront, CheckCircle2, Clock3, Cpu, Loader2, MapPinned, Play, RefreshCw, RotateCcw, Route, ShieldCheck, Square, Wifi } from "lucide-react";
import { TransportStreetMap } from "@/components/TransportStreetMap";
import "./transport-control-room.css";

type Vehicle = { id: string; name: string | null; registrationNumber: string; capacity?: number | null; driverName?: string | null; driverPhone?: string | null };
type BusRoute = { id: string; name: string; code: string; origin?: string | null; destination?: string | null };
type LatestLocation = { id?: string; vehicleId: string; latitude: string | number; longitude: string | number; speedKph?: string | number | null; heading?: string | number | null; reportedAt?: string | null; routeId?: string | null };
type CoreTransport = { scope: "school" | "family"; canManage: boolean; vehicles: Vehicle[]; routes: BusRoute[]; locations: LatestLocation[] };
type Tracker = { id: string; vehicleId: string | null; registrationNumber: string | null; vehicleName: string | null; model: string; status: string; firmwareVersion: string | null; lastSeenAt: string | null; lastPowerState: string | null; lastNetworkState: string | null; certificationStatus: string | null; certificationStartedAt: string | null; certificationEndedAt: string | null; acceptedPackets: number | null; rejectedPackets: number | null; acceptedRatio: string | null; latestPacketAgeSeconds: string | null; failureReasons: unknown };
type Trip = { id: string; routeId: string; routeName: string; vehicleId: string; registrationNumber: string; direction: string; status: string; startedAt: string | null; lastLocationAt: string | null; latitude: string | null; longitude: string | null; speedKph: string | null; reportedAt: string | null; routeDeviation: boolean | null; routeMatchConfidence: string | null };
type Pickup = { id: string; studentName: string; guardianName: string; direction: string; label: string | null; requestedAt: string };
type Incident = { id: string; type: string; severity: string; status: string; openedAt: string; routeName: string; registrationNumber: string };
type Intelligence = { pendingPickups: Pickup[]; trackers: Tracker[]; activeTrips: Trip[]; recentAlerts: Array<Record<string, unknown>>; routeReadiness: Array<{ id: string; name: string; code: string; morningShapePoints: number; afternoonShapePoints: number }>; openIncidents: Incident[] };

const EMPTY_INTELLIGENCE: Intelligence = { pendingPickups: [], trackers: [], activeTrips: [], recentAlerts: [], routeReadiness: [], openIncidents: [] };

function ageLabel(value: string | null | undefined) {
  if (!value) return "No signal yet";
  const age = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(age)) return "Unknown";
  const seconds = Math.round(age / 1000);
  if (seconds < 10) return "Live now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function titleCase(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "—";
}

async function jsonOrThrow(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || body?.error || "Transport request failed.");
  return body;
}

export default function TransportControlRoom() {
  const [core, setCore] = useState<CoreTransport | null>(null);
  const [intelligence, setIntelligence] = useState<Intelligence>(EMPTY_INTELLIGENCE);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [pairVehicleId, setPairVehicleId] = useState("");
  const [imei, setImei] = useState("");
  const [simMsisdn, setSimMsisdn] = useState("");
  const [apn, setApn] = useState("");
  const [tripRouteId, setTripRouteId] = useState("");
  const [tripVehicleId, setTripVehicleId] = useState("");
  const [tripTrackerId, setTripTrackerId] = useState("");
  const [tripDirection, setTripDirection] = useState<"morning" | "afternoon">("morning");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const coreResponse = await fetch("/api/phase3/transport", { cache: "no-store" });
      const coreBody = await jsonOrThrow(coreResponse) as CoreTransport;
      setCore(coreBody);
      if (!pairVehicleId && coreBody.vehicles[0]) setPairVehicleId(coreBody.vehicles[0].id);
      if (!tripRouteId && coreBody.routes[0]) setTripRouteId(coreBody.routes[0].id);
      if (!tripVehicleId && coreBody.vehicles[0]) setTripVehicleId(coreBody.vehicles[0].id);

      if (coreBody.canManage) {
        const intelligenceResponse = await fetch("/api/school/transport/intelligence", { cache: "no-store" });
        const intelligenceBody = await jsonOrThrow(intelligenceResponse) as Intelligence;
        setIntelligence(intelligenceBody);
        setSelectedTripId((current) => current && intelligenceBody.activeTrips.some((trip) => trip.id === current) ? current : intelligenceBody.activeTrips.find((trip) => trip.status === "active")?.id || intelligenceBody.activeTrips[0]?.id || "");
        if (!tripTrackerId) {
          const usable = intelligenceBody.trackers.find((tracker) => tracker.status === "active" || tracker.status === "testing");
          if (usable) setTripTrackerId(usable.id);
        }
      }
      setError("");
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : "Transport data could not be loaded.");
    } finally {
      setLoading(false);
      if (!quiet) setRefreshing(false);
    }
  }, [pairVehicleId, tripRouteId, tripTrackerId, tripVehicleId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => void load(true), 7_500); return () => window.clearInterval(timer); }, [load]);

  const selectedTrip = useMemo(() => intelligence.activeTrips.find((trip) => trip.id === selectedTripId) || intelligence.activeTrips.find((trip) => trip.status === "active") || intelligence.activeTrips[0] || null, [intelligence.activeTrips, selectedTripId]);
  const fallbackLocation = useMemo(() => core?.locations.find((location) => location.vehicleId === selectedTrip?.vehicleId) || core?.locations[0] || null, [core?.locations, selectedTrip?.vehicleId]);
  const mapBus = selectedTrip?.latitude && selectedTrip?.longitude ? {
    latitude: selectedTrip.latitude,
    longitude: selectedTrip.longitude,
    speedKph: selectedTrip.speedKph,
    label: `${selectedTrip.registrationNumber} · ${selectedTrip.routeName}`,
  } : fallbackLocation ? {
    latitude: fallbackLocation.latitude,
    longitude: fallbackLocation.longitude,
    speedKph: fallbackLocation.speedKph,
    heading: fallbackLocation.heading,
    label: core?.vehicles.find((vehicle) => vehicle.id === fallbackLocation.vehicleId)?.registrationNumber || "School vehicle",
  } : null;
  const liveTrackers = intelligence.trackers.filter((tracker) => tracker.lastSeenAt && Date.now() - new Date(tracker.lastSeenAt).getTime() < 120_000).length;
  const activeTrips = intelligence.activeTrips.filter((trip) => trip.status === "active");
  const selectedVehicleTracker = intelligence.trackers.find((tracker) => tracker.vehicleId === tripVehicleId && (tracker.status === "active" || tracker.status === "testing"));

  async function postIntelligence(payload: Record<string, unknown>, key: string, success: string) {
    setBusy(key); setMessage(""); setError("");
    try {
      await jsonOrThrow(await fetch("/api/school/transport/intelligence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
      setMessage(success);
      await load(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Transport action failed."); }
    finally { setBusy(""); }
  }

  async function pairTracker(event: FormEvent) {
    event.preventDefault();
    const cleanedImei = imei.replace(/\s+/g, "");
    if (!/^\d{14,20}$/.test(cleanedImei)) { setError("Enter the numeric IMEI printed on the tracker (14–20 digits)."); return; }
    if (!pairVehicleId) { setError("Choose the vehicle this tracker is installed in."); return; }
    await postIntelligence({ action: "registerTracker", vehicleId: pairVehicleId, imei: cleanedImei, model: "FMC130", simMsisdn: simMsisdn.trim() || undefined, apn: apn.trim() || undefined }, "pair", "Tracker paired to the vehicle. SukuuNova has started its certification cycle; incoming telemetry will determine when it can become active.");
    setImei(""); setSimMsisdn(""); setApn("");
  }

  async function startTrip(event: FormEvent) {
    event.preventDefault();
    const trackerId = tripTrackerId || selectedVehicleTracker?.id || "";
    if (!tripRouteId || !tripVehicleId || !trackerId) { setError("Choose a route, vehicle and paired tracker before starting a trip."); return; }
    await postIntelligence({ action: "startTrip", routeId: tripRouteId, vehicleId: tripVehicleId, trackerDeviceId: trackerId, direction: tripDirection }, "start-trip", "Trip started. Live accepted GPS fixes will now drive the control room and family transport views.");
  }

  if (loading) return <div className="tcr-loading"><Loader2 className="tcr-spin"/><strong>Opening Transport Control Room…</strong></div>;

  return <main className="tcr-page">
    <section className="tcr-hero">
      <div><span className="tcr-kicker">TRANSPORT CONTROL ROOM</span><h2>Live fleet visibility without exposing tracker complexity.</h2><p>Pair a certified tracker to a vehicle, start a route trip and watch accepted GPS updates flow into SukuuNova. Family accounts receive only the transport data linked to their children.</p></div>
      <button className="button secondary" type="button" onClick={() => void load()} disabled={refreshing}><RefreshCw className={refreshing ? "tcr-spin" : ""} size={16}/>{refreshing ? "Refreshing…" : "Refresh"}</button>
    </section>

    {message ? <div className="tcr-notice is-success"><CheckCircle2 size={18}/><span>{message}</span></div> : null}
    {error ? <div className="tcr-notice is-danger"><AlertTriangle size={18}/><span>{error}</span></div> : null}

    <section className="tcr-kpis">
      <article><BusFront/><span>Active trips</span><strong>{activeTrips.length}</strong><small>{intelligence.activeTrips.length} scheduled / active</small></article>
      <article><Wifi/><span>Live trackers</span><strong>{liveTrackers}</strong><small>{intelligence.trackers.length} paired inventory</small></article>
      <article><MapPinned/><span>Pickup reviews</span><strong>{intelligence.pendingPickups.length}</strong><small>Pending family requests</small></article>
      <article className={intelligence.openIncidents.length ? "is-warning" : "is-good"}><ShieldCheck/><span>Open incidents</span><strong>{intelligence.openIncidents.length}</strong><small>{intelligence.openIncidents.length ? "Needs attention" : "No open incident"}</small></article>
    </section>

    <section className="tcr-grid tcr-live-grid">
      <div className="tcr-card tcr-map-card">
        <div className="tcr-card-head"><div><span className="tcr-kicker">LIVE FLEET</span><h3>{selectedTrip ? selectedTrip.routeName : "Latest vehicle position"}</h3><p>{selectedTrip ? `${selectedTrip.registrationNumber} · ${titleCase(selectedTrip.direction)} · ${titleCase(selectedTrip.status)}` : "Map centers on the newest accepted location available."}</p></div><span className="tcr-freshness"><Clock3 size={14}/>{ageLabel(selectedTrip?.reportedAt || fallbackLocation?.reportedAt)}</span></div>
        <TransportStreetMap bus={mapBus}/>
        {intelligence.activeTrips.length ? <div className="tcr-trip-tabs">{intelligence.activeTrips.map((trip) => <button key={trip.id} type="button" className={trip.id === selectedTrip?.id ? "is-active" : ""} onClick={() => setSelectedTripId(trip.id)}><strong>{trip.registrationNumber}</strong><span>{trip.routeName} · {titleCase(trip.direction)}</span></button>)}</div> : <p className="tcr-empty-inline">No scheduled or active NovaCore trip yet. Pair a tracker and start a trip below.</p>}
      </div>

      <aside className="tcr-card">
        <div className="tcr-card-head"><div><span className="tcr-kicker">TRACKER HEALTH</span><h3>Paired devices</h3><p>Only certified telemetry should power a live family trip.</p></div></div>
        <div className="tcr-device-list">{intelligence.trackers.length ? intelligence.trackers.map((tracker) => <article key={tracker.id}>
          <div className="tcr-device-top"><Cpu size={18}/><div><strong>{tracker.vehicleName || tracker.registrationNumber || "Unassigned vehicle"}</strong><span>{tracker.model} · {titleCase(tracker.status)}</span></div><b data-state={tracker.certificationStatus || tracker.status}>{titleCase(tracker.certificationStatus || tracker.status)}</b></div>
          <div className="tcr-device-meta"><span><Wifi size={13}/>{ageLabel(tracker.lastSeenAt)}</span><span>{tracker.acceptedPackets ?? 0} accepted</span><span>{tracker.rejectedPackets ?? 0} rejected</span></div>
          {core?.canManage && tracker.status !== "retired" ? <button type="button" className="button secondary compact" disabled={busy === `cert-${tracker.id}`} onClick={() => void postIntelligence({ action: "restartCertification", trackerDeviceId: tracker.id }, `cert-${tracker.id}`, "Tracker certification restarted. SukuuNova will assess fresh telemetry before activation.")}><RotateCcw size={14}/>Restart certification</button> : null}
        </article>) : <div className="tcr-empty-inline">No certified tracker inventory yet.</div>}</div>
      </aside>
    </section>

    {core?.canManage ? <section className="tcr-grid tcr-setup-grid">
      <form className="tcr-card tcr-form" onSubmit={pairTracker}>
        <div className="tcr-card-head"><div><span className="tcr-kicker">ONE-STEP PAIRING</span><h3>Pair Teltonika FMC130</h3><p>The IMEI is used to bind incoming TCP telemetry to the correct school and vehicle. It is not returned by the management API after registration.</p></div></div>
        <div className="tcr-form-body">
          <label>Vehicle<select value={pairVehicleId} onChange={(event) => setPairVehicleId(event.target.value)} required><option value="">Choose vehicle</option>{core.vehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.name || vehicle.registrationNumber} · {vehicle.registrationNumber}</option>)}</select></label>
          <label>Tracker IMEI<input value={imei} onChange={(event) => setImei(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="15-digit IMEI" required/></label>
          <div className="tcr-two"><label>SIM phone (optional)<input value={simMsisdn} onChange={(event) => setSimMsisdn(event.target.value)} placeholder="e.g. +233…"/></label><label>APN (optional)<input value={apn} onChange={(event) => setApn(event.target.value)} placeholder="Network APN"/></label></div>
          <div className="tcr-hint"><ShieldCheck size={17}/><span>Pairing creates a testing device, gateway binding and certification run. The tracker becomes suitable for live operations only after reliable telemetry passes certification.</span></div>
          <button className="button primary" type="submit" disabled={busy === "pair"}>{busy === "pair" ? <Loader2 className="tcr-spin" size={16}/> : <Cpu size={16}/>}Pair tracker</button>
        </div>
      </form>

      <form className="tcr-card tcr-form" onSubmit={startTrip}>
        <div className="tcr-card-head"><div><span className="tcr-kicker">TRIP CONTROL</span><h3>Start a live route</h3><p>Trip state links the tracker, route and vehicle so GPS fixes can drive ETA, route-deviation and guardian alerts.</p></div></div>
        <div className="tcr-form-body">
          <label>Route<select value={tripRouteId} onChange={(event) => setTripRouteId(event.target.value)} required><option value="">Choose route</option>{core.routes.map((route) => <option value={route.id} key={route.id}>{route.name} · {route.code}</option>)}</select></label>
          <label>Vehicle<select value={tripVehicleId} onChange={(event) => { setTripVehicleId(event.target.value); const match = intelligence.trackers.find((tracker) => tracker.vehicleId === event.target.value && (tracker.status === "active" || tracker.status === "testing")); setTripTrackerId(match?.id || ""); }} required><option value="">Choose vehicle</option>{core.vehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.name || vehicle.registrationNumber} · {vehicle.registrationNumber}</option>)}</select></label>
          <label>Paired tracker<select value={tripTrackerId} onChange={(event) => setTripTrackerId(event.target.value)} required><option value="">Choose tracker</option>{intelligence.trackers.filter((tracker) => tracker.vehicleId === tripVehicleId).map((tracker) => <option value={tracker.id} key={tracker.id}>{tracker.model} · {titleCase(tracker.status)} · {titleCase(tracker.certificationStatus)}</option>)}</select></label>
          <div className="tcr-segmented"><button type="button" className={tripDirection === "morning" ? "is-active" : ""} onClick={() => setTripDirection("morning")}>Morning</button><button type="button" className={tripDirection === "afternoon" ? "is-active" : ""} onClick={() => setTripDirection("afternoon")}>Afternoon</button></div>
          <button className="button primary" type="submit" disabled={busy === "start-trip"}>{busy === "start-trip" ? <Loader2 className="tcr-spin" size={16}/> : <Play size={16}/>}Start live trip</button>
        </div>
      </form>
    </section> : <div className="tcr-notice"><ShieldCheck size={18}/><span>You have transport view access. Tracker pairing and trip controls require Transport Management permission.</span></div>}

    <section className="tcr-grid tcr-operations-grid">
      <div className="tcr-card"><div className="tcr-card-head"><div><span className="tcr-kicker">ACTIVE / SCHEDULED</span><h3>Trip operations</h3></div></div><div className="tcr-rows">{intelligence.activeTrips.length ? intelligence.activeTrips.map((trip) => <article key={trip.id}><div><strong>{trip.routeName}</strong><span>{trip.registrationNumber} · {titleCase(trip.direction)} · {ageLabel(trip.reportedAt || trip.lastLocationAt)}</span></div><b data-state={trip.status}>{titleCase(trip.status)}</b>{core?.canManage && trip.status === "active" ? <button className="button secondary compact" type="button" disabled={busy === `finish-${trip.id}`} onClick={() => void postIntelligence({ action: "finishTrip", tripId: trip.id }, `finish-${trip.id}`, "Trip finished. Family live tracking for this run is now closed.")}><Square size={13}/>Finish</button> : null}</article>) : <p className="tcr-empty-inline">No active or scheduled trip.</p>}</div></div>
      <div className="tcr-card"><div className="tcr-card-head"><div><span className="tcr-kicker">SAFETY QUEUE</span><h3>Open incidents</h3></div></div><div className="tcr-rows">{intelligence.openIncidents.length ? intelligence.openIncidents.map((incident) => <article key={incident.id}><AlertTriangle size={17}/><div><strong>{titleCase(incident.type)}</strong><span>{incident.routeName} · {incident.registrationNumber} · {ageLabel(incident.openedAt)}</span></div><b data-state={incident.severity}>{titleCase(incident.severity)}</b></article>) : <p className="tcr-empty-inline"><CheckCircle2 size={16}/> No open transport incidents.</p>}</div></div>
      <div className="tcr-card"><div className="tcr-card-head"><div><span className="tcr-kicker">ROUTE READINESS</span><h3>GPS route shapes</h3></div></div><div className="tcr-rows">{intelligence.routeReadiness.length ? intelligence.routeReadiness.map((route) => <article key={route.id}><Route size={17}/><div><strong>{route.name}</strong><span>{route.code}</span></div><span className="tcr-shape-count">AM {route.morningShapePoints} · PM {route.afternoonShapePoints}</span></article>) : <p className="tcr-empty-inline">No routes created yet.</p>}</div></div>
      <div className="tcr-card"><div className="tcr-card-head"><div><span className="tcr-kicker">FAMILY LOCATIONS</span><h3>Pending pickup requests</h3></div></div><div className="tcr-rows">{intelligence.pendingPickups.length ? intelligence.pendingPickups.map((pickup) => <article key={pickup.id}><MapPinned size={17}/><div><strong>{pickup.studentName}</strong><span>{pickup.guardianName} · {titleCase(pickup.direction)} · {pickup.label || "Map point"}</span></div>{core?.canManage ? <div className="tcr-row-actions"><button className="button secondary compact" type="button" onClick={() => void postIntelligence({ action: "reviewPickup", pickupPointId: pickup.id, decision: "reject", note: "Reviewed from Transport Control Room" }, `pickup-${pickup.id}`, "Pickup request rejected.")}>Reject</button><button className="button primary compact" type="button" onClick={() => void postIntelligence({ action: "reviewPickup", pickupPointId: pickup.id, decision: "approve", note: "Approved from Transport Control Room" }, `pickup-${pickup.id}`, "Pickup request approved.")}>Approve</button></div> : null}</article>) : <p className="tcr-empty-inline">No pending family pickup request.</p>}</div></div>
    </section>
  </main>;
}
