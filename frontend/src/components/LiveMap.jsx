import { useEffect, useRef } from 'react';
import { ROUTE_PATH } from '../data/mockData';

const STATUS_COLORS = {
  available: '#34d399',
  occupied:  '#fb7185',
  reserved:  '#fbbf24',
  offline:   '#64748b',
};

export default function LiveMap({ stations, selectedStation, onSelectStation, routeActive, mapId = 'main' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const routeLineRef = useRef(null);

  // Init map — keyed by mapId so multiple instances work
  useEffect(() => {
    if (!window.L || !containerRef.current) return;

    // If this container already has a map, remove it first
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = window.L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([27.4, 79.2], 7);

    window.L.control.zoom({ position: 'bottomright' }).addTo(map);
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
    }).addTo(map);

    markersRef.current = window.L.layerGroup().addTo(map);
    mapRef.current = map;

    // Force initial resize calculations
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 100);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      routeLineRef.current = null;
    };
  }, [mapId]);

  // ResizeObserver to handle tab changes, sidebars, transitions, and window sizing
  useEffect(() => {
    if (!mapRef.current || !containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Update markers whenever stations or selection changes
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;
    const L = window.L;
    markersRef.current.clearLayers();

    stations.forEach(st => {
      const color = STATUS_COLORS[st.status] || '#64748b';
      const isSelected = selectedStation?.id === st.id;
      const size = isSelected ? 22 : 14;

      const icon = L.divIcon({
        className: '',
        iconSize: [size + 14, size + 14],
        iconAnchor: [(size + 14) / 2, (size + 14) / 2],
        html: `<div style="
          width:${size}px; height:${size}px;
          background:${color};
          border: 2px solid ${isSelected ? '#fff' : 'rgba(0,0,0,.3)'};
          border-radius:50%;
          box-shadow: 0 0 ${isSelected ? 24 : 12}px ${color}88;
          transition: all .2s ease;
          cursor:pointer;
        "></div>`
      });

      const marker = L.marker([st.lat, st.lng], { icon });
      marker.on('click', () => onSelectStation(st));

      marker.bindTooltip(
        `<div style="font-size:11px;font-weight:600;color:#e2e8f0">${st.name}</div>
         <div style="font-size:10px;color:#94a3b8">${st.power} kW • ₹${st.price}/kWh • ${st.status.toUpperCase()}</div>`,
        {
          direction: 'top',
          offset: [0, -size/2 - 4],
          className: 'custom-tooltip',
          permanent: false,
        }
      );

      markersRef.current.addLayer(marker);
    });
  }, [stations, selectedStation, onSelectStation]);

  // Route polyline drawing and fitting bounds
  useEffect(() => {
    if (!mapRef.current) return;
    const L = window.L;

    if (routeLineRef.current) {
      mapRef.current.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    if (routeActive) {
      mapRef.current.invalidateSize();

      routeLineRef.current = L.polyline(ROUTE_PATH, {
        color: '#38bdf8',
        weight: 3.5,
        opacity: .75,
        dashArray: '10,8',
        lineCap: 'round',
      }).addTo(mapRef.current);

      // Delayed fitting bounds to guarantee full rendering has settled
      setTimeout(() => {
        if (mapRef.current && routeLineRef.current) {
          mapRef.current.invalidateSize();
          mapRef.current.fitBounds(routeLineRef.current.getBounds(), { padding: [50, 50] });
        }
      }, 150);
    }
  }, [routeActive]);

  return <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden min-h-[400px]" style={{ minHeight: '100%' }} />;
}
