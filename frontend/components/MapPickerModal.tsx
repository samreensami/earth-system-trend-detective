"use client";

import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default marker icons in Next.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function MapClickHandler({ onLocation }: { onLocation: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onLocation(e.latlng.lat, e.latlng.lng) });
  return null;
}

interface Props {
  initialLat: number;
  initialLon: number;
  onConfirm: (lat: number, lon: number) => void;
  onClose: () => void;
}

export default function MapPickerModal({ initialLat, initialLon, onConfirm, onClose }: Props) {
  const [pos, setPos] = useState<[number, number]>([initialLat, initialLon]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-3xl rounded-2xl overflow-hidden border border-slate-700/60 bg-[#0f172a] flex flex-col shadow-2xl"
        style={{ height: "72vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/50 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Pick Location on Map</h3>
            <p className="text-xs text-slate-500 mt-0.5">Click anywhere on Earth to set coordinates</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm text-sky-300">
              {pos[0].toFixed(4)}°N, {pos[1].toFixed(4)}°E
            </span>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative min-h-0">
          <MapContainer
            center={pos}
            zoom={3}
            style={{ height: "100%", width: "100%", background: "#0f172a" }}
            zoomControl
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <Marker position={pos} />
            <MapClickHandler onLocation={(lat, lon) => setPos([lat, lon])} />
          </MapContainer>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-700/50 shrink-0 bg-[#0f172a]">
          <p className="text-xs text-slate-500">NASA POWER data available globally · ocean coordinates supported</p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 border border-slate-600/40 hover:border-slate-500/60 hover:text-slate-200 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => { onConfirm(pos[0], pos[1]); onClose(); }}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors"
            >
              Use This Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
