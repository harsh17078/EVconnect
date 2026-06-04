import { useState, useEffect, useRef, useCallback } from 'react';
import { Route, Zap, Navigation, Battery, Search, MapPin, Clock, Map, Loader, AlertTriangle } from 'lucide-react';

// ── Nominatim Geocoding (free, no API key) ──
const FALLBACK_CITIES = [
  { display_name: "Delhi, India", lat: 28.6139, lon: 77.2090 },
  { display_name: "Mumbai, Maharashtra, India", lat: 19.0760, lon: 72.8777 },
  { display_name: "Bengaluru, Karnataka, India", lat: 12.9716, lon: 77.5946 },
  { display_name: "Patna, Bihar, India", lat: 25.5941, lon: 85.1376 },
  { display_name: "Lucknow, Uttar Pradesh, India", lat: 26.8467, lon: 80.9462 },
  { display_name: "Raipur, Chhattisgarh, India", lat: 21.2514, lon: 81.6296 },
  { display_name: "Agra, Uttar Pradesh, India", lat: 27.1767, lon: 78.0081 },
  { display_name: "Kanpur, Uttar Pradesh, India", lat: 26.4499, lon: 80.3319 },
  { display_name: "Pune, Maharashtra, India", lat: 18.5204, lon: 73.8567 },
  { display_name: "Hyderabad, Telangana, India", lat: 17.3850, lon: 78.4867 },
  { display_name: "Ahmedabad, Gujarat, India", lat: 23.0225, lon: 72.5714 },
  { display_name: "Chennai, Tamil Nadu, India", lat: 13.0827, lon: 80.2707 },
  { display_name: "Kolkata, West Bengal, India", lat: 22.5726, lon: 88.3639 },
  { display_name: "Surat, Gujarat, India", lat: 21.1702, lon: 72.8311 },
  { display_name: "Jaipur, Rajasthan, India", lat: 26.9124, lon: 75.7873 },
];

const getFallbackPlaces = (query) => {
  const q = query.toLowerCase();
  return FALLBACK_CITIES.filter(c => c.display_name.toLowerCase().includes(q)).map(item => ({
    displayName: item.display_name,
    shortName: formatShortName(item),
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
  }));
};

const searchPlaces = async (query) => {
  if (!query || query.trim().length < 2) return [];
  try {
    // 1. Search specifically in India using a bounding box (bbox) to keep search terms highly relevant
    // bbox=minLon,minLat,maxLon,maxLat for India roughly: 68.0,6.0,98.0,36.0
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&bbox=68.0,6.0,98.0,36.0&limit=8`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('API Error');
    const data = await res.json();
    
    const indiaFeatures = (data.features || []).filter(f => f.properties.country === 'India');
    
    if (indiaFeatures.length > 0) {
      return indiaFeatures.slice(0, 6).map(f => {
        const p = f.properties;
        const nameParts = [p.name, p.city || p.county, p.state, p.country].filter(Boolean);
        const uniqueParts = [...new Set(nameParts)];
        
        return {
          displayName: uniqueParts.join(', '),
          shortName: p.name || uniqueParts[0],
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          type: p.osm_value || 'place',
        };
      });
    }

    // If nothing matches in the bounding box, assume it's outside coverage or a typo
    return [{ isError: true, message: `Outside coverage. App is for India only.` }];
    
  } catch (err) {
    console.warn('Geocoding error', err);
    return getFallbackPlaces(query);
  }
};

const formatShortName = (item) => {
  const parts = item.display_name.split(',').map(s => s.trim());
  if (parts.length >= 3) return `${parts[0]}, ${parts[1]}, ${parts[2]}`;
  if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
  return parts[0];
};

// ── OSRM Routing (free, no API key) ──
const fetchOSRMRoute = async (fromCoords, toCoords) => {
  if (!fromCoords || !toCoords) return null;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    // OSRM GeoJSON coordinates are [lng, lat] — Leaflet needs [lat, lng]
    const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

    return {
      routeCoords: coords,
      distanceKm: Math.round(route.distance / 1000),
      durationMins: Math.round(route.duration / 60),
    };
  } catch (err) {
    console.warn('OSRM routing error:', err);
    return null;
  }
};

// ── Haversine distance in km between two [lat, lng] points ──
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── Find stations near the actual route polyline ──
const findStationsAlongRoute = (routeCoords, stations, maxDetourKm = 35) => {
  if (!routeCoords || routeCoords.length < 2 || !stations.length) return [];

  // Precompute cumulative km along the route polyline
  const cumKm = [0];
  for (let i = 1; i < routeCoords.length; i++) {
    cumKm.push(cumKm[i - 1] + haversineKm(
      routeCoords[i - 1][0], routeCoords[i - 1][1],
      routeCoords[i][0], routeCoords[i][1]
    ));
  }

  // Sample route points every ~3-5 km for efficiency
  const totalRouteKm = cumKm[cumKm.length - 1];
  const sampleStep = Math.max(1, Math.floor(routeCoords.length / Math.max(1, totalRouteKm / 4)));
  const sampled = [];
  for (let i = 0; i < routeCoords.length; i += sampleStep) {
    sampled.push({ coord: routeCoords[i], km: cumKm[i] });
  }
  // Always include last point
  if (sampled[sampled.length - 1].km !== cumKm[cumKm.length - 1]) {
    sampled.push({ coord: routeCoords[routeCoords.length - 1], km: cumKm[cumKm.length - 1] });
  }

  return stations
    .filter(s => s.lat && s.lng)
    .map(s => {
      let minDist = Infinity;
      let nearestKm = 0;

      for (const pt of sampled) {
        const dist = haversineKm(s.lat, s.lng, pt.coord[0], pt.coord[1]);
        if (dist < minDist) {
          minDist = dist;
          nearestKm = pt.km;
        }
      }

      if (minDist > maxDetourKm) return null;

      return {
        ...s,
        km: Math.round(nearestKm),
        distFromRoute: Math.round(minDist * 10) / 10,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km);
};

// ── Generate simulated stations for routes outside the mock data corridor ──
const generateFakeStationsAlongRoute = (routeCoords, distanceKm) => {
  const fakeStations = [];
  if (!routeCoords || routeCoords.length < 2 || distanceKm < 40) return fakeStations;
  
  let accumulatedKm = 0;
  let totalKmAccumulated = 0;
  for (let i = 1; i < routeCoords.length; i++) {
    const d = haversineKm(routeCoords[i-1][0], routeCoords[i-1][1], routeCoords[i][0], routeCoords[i][1]);
    accumulatedKm += d;
    totalKmAccumulated += d;
    
    // Drop a fake station every ~45km
    if (accumulatedKm > 45) {
      const operators = ['tata', 'statiq', 'chargezone', 'jiobp'];
      const op = operators[Math.floor(Math.random() * operators.length)];
      
      const prefixes = ['Highway', 'Express', 'Green', 'Eco', 'Power', 'Volt'];
      const suffixes = ['Plaza', 'Point', 'Hub', 'Stop', 'Station', 'Oasis'];
      const randomName = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${suffixes[Math.floor(Math.random() * suffixes.length)]} EV Hub (km ${Math.round(totalKmAccumulated)})`;

      fakeStations.push({
        id: `SIM-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`,
        name: randomName,
        operator: op,
        lat: routeCoords[i][0],
        lng: routeCoords[i][1],
        status: Math.random() > 0.8 ? 'occupied' : 'available',
        connector: 'CCS2',
        power: [60, 120, 150][Math.floor(Math.random() * 3)],
        price: 18 + Math.floor(Math.random() * 5),
        queue: 0,
        waitMin: 0,
        uptime: 99.0,
        forecast: Array.from({length: 10}, () => Math.floor(Math.random() * 40)),
        latency: Math.floor(Math.random() * 50) + 10,
        temp: 35 + Math.floor(Math.random() * 8),
        voltage: 400 + Math.floor(Math.random() * 15),
        current: Math.floor(Math.random() * 200) + 50,
        faultRisk: Math.floor(Math.random() * 15),
      });
      accumulatedKm = 0;
    }
  }
  return fakeStations;
};

// ── EV Charging Stop Planner using route-aware station positions ──
const planEVStops = (routeCoords, totalDistanceKm, startSoc, stationsList, selectedVehicle) => {
  if (!routeCoords || routeCoords.length < 2 || totalDistanceKm === 0) return [];

  const maxRange = selectedVehicle ? selectedVehicle.range : 437; 
  const batteryCapacity = selectedVehicle ? selectedVehicle.battery : 40.5;

  // Find stations actually along this route polyline
  const stationsAlongRoute = findStationsAlongRoute(routeCoords, stationsList);

  const suggestedStops = [];
  let currentKm = 0;
  let currentSoc = startSoc;

  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    const remainingRange = maxRange * (currentSoc / 100);
    const distanceToDest = totalDistanceKm - currentKm;

    // Can we reach destination with current charge?
    if (remainingRange >= distanceToDest) {
      break;
    }

    // Find the farthest reachable station (greedy — maximize distance per stop)
    let bestStation = null;
    for (const station of stationsAlongRoute) {
      if (suggestedStops.some(s => s.id === station.id)) continue;
      if (station.km <= currentKm) continue;
      const distFromCurrent = station.km - currentKm;
      // Reachable with a 5% safety buffer
      if (distFromCurrent <= remainingRange - (maxRange * 0.05)) {
        bestStation = station;
      }
    }

    // Fallback: any reachable station
    if (!bestStation) {
      for (const station of stationsAlongRoute) {
        if (suggestedStops.some(s => s.id === station.id)) continue;
        if (station.km <= currentKm) continue;
        const distFromCurrent = station.km - currentKm;
        if (distFromCurrent <= remainingRange) {
          bestStation = station;
          break;
        }
      }
    }

    if (!bestStation) break;

    const distToStation = bestStation.km - currentKm;
    const socAtStation = Math.round(currentSoc - (distToStation / maxRange * 100));
    const targetSoc = 80;
    const socNeeded = Math.max(0, targetSoc - socAtStation);
    const kwhNeeded = (socNeeded / 100) * batteryCapacity;
    const chargeHours = kwhNeeded / bestStation.power;
    const chargeMins = Math.max(10, Math.round(chargeHours * 60));

    suggestedStops.push({
      ...bestStation,
      distKm: distToStation,
      arrivalSoc: Math.max(5, socAtStation),
      chargeMins,
      reason: socAtStation < 20 ? 'Battery critical — recharge required' : 'Midway top-up for optimal range'
    });

    currentKm = bestStation.km;
    currentSoc = targetSoc;
  }

  return suggestedStops;
};


// ── Component ──
// fromQuery, toQuery, fromCoords, toCoords are LIFTED to App.jsx so they persist across tab switches.
export default function RoutePlanner({
  stations, onPlanRoute, onClearRoute, onRouteUpdate, routeActive, onStartCharge, userSoc, onSocChange,
  fromQuery, toQuery, fromCoords, toCoords,
  onFromQueryChange, onToQueryChange, onFromCoordsChange, onToCoordsChange,
  onStopsComputed, selectedVehicle,
}) {
  const stationsRef = useRef(stations);
  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);

  const [soc, setSoc] = useState(userSoc);

  // Sync state if userSoc changes globally
  useEffect(() => {
    setSoc(userSoc);
  }, [userSoc]);

  const [stops, setStops] = useState([]);
  const [routePath, setRoutePath] = useState([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // Local-only UI transient state (OK to lose on tab switch)
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [showFromList, setShowFromList] = useState(false);
  const [showToList, setShowToList] = useState(false);
  const [isSearchingFrom, setIsSearchingFrom] = useState(false);
  const [isSearchingTo, setIsSearchingTo] = useState(false);

  const [routeStats, setRouteStats] = useState({
    distance: 0,
    stopsCount: 0,
    timeMins: 0,
  });

  // ── Debounced Nominatim search for "From" input ──
  useEffect(() => {
    if (!fromQuery || fromQuery.length < 2) {
      setFromSuggestions([]);
      return;
    }
    if (fromCoords && fromQuery === fromCoords._selectedLabel) return;

    setIsSearchingFrom(true);
    const timer = setTimeout(async () => {
      const results = await searchPlaces(fromQuery);
      setFromSuggestions(results);
      setIsSearchingFrom(false);
    }, 800);

    return () => { clearTimeout(timer); setIsSearchingFrom(false); };
  }, [fromQuery, fromCoords]);

  // ── Debounced Nominatim search for "To" input ──
  useEffect(() => {
    if (!toQuery || toQuery.length < 2) {
      setToSuggestions([]);
      return;
    }
    if (toCoords && toQuery === toCoords._selectedLabel) return;

    setIsSearchingTo(true);
    const timer = setTimeout(async () => {
      const results = await searchPlaces(toQuery);
      setToSuggestions(results);
      setIsSearchingTo(false);
    }, 800);

    return () => { clearTimeout(timer); setIsSearchingTo(false); };
  }, [toQuery, toCoords]);

  // ── Fetch OSRM route when both coords are set ──
  useEffect(() => {
    if (!fromCoords || !toCoords) {
      setRoutePath([]);
      setStops([]);
      setRouteStats({ distance: 0, stopsCount: 0, timeMins: 0 });
      // Clear stale route from map immediately
      if (onRouteUpdate) onRouteUpdate([]);
      if (onStopsComputed) onStopsComputed([]);
      return;
    }

    let cancelled = false;
    const fetchRoute = async () => {
      setIsLoadingRoute(true);

      let routeData = await fetchOSRMRoute(fromCoords, toCoords);

      if (cancelled) return;

      if (routeData) {
        const { routeCoords, distanceKm, durationMins } = routeData;
        setRoutePath(routeCoords);

        // Inject simulated stations so the route planner works anywhere in India
        const simulatedStations = generateFakeStationsAlongRoute(routeCoords, distanceKm);
        const combinedStations = [...stationsRef.current, ...simulatedStations];

        // Find all stations along the route for the Map
        const allStationsAlongRoute = findStationsAlongRoute(routeCoords, combinedStations);

        // Plan EV charging stops using the combined stations
        const plannedStops = planEVStops(routeCoords, distanceKm, soc, combinedStations, selectedVehicle);
        
        setStops(plannedStops);

        const chargingTimeMins = plannedStops.reduce((sum, s) => sum + s.chargeMins, 0);
        setRouteStats({
          distance: distanceKm,
          stopsCount: plannedStops.length,
          timeMins: durationMins + chargingTimeMins,
        });

        if (onRouteUpdate) {
          onRouteUpdate(routeCoords);
        }
        if (onStopsComputed) {
          // Pass ALL stations along the route to the Map so the user can see options
          onStopsComputed(allStationsAlongRoute);
        }
      } else {
        // Ultimate fallback: straight line
        const straightLine = [
          [fromCoords.lat, fromCoords.lng],
          [toCoords.lat, toCoords.lng],
        ];
        setRoutePath(straightLine);

        const distKm = Math.round(
          Math.sqrt(
            Math.pow((toCoords.lat - fromCoords.lat) * 111, 2) +
            Math.pow((toCoords.lng - fromCoords.lng) * 111 * Math.cos(fromCoords.lat * Math.PI / 180), 2)
          )
        );
        setStops([]);
        setRouteStats({
          distance: distKm,
          stopsCount: 0,
          timeMins: Math.round((distKm / 80) * 60),
        });

        if (onRouteUpdate) {
          onRouteUpdate(straightLine);
        }
        if (onStopsComputed) {
          onStopsComputed([]);
        }
      }

      setIsLoadingRoute(false);
    };

    const timer = setTimeout(fetchRoute, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [fromCoords, toCoords, soc, onRouteUpdate]);

  // Auto-close list helpers
  const handleFromBlur = () => {
    setTimeout(() => setShowFromList(false), 250);
  };
  const handleToBlur = () => {
    setTimeout(() => setShowToList(false), 250);
  };

  const handleFromSelect = useCallback((place) => {
    onFromQueryChange(place.shortName);
    onFromCoordsChange({ lat: place.lat, lng: place.lng, _selectedLabel: place.shortName });
    setShowFromList(false);
    setFromSuggestions([]);
  }, [onFromQueryChange, onFromCoordsChange]);

  const handleToSelect = useCallback((place) => {
    onToQueryChange(place.shortName);
    onToCoordsChange({ lat: place.lat, lng: place.lng, _selectedLabel: place.shortName });
    setShowToList(false);
    setToSuggestions([]);
  }, [onToQueryChange, onToCoordsChange]);

  const handleFromChange = (e) => {
    onFromQueryChange(e.target.value);
    onFromCoordsChange(null);
    setShowFromList(true);
  };

  const handleToChange = (e) => {
    onToQueryChange(e.target.value);
    onToCoordsChange(null);
    setShowToList(true);
  };

  const handlePlanClick = () => {
    onPlanRoute(routePath);
  };

  // Compute estimated arrival SOC
  const arrivalSoc = (() => {
    if (!routeStats.distance || !soc) return null;
    let currentSocCalc = soc;
    const maxRange = selectedVehicle ? selectedVehicle.range : 437;
    // Subtract driving SOC usage
    let lastKm = 0;
    for (const stop of stops) {
      const segDist = stop.km - lastKm;
      currentSocCalc -= (segDist / maxRange) * 100;
      currentSocCalc = 80; // charged to 80% at each stop
      lastKm = stop.km;
    }
    // Final leg
    const finalLeg = routeStats.distance - lastKm;
    currentSocCalc -= (finalLeg / maxRange) * 100;
    return Math.max(0, Math.round(currentSocCalc));
  })();

  return (
    <div className="glass-highlight rounded-2xl p-5 animate-fade-in relative">
      <div className="flex items-center gap-2 mb-4">
        <Route className="w-5 h-5 text-sky-400" />
        <h3 className="font-bold text-sm text-white">Smart Route Planner</h3>
      </div>

      <div className="flex justify-between items-center bg-white/[.02] border border-white/[.04] p-3 md:p-4 rounded-2xl mb-4 md:mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center border border-sky-500/20 shrink-0">
              <Battery className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Your Vehicle</div>
              <div className="font-semibold text-white text-sm mt-0.5 flex items-center gap-2">
                <span>{selectedVehicle ? selectedVehicle.name : 'EV Model'}</span>
                <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-slate-300">{selectedVehicle ? selectedVehicle.connector : 'CCS2'}</span>
              </div>
            </div>
          </div>
      </div>

      {/* Dynamic From/To Inputs with Nominatim Autocomplete */}
      <div className="space-y-4 mb-5 relative">
        {/* From City input */}
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-sky-400 shrink-0 shadow-[0_0_8px_#38bdf8]" />
            <div className="flex-1 relative">
              <input
                type="text"
                value={fromQuery}
                onFocus={() => { setShowFromList(true); setShowToList(false); }}
                onBlur={handleFromBlur}
                onChange={handleFromChange}
                placeholder="Start — search any place in India"
                className="w-full bg-white/[.04] border border-white/[.07] focus:border-sky-500/35 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
              />
              {isSearchingFrom ? (
                <Loader className="w-3.5 h-3.5 text-sky-400 absolute right-3 top-2.5 pointer-events-none animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
              )}
              {fromSuggestions.length > 0 && fromSuggestions[0].isError && (
                <div className="mt-2 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-md flex items-center gap-1.5 text-[10px] text-amber-500 font-medium w-full">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <div className="truncate">{fromSuggestions[0].message}</div>
                </div>
              )}
            </div>
          </div>

          {/* Autocomplete Dropdown */}
          {showFromList && fromSuggestions.length > 0 && !fromSuggestions[0].isError && (
            <div className="absolute left-6 right-0 mt-1 z-[1200] suggestion-dropdown rounded-lg shadow-xl max-h-52 overflow-y-auto">
              {fromSuggestions.map((place, idx) => (
                  <button
                    key={`${place.lat}-${place.lng}-${idx}`}
                    onClick={() => handleFromSelect(place)}
                    className="w-full text-left px-3.5 py-2.5 text-[11px] text-slate-300 hover:text-white hover:bg-white/[.06] transition-colors flex items-start gap-2 cursor-pointer border-b border-white/[.03] last:border-0"
                  >
                    <MapPin className="w-3 h-3 text-sky-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{place.shortName}</div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{place.displayName}</div>
                    </div>
                  </button>
              ))}
            </div>
          )}
          {showFromList && fromQuery.length >= 2 && fromSuggestions.length === 0 && !isSearchingFrom && (
            <div className="absolute left-6 right-0 mt-1 z-[1200] suggestion-dropdown rounded-lg shadow-xl px-3.5 py-3 text-[11px] text-slate-500">
              No places found. Try a different search term.
            </div>
          )}
        </div>

        {/* Sleek Gradient Connector */}
        <div className="ml-[5px] w-0.5 h-5 bg-gradient-to-b from-sky-400/40 via-slate-500/20 to-emerald-400/40 rounded-full my-1" />

        {/* To City input */}
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_#34d399]" />
            <div className="flex-1 relative">
              <input
                type="text"
                value={toQuery}
                onFocus={() => { setShowToList(true); setShowFromList(false); }}
                onBlur={handleToBlur}
                onChange={handleToChange}
                placeholder="Destination — search any place in India"
                className="w-full bg-white/[.04] border border-white/[.07] focus:border-sky-500/35 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
              />
              {isSearchingTo ? (
                <Loader className="w-3.5 h-3.5 text-emerald-400 absolute right-3 top-2.5 pointer-events-none animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
              )}
              {toSuggestions.length > 0 && toSuggestions[0].isError && (
                <div className="mt-2 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-md flex items-center gap-1.5 text-[10px] text-amber-500 font-medium w-full">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <div className="truncate">{toSuggestions[0].message}</div>
                </div>
              )}
            </div>
          </div>

          {/* Autocomplete Dropdown */}
          {showToList && toSuggestions.length > 0 && !toSuggestions[0].isError && (
            <div className="absolute left-6 right-0 mt-1 z-[1200] suggestion-dropdown rounded-lg shadow-xl max-h-52 overflow-y-auto">
              {toSuggestions.map((place, idx) => (
                  <button
                    key={`${place.lat}-${place.lng}-${idx}`}
                    onClick={() => handleToSelect(place)}
                    className="w-full text-left px-3.5 py-2.5 text-[11px] text-slate-300 hover:text-white hover:bg-white/[.06] transition-colors flex items-start gap-2 cursor-pointer border-b border-white/[.03] last:border-0"
                  >
                    <MapPin className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{place.shortName}</div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{place.displayName}</div>
                    </div>
                  </button>
              ))}
            </div>
          )}
          {showToList && toQuery.length >= 2 && toSuggestions.length === 0 && !isSearchingTo && (
            <div className="absolute left-6 right-0 mt-1 z-[1200] suggestion-dropdown rounded-lg shadow-xl px-3.5 py-3 text-[11px] text-slate-500">
              No places found. Try a different search term.
            </div>
          )}
        </div>
      </div>

      {/* Coords confirmation badges */}
      {(fromCoords || toCoords) && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {fromCoords && (
            <span className="text-[9px] bg-sky-500/10 border border-sky-500/20 text-sky-400 px-2 py-1 rounded-full font-medium flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5" /> {fromCoords.lat.toFixed(2)}°, {fromCoords.lng.toFixed(2)}°
            </span>
          )}
          {toCoords && (
            <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-medium flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5" /> {toCoords.lat.toFixed(2)}°, {toCoords.lng.toFixed(2)}°
            </span>
          )}
        </div>
      )}

      {/* SOC slider */}
      <div className="mb-5">
        <div className="flex justify-between items-center text-xs mb-2">
          <span className="text-slate-400 flex items-center gap-1"><Battery className="w-3.5 h-3.5" /> Current Battery</span>
          <span className="text-sky-400 font-bold font-display">{soc}%</span>
        </div>
        <input type="range" min="5" max="95" value={soc} onChange={e => { const v = +e.target.value; setSoc(v); if (onSocChange) onSocChange(v); }} className="w-full" />
        <div className="flex justify-between text-[9px] text-slate-500 mt-1">
          <span>~{Math.round(437 * soc / 100)} km range</span>
          <span>Tata Nexon EV Max</span>
        </div>
      </div>

      {/* Loading indicator */}
      {isLoadingRoute && (
        <div className="mb-4 flex items-center gap-2 text-[11px] text-sky-400 animate-pulse">
          <Loader className="w-3.5 h-3.5 animate-spin" />
          Computing optimal route...
        </div>
      )}

      {/* Actions */}
      {!routeActive ? (
        <button
          onClick={handlePlanClick}
          disabled={!fromCoords || !toCoords || isLoadingRoute}
          className={`w-full h-10 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[.98] cursor-pointer ${
            fromCoords && toCoords && !isLoadingRoute
              ? 'bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-lg shadow-sky-500/15 hover:shadow-sky-500/30'
              : 'bg-white/[.04] border border-white/[.07] text-slate-500 cursor-not-allowed'
          }`}
        >
          <Navigation className="w-4 h-4" /> {fromCoords && toCoords ? 'Show Route on Map' : 'Select source & destination'}
        </button>
      ) : (
        <button onClick={onClearRoute} className="w-full h-10 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-white/[.06] border border-white/10 text-slate-300 hover:bg-white/[.1] transition-all cursor-pointer">
          Hide Route from Map
        </button>
      )}

      {/* Route Summary Stats Block */}
      {routeStats.distance > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-2 bg-sky-500/[.03] border border-sky-500/10 rounded-xl p-3 text-center animate-fade-in">
          <div>
            <div className="text-[9px] text-slate-500 uppercase font-bold flex items-center justify-center gap-1"><Map className="w-3 h-3 text-sky-400 shrink-0" /> Distance</div>
            <div className="text-xs font-extrabold text-white mt-1">{routeStats.distance} km</div>
          </div>
          <div>
            <div className="text-[9px] text-slate-500 uppercase font-bold flex items-center justify-center gap-1"><Clock className="w-3 h-3 text-emerald-400 shrink-0" /> Est. Time</div>
            <div className="text-xs font-extrabold text-sky-400 mt-1">
              {Math.floor(routeStats.timeMins / 60)}h {routeStats.timeMins % 60}m
            </div>
          </div>
          <div>
            <div className="text-[9px] text-slate-500 uppercase font-bold flex items-center justify-center gap-1"><Zap className="w-3 h-3 text-violet-400 shrink-0" /> Stops</div>
            <div className="text-xs font-extrabold text-violet-400 mt-1">{routeStats.stopsCount}</div>
          </div>
        </div>
      )}

      {/* No stations warning */}
      {routeStats.distance > 0 && !isLoadingRoute && stops.length === 0 && routeStats.distance > 437 * soc / 100 && (
        <div className="mt-4 flex items-start gap-2 bg-amber-500/[.06] border border-amber-500/15 rounded-xl p-3 animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-[11px] font-semibold text-amber-400">No charging stations along this route</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Your battery range (~{Math.round(437 * soc / 100)} km) may not cover the full {routeStats.distance} km.
              Stations are currently available on the Lucknow–Delhi corridor.
            </div>
          </div>
        </div>
      )}

      {/* Suggested Stops */}
      {stops.length > 0 && (
        <div className="mt-5 space-y-0">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-3">
            Optimized Charging Stops ({stops.length})
          </div>

          {/* Timeline */}
          <div className="relative ml-2 border-l border-sky-500/20 pl-5 space-y-4">
            {/* Start */}
            <div className="relative">
              <div className="absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full bg-sky-400 ring-2 ring-sky-400/20" />
              <div className="text-xs font-medium text-slate-300">Start — {fromQuery.split(',')[0]}</div>
              <div className="text-[10px] text-slate-500">SOC: {soc}% • Range: ~{Math.round(437*soc/100)} km</div>
            </div>

            {stops.map((stop) => (
              <div key={stop.id} className="relative animate-slide-up">
                <div className="absolute -left-[24px] top-1 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-amber-400/20 flex items-center justify-center">
                  <Zap className="w-1.5 h-1.5 text-slate-950" />
                </div>
                <div className="bg-white/[.03] border border-white/[.06] rounded-xl p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-semibold text-white">{stop.name.split('—')[0].trim()}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {stop.power} kW • {stop.distKm} km from prev • ~{stop.chargeMins} min charge
                        {stop.distFromRoute > 0 && <span className="text-slate-500"> • {stop.distFromRoute} km off route</span>}
                      </div>
                      <div className="text-[9px] text-amber-400 mt-1 flex items-center gap-1">
                        <span>Arrival SOC: {stop.arrivalSoc}%</span>
                        <span>•</span>
                        <span>{stop.reason}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => onStartCharge(stop)}
                      className="text-[10px] font-semibold bg-sky-500/15 border border-sky-500/25 text-sky-400 px-2.5 py-1 rounded-lg hover:bg-sky-500/25 transition-colors cursor-pointer shrink-0"
                    >
                      Charge
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* End */}
            <div className="relative">
              <div className="absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-400/20" />
              <div className="text-xs font-medium text-slate-300">Arrive — {toQuery.split(',')[0]}</div>
              <div className="text-[10px] text-slate-500">
                Estimated arrival SOC: ~{arrivalSoc != null ? arrivalSoc : '??'}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
