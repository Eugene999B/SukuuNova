"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BusFront, Clock3, Crosshair, LocateFixed, MapPin, RefreshCw, Route, ShieldCheck, TriangleAlert } from "lucide-react";
import "./guardian-transport-workspace.css";

type PickupDirection = "morning" | "afternoon";

type Pickup = {
  id: string;
  direction: PickupDirection;
  label: string | null;
  latitude: string;
  longitude: string;
  status: string;
  isTemporary: boolean;
  requestedAt: string;
  approvedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  decisionNote: string | null;
};

type RoutePoint = { latitude: string; longitude: string; sequence: number };
type LatestLocation = {
  latitude: string;
  longitude: string;
  rawLatitude: string;
  rawLongitude: string;
  speedKph: string;
  heading: string | null;
  reportedAt: string;
  routeDeviation: boolean;
  routeDistanceMeters: string | null;
  routeProgressMeters: string | null;
  routeRemainingMeters: string | null;
  routeMatchConfidence: string | null;
  algorithmVersion: string | null;
};
type ChildProgress = {
  state: string;
  etaMinutes: number | null;
  etaConfidenceMinutes: number | null;
  routeRemainingMeters: string | null;
  predictionVersion: string | null;
  approachingAt: string | null;
  arrivingAt: string | null;
  arrivedAt: string | null;
  passedAt: string | null;
  updatedAt: string;
};
type ActiveTrip = {
  id: string;
  direction: PickupDirection;
  status: string;
  startedAt: string | null;
  lastLocationAt: string | null;
  vehicleId: string;
  registrationNumber: string;
  vehicleName: string | null;
  latestLocation: LatestLocation | null;
  routeShape: RoutePoint[];
  childProgress: ChildProgress | null;
};
type AlertRow = { id: string; type: string; status: string; queuedAt: string; sentAt: string | null; details: unknown };
type ChildTransport = {
  student: { id: string; name: string; admissionNo: string; class: { name: string } | null };
  assignment: { id: string; routeId: string; vehicleId: string | null; morningEnabled: boolean; afternoonEnabled: boolean } | null;
  route: { id: string; name: string; code: string; origin: string | null; destination: string | null } | null;
  pickups: Pickup[];
  activeTrip: ActiveTrip | null;
  alerts: AlertRow[];
};
export type GuardianTransportData = { children: ChildTransport[] };

type MapPoint = { lat: number; lng: number };

function number(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function stateLabel(value: string | null | undefined) {
  if (!value) return "Waiting for trip";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pickupIsActive(pickup: Pickup, now = Date.now()) {
  if (pickup.status !== "approved") return false;
  const from = pickup.effectiveFrom ? new Date(pickup.effectiveFrom).getTime() : Number.NEGATIVE_INFINITY;
  const to = pickup.effectiveTo ? new Date(pickup.effectiveTo).getTime() : Number.POSITIVE_INFINITY;
  return from <= now && to >= now;
}

function latestApprovedPickup(child: ChildTransport, direction: PickupDirection | null) {
  const active = child.pickups.filter((pickup) => pickupIsActive(pickup));
  if (!direction) return active[0] ?? null;
  return active.find((pickup) => pickup.direction === direction) ?? null;
}

function freshnessLabel(reportedAt: string | null | undefined, nowMs: number) {
  if (!reportedAt) return { label: "No GPS fix yet", stale: true };
  const ageSeconds = Math.max(0, Math.round((nowMs - new Date(reportedAt).getTime()) / 1000));
  if (!Number.isFinite(ageSeconds)) return { label: "GPS time unavailable", stale: true };
  if (ageSeconds < 10) return { label: "Live now", stale: false };
  if (ageSeconds < 60) return { label: `${ageSeconds}s ago`, stale: false };
  const minutes = Math.floor(ageSeconds / 60);
  return { label: `${minutes}m ago · location delayed`, stale: true };
}

function TransportRouteMap({ shape, bus, pickup }: { shape: RoutePoint[]; bus: LatestLocation | null; pickup: Pickup | null }) {
  const geometry = useMemo(() => {
    const routePoints = shape
      .map((point) => ({ lat: number(point.latitude), lng: number(point.longitude) }))
      .filter((point): point is MapPoint => point.lat !== null && point.lng !== null);
    const busPoint = bus ? { lat: number(bus.latitude), lng: number(bus.longitude) } : null;
    const pickupPoint = pickup ? { lat: number(pickup.latitude), lng: number(pickup.longitude) } : null;
    const locatedBus = busPoint && busPoint.lat !== null && busPoint.lng !== null ? busPoint as MapPoint : null;
    const locatedPickup = pickupPoint && pickupPoint.lat !== null && pickupPoint.lng !== null ? pickupPoint as MapPoint : null;
    const all = [...routePoints, ...(locatedBus ? [locatedBus] : []), ...(locatedPickup ? [locatedPickup] : [])];
    if (!all.length) return null;
    const minLat = Math.min(...all.map((point) => point.lat));
    const maxLat = Math.max(...all.map((point) => point.lat));
    const minLng = Math.min(...all.map((point) => point.lng));
    const maxLng = Math.max(...all.map((point) => point.lng));
    const latSpan = Math.max(maxLat - minLat, 0.0005);
    const lngSpan = Math.max(maxLng - minLng, 0.0005);
    const width = 760;
    const height = 350;
    const pad = 34;
    const project = (point: MapPoint) => ({ x: pad + ((point.lng - minLng) / lngSpan) * (width - pad * 2), y: height - pad - ((point.lat - minLat) / latSpan) * (height - pad * 2) });
    return { routePoints: routePoints.map(project), bus: locatedBus ? project(locatedBus) : null, pickup: locatedPickup ? project(locatedPickup) : null, width, height };
  }, [shape, bus, pickup]);

  if (!geometry) return <div className="guardian-transport-map-empty"><Route size={28}/><strong>Route map will appear when transport data is available.</strong><span>The school must assign a route and, for live tracking, start a trip with accepted GPS fixes.</span></div>;
  const path = geometry.routePoints.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return <div className="guardian-transport-map-shell">
    <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label="Live school transport route showing the bus and saved family pickup point">
      <rect className="guardian-transport-map-bg" x="0" y="0" width={geometry.width} height={geometry.height} rx="18"/>
      {path ? <path className="guardian-transport-route-line" d={path} fill="none" vectorEffect="non-scaling-stroke"/> : null}
      {geometry.routePoints[0] ? <circle className="guardian-transport-route-end" cx={geometry.routePoints[0].x} cy={geometry.routePoints[0].y} r="7"/> : null}
      {geometry.routePoints.length > 1 ? <circle className="guardian-transport-route-end" cx={geometry.routePoints.at(-1)!.x} cy={geometry.routePoints.at(-1)!.y} r="7"/> : null}
      {geometry.pickup ? <g className="guardian-transport-pickup-marker"><circle cx={geometry.pickup.x} cy={geometry.pickup.y} r="15"/><circle className="guardian-transport-marker-core" cx={geometry.pickup.x} cy={geometry.pickup.y} r="5"/></g> : null}
      {geometry.bus ? <g className="guardian-transport-bus-marker"><circle cx={geometry.bus.x} cy={geometry.bus.y} r="18"/><path d={`M${geometry.bus.x - 8},${geometry.bus.y - 5} h16 v11 h-16 z M${geometry.bus.x - 5},${geometry.bus.y + 8} a3,3 0 1,0 0.1,0 M${geometry.bus.x + 5},${geometry.bus.y + 8} a3,3 0 1,0 0.1,0`} fill="none" vectorEffect="non-scaling-stroke"/></g> : null}
    </svg>
    <div className="guardian-transport-map-legend"><span><i className="is-bus"/>Live bus</span><span><i className="is-pickup"/>Family pickup</span><span><i className="is-route"/>School route shape</span></div>
  </div>;
}

export function GuardianTransportWorkspace({ initialData }: { initialData: GuardianTransportData }) {
  const [data, setData] = useState(initialData);
  const [selectedId, setSelectedId] = useState(initialData.children[0]?.student.id ?? "");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [direction, setDirection] = useState<PickupDirection>("morning");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [label, setLabel] = useState("");
  const [temporary, setTemporary] = useState(false);
  const [effectiveTo, setEffectiveTo] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const response = await fetch("/api/guardian/transport", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || body?.message || "Transport data could not be refreshed.");
      setData(body as GuardianTransportData);
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? error.message : "Transport data could not be refreshed.");
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const dataTimer = window.setInterval(() => { void load(true); }, 15_000);
    const clockTimer = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => { window.clearInterval(dataTimer); window.clearInterval(clockTimer); };
  }, [load]);

  const child = data.children.find((item) => item.student.id === selectedId) ?? data.children[0] ?? null;
  useEffect(() => {
    if (!child) return;
    if (direction === "morning" && child.assignment && !child.assignment.morningEnabled && child.assignment.afternoonEnabled) setDirection("afternoon");
    if (direction === "afternoon" && child.assignment && !child.assignment.afternoonEnabled && child.assignment.morningEnabled) setDirection("morning");
  }, [child, direction]);

  if (!child) return <div className="guardian-transport-empty"><BusFront size={34}/><h2>No transport-linked learner yet</h2><p>When the school assigns transport to a linked child, the route, family pickup location and live-trip tools will appear here.</p></div>;

  const trip = child.activeTrip;
  const pickup = latestApprovedPickup(child, trip?.direction ?? direction);
  const freshness = freshnessLabel(trip?.latestLocation?.reportedAt, nowMs);
  const progress = trip?.childProgress;
  const etaText = progress?.etaMinutes != null ? `${Math.max(0, Math.round(progress.etaMinutes))} min${progress.etaConfidenceMinutes != null ? ` ± ${Math.max(1, Math.round(progress.etaConfidenceMinutes))}` : ""}` : "Calculating";

  const useCurrentLocation = () => {
    setMessage("");
    if (!navigator.geolocation) { setMessage("Location is not available in this browser. You can enter coordinates manually."); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(7));
        setLongitude(position.coords.longitude.toFixed(7));
        setMessage(`Location identified to about ${Math.max(1, Math.round(position.coords.accuracy))} m accuracy. Save it when ready.`);
      },
      () => setMessage("Your location could not be identified. Allow location access or enter coordinates manually."),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  };

  const savePickup = async () => {
    setMessage("");
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { setMessage("Choose Use my current location or enter valid coordinates."); return; }
    if (temporary && !effectiveTo) { setMessage("Choose when this temporary pickup point should end."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/guardian/transport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "savePickup", studentId: child.student.id, direction, latitude: lat, longitude: lng, label: label.trim() || undefined, isTemporary: temporary, effectiveTo: temporary && effectiveTo ? new Date(effectiveTo).toISOString() : undefined }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || body?.message || "Pickup location could not be saved.");
      setLatitude(""); setLongitude(""); setLabel(""); setTemporary(false); setEffectiveTo("");
      setMessage("Pickup location saved and active. The school route itself has not been changed.");
      await load(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pickup location could not be saved.");
    } finally { setSaving(false); }
  };

  return <div className="guardian-transport-workspace">
    <section className="guardian-transport-hero">
      <div><span>Family transport intelligence</span><h2>Know where the school bus is—and when it is reaching your child.</h2><p>Live GPS is filtered through NovaCore. Your family controls its own pickup/drop-off point; the school's bus route and transport assignment remain school-controlled.</p></div>
      <button className="button secondary" type="button" onClick={() => void load()} disabled={refreshing}><RefreshCw size={15}/>{refreshing ? "Refreshing…" : "Refresh live data"}</button>
    </section>

    <div className="guardian-transport-child-tabs" role="tablist" aria-label="Linked children">
      {data.children.map((item) => <button key={item.student.id} type="button" className={item.student.id === child.student.id ? "is-active" : ""} onClick={() => setSelectedId(item.student.id)}><strong>{item.student.name}</strong><span>{item.student.class?.name ?? "Class not assigned"}</span></button>)}
    </div>

    <section className="guardian-transport-summary">
      <article><BusFront/><span>Vehicle</span><strong>{trip ? trip.vehicleName || trip.registrationNumber : "No active trip"}</strong><small>{trip ? trip.registrationNumber : child.route?.name ?? "Waiting for school route"}</small></article>
      <article className={freshness.stale ? "is-warning" : "is-good"}><LocateFixed/><span>GPS freshness</span><strong>{freshness.label}</strong><small>{trip?.latestLocation ? `${Number(trip.latestLocation.speedKph).toFixed(0)} km/h · ${trip.latestLocation.algorithmVersion ?? "NovaCore"}` : "No accepted live location"}</small></article>
      <article><Clock3/><span>Pickup ETA</span><strong>{trip ? etaText : "No active trip"}</strong><small>{progress ? `${stateLabel(progress.state)} · ${progress.predictionVersion ?? "ETA engine"}` : "ETA appears when the route is active"}</small></article>
      <article className={trip?.latestLocation?.routeDeviation ? "is-warning" : "is-good"}><ShieldCheck/><span>Route state</span><strong>{trip?.latestLocation?.routeDeviation ? "Route deviation" : trip ? "On planned route" : "Waiting"}</strong><small>{trip?.latestLocation?.routeMatchConfidence ? `${Math.round(Number(trip.latestLocation.routeMatchConfidence) * 100)}% map-match confidence` : child.route?.code ?? "—"}</small></article>
    </section>

    <section className="guardian-transport-main-grid">
      <div className="guardian-transport-panel guardian-transport-live-panel">
        <div className="guardian-transport-panel-head"><div><span>Live route</span><h3>{child.route?.name ?? "Transport route"}</h3><p>{child.route ? `${child.route.origin ?? "School route"} → ${child.route.destination ?? "Destination"}` : "A school route has not been assigned yet."}</p></div>{trip ? <b>{stateLabel(trip.direction)} trip</b> : null}</div>
        <TransportRouteMap shape={trip?.routeShape ?? []} bus={trip?.latestLocation ?? null} pickup={pickup}/>
        <div className="guardian-transport-coordinate-strip">
          <div><span>Bus position</span><strong>{trip?.latestLocation ? `${Number(trip.latestLocation.latitude).toFixed(5)}, ${Number(trip.latestLocation.longitude).toFixed(5)}` : "No fix"}</strong></div>
          <div><span>Family pickup</span><strong>{pickup ? `${Number(pickup.latitude).toFixed(5)}, ${Number(pickup.longitude).toFixed(5)}` : "Not set"}</strong></div>
          <div><span>Trip started</span><strong>{dateTime(trip?.startedAt)}</strong></div>
        </div>
        {trip?.latestLocation?.routeDeviation ? <div className="guardian-transport-warning"><TriangleAlert size={18}/><div><strong>The bus is outside the expected route corridor.</strong><span>The school transport team can see the same deviation signal in its command centre.</span></div></div> : null}
      </div>

      <aside className="guardian-transport-panel guardian-transport-pickup-panel">
        <div className="guardian-transport-panel-head"><div><span>Family pickup point</span><h3>Set or change the location</h3><p>Use the phone/computer location button or enter coordinates. Saving updates the child's pickup point immediately; it does not alter the school's bus route.</p></div></div>
        <div className="guardian-transport-current-pickup"><MapPin size={20}/><div><span>Current saved point</span><strong>{pickup?.label || (pickup ? `${pickup.latitude}, ${pickup.longitude}` : "No pickup point set")}</strong>{pickup ? <small>{stateLabel(pickup.direction)}{pickup.isTemporary ? ` · temporary until ${dateTime(pickup.effectiveTo)}` : ""}</small> : null}</div></div>
        <div className="guardian-transport-form">
          <label><span>Journey</span><select value={direction} onChange={(event) => setDirection(event.target.value as PickupDirection)}><option value="morning" disabled={child.assignment ? !child.assignment.morningEnabled : false}>Morning pickup</option><option value="afternoon" disabled={child.assignment ? !child.assignment.afternoonEnabled : false}>Afternoon drop-off</option></select></label>
          <label><span>Location label</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Home gate / Junction" maxLength={160}/></label>
          <div className="guardian-transport-coordinate-inputs"><label><span>Latitude</span><input inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="5.6037"/></label><label><span>Longitude</span><input inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="-0.1870"/></label></div>
          <button type="button" className="button secondary" onClick={useCurrentLocation}><Crosshair size={15}/>Use my current location</button>
          <label className="guardian-transport-check"><input type="checkbox" checked={temporary} onChange={(event) => setTemporary(event.target.checked)}/><span>This location is temporary</span></label>
          {temporary ? <label><span>Temporary until</span><input type="datetime-local" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)}/></label> : null}
          <button type="button" className="button primary" onClick={() => void savePickup()} disabled={saving || !child.assignment}><MapPin size={15}/>{saving ? "Saving…" : pickup ? "Save new location" : "Save pickup location"}</button>
          {message ? <p className="guardian-transport-message" role="status">{message}</p> : null}
        </div>
      </aside>
    </section>

    <section className="guardian-transport-panel">
      <div className="guardian-transport-panel-head"><div><span>Transport notifications</span><h3>Recent alerts for {child.student.name}</h3><p>Approaching, arriving, arrived and passed events are deduplicated by trip and child.</p></div></div>
      <div className="guardian-transport-alerts">
        {child.alerts.length ? child.alerts.map((alert) => <article key={alert.id}><div className="guardian-transport-alert-icon"><BusFront size={16}/></div><div><strong>{stateLabel(alert.type)}</strong><span>{dateTime(alert.sentAt || alert.queuedAt)}</span></div><b>{stateLabel(alert.status)}</b></article>) : <div className="guardian-transport-map-empty"><Clock3 size={24}/><strong>No transport alerts yet.</strong><span>Trip events will appear here once the bus approaches the saved family pickup point.</span></div>}
      </div>
    </section>
  </div>;
}
