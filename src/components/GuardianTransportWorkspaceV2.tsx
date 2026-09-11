"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BusFront, CheckCircle2, Clock3, Crosshair, LocateFixed, MapPin, Navigation, RefreshCw, Route, Save, ShieldCheck, TriangleAlert } from "lucide-react";
import type { GuardianTransportData } from "@/components/GuardianTransportWorkspace";
import "./guardian-transport-workspace.css";
import "./guardian-transport-v2.css";

type PickupDirection = "morning" | "afternoon";
type PickupLike = {
  id: string; direction: PickupDirection; label: string | null; latitude: string; longitude: string; status: string; isTemporary: boolean; requestedAt: string; approvedAt: string | null; effectiveFrom: string | null; effectiveTo: string | null; decisionNote: string | null;
};
type RoutePointLike = { latitude: string; longitude: string; sequence: number };
type LatestLocationLike = { latitude: string; longitude: string; speedKph: string; reportedAt: string; routeDeviation: boolean };

type ChildLike = GuardianTransportData["children"][number];

type MapPoint = { lat: number; lng: number };
function num(value: string | number | null | undefined) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function when(value: string | null | undefined) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(parsed); }
function stateLabel(value: string | null | undefined) { return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Waiting for trip"; }
function currentPickup(child: ChildLike, direction: PickupDirection, now = Date.now()) {
  return (child.pickups as PickupLike[]).find((point) => point.direction === direction && point.status === "approved" && (!point.effectiveFrom || new Date(point.effectiveFrom).getTime() <= now) && (!point.effectiveTo || new Date(point.effectiveTo).getTime() >= now)) || null;
}
function freshness(value: string | null | undefined, now: number) {
  if (!value) return { label: "No GPS fix yet", stale: true };
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (!Number.isFinite(seconds)) return { label: "GPS time unavailable", stale: true };
  if (seconds < 10) return { label: "Live now", stale: false };
  if (seconds < 60) return { label: `${seconds}s ago`, stale: false };
  return { label: `${Math.floor(seconds / 60)}m ago`, stale: true };
}

function LiveRouteMap({ shape, bus, pickup }: { shape: RoutePointLike[]; bus: LatestLocationLike | null; pickup: PickupLike | null }) {
  const geometry = useMemo(() => {
    const route = shape.map((point) => ({ lat: num(point.latitude), lng: num(point.longitude) })).filter((point): point is MapPoint => point.lat !== null && point.lng !== null);
    const busRaw = bus ? { lat: num(bus.latitude), lng: num(bus.longitude) } : null;
    const pickupRaw = pickup ? { lat: num(pickup.latitude), lng: num(pickup.longitude) } : null;
    const busPoint = busRaw?.lat !== null && busRaw?.lat !== undefined && busRaw.lng !== null ? busRaw as MapPoint : null;
    const pickupPoint = pickupRaw?.lat !== null && pickupRaw?.lat !== undefined && pickupRaw.lng !== null ? pickupRaw as MapPoint : null;
    const all = [...route, ...(busPoint ? [busPoint] : []), ...(pickupPoint ? [pickupPoint] : [])];
    if (!all.length) return null;
    const minLat = Math.min(...all.map((point) => point.lat)); const maxLat = Math.max(...all.map((point) => point.lat));
    const minLng = Math.min(...all.map((point) => point.lng)); const maxLng = Math.max(...all.map((point) => point.lng));
    const latSpan = Math.max(maxLat - minLat, 0.0005); const lngSpan = Math.max(maxLng - minLng, 0.0005);
    const width = 760; const height = 350; const pad = 34;
    const project = (point: MapPoint) => ({ x: pad + ((point.lng - minLng) / lngSpan) * (width - pad * 2), y: height - pad - ((point.lat - minLat) / latSpan) * (height - pad * 2) });
    return { route: route.map(project), bus: busPoint ? project(busPoint) : null, pickup: pickupPoint ? project(pickupPoint) : null, width, height };
  }, [shape, bus, pickup]);
  if (!geometry) return <div className="guardian-transport-map-empty"><Route size={28}/><strong>Map will appear when route data is available.</strong><span>The school assigns the route; your saved family pickup location is then used automatically by the live-trip engine.</span></div>;
  const path = geometry.route.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return <div className="guardian-transport-map-shell"><svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" aria-label="Live school bus route and family pickup location"><rect className="guardian-transport-map-bg" x="0" y="0" width={geometry.width} height={geometry.height} rx="18"/>{path ? <path className="guardian-transport-route-line" d={path} fill="none" vectorEffect="non-scaling-stroke"/> : null}{geometry.route[0] ? <circle className="guardian-transport-route-end" cx={geometry.route[0].x} cy={geometry.route[0].y} r="7"/> : null}{geometry.pickup ? <g className="guardian-transport-pickup-marker"><circle cx={geometry.pickup.x} cy={geometry.pickup.y} r="15"/><circle className="guardian-transport-marker-core" cx={geometry.pickup.x} cy={geometry.pickup.y} r="5"/></g> : null}{geometry.bus ? <g className="guardian-transport-bus-marker"><circle cx={geometry.bus.x} cy={geometry.bus.y} r="18"/><path d={`M${geometry.bus.x - 8},${geometry.bus.y - 5} h16 v11 h-16 z M${geometry.bus.x - 5},${geometry.bus.y + 8} a3,3 0 1,0 .1,0 M${geometry.bus.x + 5},${geometry.bus.y + 8} a3,3 0 1,0 .1,0`} fill="none" vectorEffect="non-scaling-stroke"/></g> : null}</svg><div className="guardian-transport-map-legend"><span><i className="is-bus"/>Live bus</span><span><i className="is-pickup"/>Your pickup point</span><span><i className="is-route"/>School route</span></div></div>;
}

export function GuardianTransportWorkspaceV2({ initialData }: { initialData: GuardianTransportData }) {
  const [data, setData] = useState(initialData);
  const [selectedId, setSelectedId] = useState(initialData.children[0]?.student.id || "");
  const [direction, setDirection] = useState<PickupDirection>("morning");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [label, setLabel] = useState("");
  const [temporary, setTemporary] = useState(false);
  const [effectiveTo, setEffectiveTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const response = await fetch("/api/guardian/transport", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || body?.error || "Transport data could not be refreshed.");
      setData(body as GuardianTransportData);
    } catch (cause) { if (!quiet) setMessage(cause instanceof Error ? cause.message : "Transport data could not be refreshed."); }
    finally { if (!quiet) setRefreshing(false); }
  }, []);
  useEffect(() => { const dataTimer = window.setInterval(() => void load(true), 15_000); const clockTimer = window.setInterval(() => setNowMs(Date.now()), 5_000); return () => { window.clearInterval(dataTimer); window.clearInterval(clockTimer); }; }, [load]);

  const child = data.children.find((item) => item.student.id === selectedId) || data.children[0] || null;
  useEffect(() => {
    if (!child?.assignment) return;
    if (direction === "morning" && !child.assignment.morningEnabled && child.assignment.afternoonEnabled) setDirection("afternoon");
    if (direction === "afternoon" && !child.assignment.afternoonEnabled && child.assignment.morningEnabled) setDirection("morning");
  }, [child, direction]);

  if (!child) return <div className="guardian-transport-empty"><BusFront size={34}/><h2>No transport-linked learner yet</h2><p>When the school assigns transport to a linked learner, live route and pickup-location tools will appear here.</p></div>;

  const trip = child.activeTrip;
  const pickup = currentPickup(child, trip?.direction || direction, nowMs);
  const selectedPickup = currentPickup(child, direction, nowMs);
  const gps = freshness(trip?.latestLocation?.reportedAt, nowMs);
  const history = (child.pickups as PickupLike[]).filter((point) => point.direction === direction).slice(0, 5);
  const eta = trip?.childProgress?.etaMinutes != null ? `${Math.max(0, Math.round(trip.childProgress.etaMinutes))} min${trip.childProgress.etaConfidenceMinutes != null ? ` ± ${Math.max(1, Math.round(trip.childProgress.etaConfidenceMinutes))}` : ""}` : "Calculating";

  function useCurrentLocation() {
    setMessage("");
    if (!navigator.geolocation) { setMessage("Location is not available in this browser. You can enter the coordinates manually."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      setLatitude(position.coords.latitude.toFixed(7)); setLongitude(position.coords.longitude.toFixed(7)); setLocating(false); setMessage("Current location found. Check it, add an optional landmark, then save it as your pickup location.");
    }, () => { setLocating(false); setMessage("Your location could not be read. Allow location access or enter coordinates manually."); }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 });
  }

  function useSavedPoint() {
    if (!selectedPickup) return;
    setLatitude(selectedPickup.latitude); setLongitude(selectedPickup.longitude); setLabel(selectedPickup.label || ""); setTemporary(selectedPickup.isTemporary); setEffectiveTo(selectedPickup.effectiveTo ? new Date(selectedPickup.effectiveTo).toISOString().slice(0, 16) : ""); setMessage("Current saved point loaded. Change what you need and save again.");
  }

  async function saveLocation() {
    setMessage("");
    const lat = Number(latitude); const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { setMessage("Use Current location or enter valid latitude and longitude values."); return; }
    if (temporary && !effectiveTo) { setMessage("Choose when the temporary pickup location should stop being active."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/guardian/transport", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "setPickup", studentId: child.student.id, direction, latitude: lat, longitude: lng, label: label.trim() || undefined, isTemporary: temporary, effectiveTo: temporary && effectiveTo ? new Date(effectiveTo).toISOString() : undefined }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || body?.error || "Pickup location could not be saved.");
      setMessage("Pickup location saved and active. NovaCore can use it immediately for this learner's transport geofence and ETA."); setLatitude(""); setLongitude(""); setLabel(""); setTemporary(false); setEffectiveTo(""); await load(true);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Pickup location could not be saved."); }
    finally { setSaving(false); }
  }

  return <main className="gtv2-page">
    <section className="guardian-transport-hero gtv2-hero"><div><span>FAMILY TRANSPORT</span><h2>Your child’s route, live bus and pickup point in one place.</h2><p>The school controls the route and vehicle. You control the pickup location for your linked child. Save or change it directly—there is no routine staff approval queue.</p></div><button className="button secondary" onClick={() => void load()} disabled={refreshing}><RefreshCw size={15}/>{refreshing ? "Refreshing…" : "Refresh live data"}</button></section>

    <div className="guardian-transport-child-tabs" role="tablist" aria-label="Linked children">{data.children.map((item) => <button key={item.student.id} type="button" className={item.student.id === child.student.id ? "is-active" : ""} onClick={() => setSelectedId(item.student.id)}><strong>{item.student.name}</strong><span>{item.student.class?.name || "Class not assigned"}</span></button>)}</div>

    <section className="guardian-transport-summary">
      <article><BusFront/><span>Vehicle</span><strong>{trip ? trip.vehicleName || trip.registrationNumber : "No active trip"}</strong><small>{trip ? trip.registrationNumber : child.route?.name || "Waiting for school route"}</small></article>
      <article className={gps.stale ? "is-warning" : "is-good"}><LocateFixed/><span>GPS</span><strong>{gps.label}</strong><small>{trip?.latestLocation ? `${Number(trip.latestLocation.speedKph || 0).toFixed(0)} km/h${trip.latestLocation.routeDeviation ? " · route deviation" : ""}` : "Live location appears when a trip starts"}</small></article>
      <article><Clock3/><span>Estimated arrival</span><strong>{eta}</strong><small>{stateLabel(trip?.childProgress?.state)}</small></article>
      <article className={pickup ? "is-good" : "is-warning"}><MapPin/><span>Pickup point</span><strong>{pickup ? pickup.label || "Saved family location" : "Not set"}</strong><small>{pickup ? `${Number(pickup.latitude).toFixed(5)}, ${Number(pickup.longitude).toFixed(5)}` : "Set a location below"}</small></article>
    </section>

    <section className="guardian-transport-main-grid">
      <div className="guardian-transport-panel"><div className="guardian-transport-panel-head"><div><span>LIVE TRIP</span><h3>{child.route?.name || "Transport route"}</h3><p>{trip ? `${trip.direction === "morning" ? "Morning" : "Afternoon"} trip · ${stateLabel(trip.status)}` : "The live map activates when the school starts a trip."}</p></div>{trip ? <b>{stateLabel(trip.childProgress?.state)}</b> : null}</div><LiveRouteMap shape={(trip?.routeShape || []) as RoutePointLike[]} bus={(trip?.latestLocation || null) as LatestLocationLike | null} pickup={pickup}/>{trip?.latestLocation?.routeDeviation ? <div className="guardian-transport-warning"><TriangleAlert size={18}/><div><strong>Bus is away from the expected route</strong><span>NovaCore marked the latest accepted GPS fix as a route deviation. Continue watching live updates.</span></div></div> : null}</div>

      <div className="guardian-transport-panel gtv2-location-panel"><div className="guardian-transport-panel-head"><div><span>YOUR PICKUP LOCATION</span><h3>Set it yourself</h3><p>Choose Morning or Afternoon, use your phone/computer location or type a point, then save.</p></div><ShieldCheck size={21}/></div>
        <div className="gtv2-direction"><button className={direction === "morning" ? "active" : ""} disabled={Boolean(child.assignment && !child.assignment.morningEnabled)} onClick={() => setDirection("morning")}>Morning</button><button className={direction === "afternoon" ? "active" : ""} disabled={Boolean(child.assignment && !child.assignment.afternoonEnabled)} onClick={() => setDirection("afternoon")}>Afternoon</button></div>
        {selectedPickup ? <div className="guardian-transport-current-pickup"><MapPin size={18}/><div><span>Active now</span><strong>{selectedPickup.label || "Family pickup point"}</strong><small>{Number(selectedPickup.latitude).toFixed(6)}, {Number(selectedPickup.longitude).toFixed(6)}{selectedPickup.isTemporary ? ` · temporary until ${when(selectedPickup.effectiveTo)}` : ""}</small></div><button className="gtv2-change" onClick={useSavedPoint}>Change</button></div> : <div className="gtv2-no-point"><Navigation size={18}/><span>No active {direction} pickup point yet.</span></div>}
        <div className="guardian-transport-form">
          <button className="gtv2-locate" type="button" onClick={useCurrentLocation} disabled={locating}><Crosshair size={16}/>{locating ? "Finding your location…" : "Use my current location"}</button>
          <label><span>Landmark / location name (optional)</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Blue gate opposite the pharmacy"/></label>
          <div className="guardian-transport-coordinate-inputs"><label><span>Latitude</span><input inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="6.6884"/></label><label><span>Longitude</span><input inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="-1.6244"/></label></div>
          <label className="guardian-transport-check"><input type="checkbox" checked={temporary} onChange={(event) => setTemporary(event.target.checked)}/><span>This is a temporary pickup location</span></label>
          {temporary ? <label><span>Use until</span><input type="datetime-local" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)}/></label> : null}
          {message ? <p className="guardian-transport-message">{message}</p> : null}
          <button className="gtv2-save" onClick={() => void saveLocation()} disabled={saving || !child.assignment}><Save size={16}/>{saving ? "Saving…" : selectedPickup ? "Save changed location" : "Save pickup location"}</button>
          {!child.assignment ? <p className="gtv2-route-note">The school must assign this learner to a transport route first. The family chooses the pickup location after that.</p> : null}
        </div>
      </div>
    </section>

    <section className="gtv2-bottom">
      <div className="guardian-transport-panel"><div className="guardian-transport-panel-head"><div><span>LOCATION HISTORY</span><h3>Recent {direction} points</h3><p>Your newest saved point replaces the previous active point; the history remains auditable.</p></div></div><div className="gtv2-history">{history.length ? history.map((point) => <article key={point.id}><MapPin size={16}/><div><strong>{point.label || "Pickup location"}</strong><span>{Number(point.latitude).toFixed(5)}, {Number(point.longitude).toFixed(5)}</span></div><aside><b className={point.status === "approved" ? "active" : ""}>{point.status === "approved" ? "Active" : point.status}</b><small>{when(point.approvedAt || point.requestedAt)}</small></aside></article>) : <div className="guardian-transport-map-empty"><MapPin size={24}/><strong>No saved points yet.</strong></div>}</div></div>
      <div className="guardian-transport-panel"><div className="guardian-transport-panel-head"><div><span>TRIP ALERTS</span><h3>Recent transport updates</h3></div></div><div className="guardian-transport-alerts">{child.alerts.length ? child.alerts.slice(0, 8).map((alert) => <article key={alert.id}><span className="guardian-transport-alert-icon"><CheckCircle2 size={15}/></span><div><strong>{stateLabel(alert.type)}</strong><span>{when(alert.sentAt || alert.queuedAt)}</span></div><b>{stateLabel(alert.status)}</b></article>) : <div className="guardian-transport-map-empty"><BusFront size={24}/><strong>No trip alerts yet.</strong><span>Approaching and arrival events will appear as live trips progress.</span></div>}</div></div>
    </section>
  </main>;
}
