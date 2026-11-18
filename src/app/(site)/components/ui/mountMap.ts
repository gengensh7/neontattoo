import "leaflet/dist/leaflet.css";

import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import shadow from "leaflet/dist/images/marker-shadow.png";

import { STUDIO_MAP_URL } from "@/lib/config";

export function mountMap(element: HTMLDivElement, onLoad: (hasTiles: boolean) => void) {
  const studioCoords: L.LatLngTuple = [47.0200287, 28.8473541];
  const map = L.map(element).setView(studioCoords, 17);

  let hasTiles = false;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  })
    .once("tileload", () => {
      hasTiles = true;
    })
    .once("load", () => onLoad(hasTiles))
    .addTo(map);

  L.marker(studioCoords, {
    icon: L.icon({
      ...L.Icon.Default.prototype.options,
      iconUrl: icon.src,
      iconRetinaUrl: iconRetina.src,
      shadowUrl: shadow.src,
    }),
  })
    .addTo(map)
    .bindPopup(
      `<a href="${STUDIO_MAP_URL}" target="_blank" rel="noopener noreferrer"
          style="text-align: center; display: block; text-decoration: none; color: inherit;">
        <strong>Neon Tattoo</strong><br/>
        <small>str. Tighina 65</small><br/>
        <small>Chișinău, MD-2001</small><br/>
        <small style="color:#0077ff;">Open in Google Maps</small>
      </a>`
    )
    .openPopup();

  return () => map.remove();
}
