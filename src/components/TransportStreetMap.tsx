"use client";

import { useMemo } from "react";
import { BusFront, MapPin } from "lucide-react";
import "./transport-street-map.css";

export type TransportMapPoint = {
  latitude: string | number;
  longitude: string | number;
  label?: string | null;
};

export type TransportBusPoint = TransportMapPoint & {
  heading?: string | number | null;
  speedKph?: string | number | null;
};

function numberValue(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function worldPoint(latitude: number, longitude: number, zoom: number) {
  const n = 2 ** zoom;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

function validPoint(point: TransportMapPoint | null | undefined) {
  if (!point) return null;
  const latitude = numberValue(point.latitude);
  const longitude = numberValue(point.longitude);
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { ...point, latitude, longitude };
}

const TILE_TEMPLATE = process.env.NEXT_PUBLIC_TRANSPORT_MAP_TILE_TEMPLATE?.trim() || "";
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_TRANSPORT_MAP_ATTRIBUTION?.trim() || "Map provider";
const TILE_ATTRIBUTION_URL = process.env.NEXT_PUBLIC_TRANSPORT_MAP_ATTRIBUTION_URL?.trim() || "";

function tileUrl(template: string, zoom: number, x: number, y: number) {
  return template.replaceAll("{z}", String(zoom)).replaceAll("{x}", String(x)).replaceAll("{y}", String(y));
}

export function TransportStreetMap({
  bus,
  pickup,
  stops = [],
  zoom = 15,
  emptyMessage = "Live map will appear when SukuuNova receives a valid GPS position.",
}: {
  bus?: TransportBusPoint | null;
  pickup?: TransportMapPoint | null;
  stops?: TransportMapPoint[];
  zoom?: number;
  emptyMessage?: string;
}) {
  const geometry = useMemo(() => {
    const validBus = validPoint(bus);
    const validPickup = validPoint(pickup);
    const validStops = stops.map(validPoint).filter((point): point is NonNullable<ReturnType<typeof validPoint>> => Boolean(point));
    const anchor = validBus ?? validPickup ?? validStops[0] ?? null;
    if (!anchor) return null;

    const center = worldPoint(anchor.latitude, anchor.longitude, zoom);
    const n = 2 ** zoom;
    const tiles = [] as Array<{ key: string; y: number; srcX: number; left: number; top: number }>;
    if (TILE_TEMPLATE) {
      const baseX = Math.floor(center.x);
      const baseY = Math.floor(center.y);
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const x = baseX + dx;
          const y = baseY + dy;
          if (y < 0 || y >= n) continue;
          const srcX = ((x % n) + n) % n;
          tiles.push({ key: `${zoom}-${x}-${y}`, y, srcX, left: Math.round((x - center.x) * 256), top: Math.round((y - center.y) * 256) });
        }
      }
    }

    const project = (point: NonNullable<ReturnType<typeof validPoint>>) => {
      const world = worldPoint(point.latitude, point.longitude, zoom);
      return { ...point, left: Math.round((world.x - center.x) * 256), top: Math.round((world.y - center.y) * 256) };
    };

    return { tiles, bus: validBus ? project(validBus) : null, pickup: validPickup ? project(validPickup) : null, stops: validStops.map(project) };
  }, [bus, pickup, stops, zoom]);

  if (!geometry) {
    return <div className="transport-street-map transport-street-map-empty"><MapPin size={28}/><strong>No live GPS position yet</strong><span>{emptyMessage}</span></div>;
  }

  return <div className="transport-street-map" role="img" aria-label="Live school transport map">
    <div className="transport-map-private-grid" aria-hidden="true"/>
    {TILE_TEMPLATE ? <div className="transport-map-tiles" aria-hidden="true">
      {geometry.tiles.map((tile) => <img key={tile.key} className="transport-map-tile" src={tileUrl(TILE_TEMPLATE, zoom, tile.srcX, tile.y)} alt="" draggable={false} loading="lazy" style={{ left: `calc(50% + ${tile.left}px)`, top: `calc(50% + ${tile.top}px)` }}/>) }
    </div> : null}
    {geometry.stops.map((stop, index) => <span key={`${stop.latitude}-${stop.longitude}-${index}`} className="transport-map-stop" title={stop.label || `Route stop ${index + 1}`} style={{ left: `calc(50% + ${stop.left}px)`, top: `calc(50% + ${stop.top}px)` }}><i/></span>)}
    {geometry.pickup ? <span className="transport-map-pickup" title={geometry.pickup.label || "Family pickup point"} style={{ left: `calc(50% + ${geometry.pickup.left}px)`, top: `calc(50% + ${geometry.pickup.top}px)` }}><MapPin size={19}/></span> : null}
    {geometry.bus ? <span className="transport-map-bus" title={geometry.bus.label || "Live bus"} style={{ left: `calc(50% + ${geometry.bus.left}px)`, top: `calc(50% + ${geometry.bus.top}px)` }}><BusFront size={20}/></span> : null}
    <div className="transport-map-live-chip"><span/>{TILE_TEMPLATE ? "Live map" : "Private live view"}</div>
    {!TILE_TEMPLATE ? <div className="transport-map-privacy-note">Street tiles are disabled until an approved map provider is configured.</div> : TILE_ATTRIBUTION_URL ? <a className="transport-map-attribution" href={TILE_ATTRIBUTION_URL} target="_blank" rel="noreferrer">{TILE_ATTRIBUTION}</a> : <span className="transport-map-attribution">{TILE_ATTRIBUTION}</span>}
  </div>;
}
