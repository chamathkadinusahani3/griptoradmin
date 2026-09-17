import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Vite serves leaflet's marker images as hashed asset URLs rather than the
// relative paths leaflet's default Icon expects, so its built-in icon
// resolution silently breaks unless overridden like this — a well-known
// leaflet+bundler issue, not specific to this app.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export interface LocationMapMarker {
  lat: number;
  lng: number;
  label: string;
}

export function LocationMap({ markers, height = '240px' }: { markers: LocationMapMarker[]; height?: string }) {
  if (markers.length === 0) return null;

  const bounds = markers.length > 1 ? L.latLngBounds(markers.map((m) => [m.lat, m.lng])) : undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-border-soft dark:border-slate-700" style={{ height }}>
      <MapContainer
        {...(bounds ? { bounds, boundsOptions: { padding: [30, 30] } } : { center: [markers[0].lat, markers[0].lng], zoom: 15 })}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}>

        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {markers.map((m, i) =>
        <Marker key={i} position={[m.lat, m.lng]}>
            <Popup>{m.label}</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>);

}
