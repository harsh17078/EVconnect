import { useState, useEffect, useRef } from 'react';
import { Route, Zap, Navigation, Battery, Search, MapPin, Clock, Map } from 'lucide-react';
import { ROUTE_PATH } from '../data/mockData';

const CITIES = [
  'Lucknow, UP',
  'Kanpur, UP',
  'Agra, UP',
  'Mathura, UP',
  'Jewar, UP',
  'Noida, UP',
  'New Delhi',
];

const CITY_KMS = {
  'lucknow': 0,
  'kanpur': 80,
  'agra': 220,
  'mathura': 300,
  'jewar': 420,
  'noida': 480,
  'delhi': 500,
};

const STATION_KMS = {
  'TP-LKO-01': 5,
  'CZ-LKO-07': 8,
  'ST-KNP-02': 80,
  'CZ-AGR-03': 220,
  'JB-MTR-04': 300,
  'TP-JWR-05': 420,
  'ST-DLH-06': 495,
};

const CITY_INDICES = {
  'lucknow': 0,
  'kanpur': 3,
  'agra': 6,
  'mathura': 8,
  'jewar': 10,
  'noida': 12,
  'delhi': 13,
};

const getCityIndex = (query, defaultIdx) => {
  if (!query) return defaultIdx;
  const q = query.toLowerCase();
  for (const [city, idx] of Object.entries(CITY_INDICES)) {
    if (q.includes(city)) return idx;
  }
  return defaultIdx;
};

const getRouteSegment = (from, to) => {
  const startIdx = getCityIndex(from, 0);
  const endIdx = getCityIndex(to, 13);

  if (startIdx > endIdx) {
    return ROUTE_PATH.slice(endIdx, startIdx + 1).reverse();
  }
  return ROUTE_PATH.slice(startIdx, endIdx + 1);
};

const planEVRoute = (from, to, startSoc, stationsList) => {
  const f = (from || '').toLowerCase();
  const t = (to || '').toLowerCase();

  let startKm = 0;
  let endKm = 500;
  
  for (const [name, km] of Object.entries(CITY_KMS)) {
    if (f.includes(name)) startKm = km;
    if (t.includes(name)) endKm = km;
  }

  const direction = startKm <= endKm ? 1 : -1;
  const totalDistance = Math.abs(endKm - startKm);
  
  const stationsAlongRoute = stationsList
    .map(s => ({
      ...s,
      km: STATION_KMS[s.id] || 0
    }))
    .filter(s => {
      if (direction === 1) {
        return s.km > startKm && s.km < endKm;
      } else {
        return s.km < startKm && s.km > endKm;
      }
    });

  stationsAlongRoute.sort((a, b) => (a.km - b.km) * direction);

  const suggestedStops = [];
  let currentKm = startKm;
  let currentSoc = startSoc;
  const maxRange = 437; 
  
  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    const remainingRange = maxRange * (currentSoc / 100);
    const distanceToDest = Math.abs(endKm - currentKm);
    
    const rangeNeededToDest = distanceToDest + (maxRange * 0.1);
    if (remainingRange >= rangeNeededToDest || remainingRange >= distanceToDest) {
      break;
    }

    let bestStation = null;
    for (const station of stationsAlongRoute) {
      if (suggestedStops.some(s => s.id === station.id)) continue;
      const distFromCurrent = Math.abs(station.km - currentKm);
      if (distFromCurrent <= remainingRange - (maxRange * 0.05)) {
        bestStation = station;
      }
    }

    if (!bestStation) {
      for (const station of stationsAlongRoute) {
        if (suggestedStops.some(s => s.id === station.id)) continue;
        const distFromCurrent = Math.abs(station.km - currentKm);
        if (distFromCurrent <= remainingRange) {
          bestStation = station;
          break;
        }
      }
    }

    if (!bestStation) break;

    const distToStation = Math.abs(bestStation.km - currentKm);
    const socAtStation = Math.round(currentSoc - (distToStation / maxRange * 100));
    const targetSoc = 80;
    const socNeeded = targetSoc - socAtStation;
    const kwhNeeded = (socNeeded / 100) * 40.5;
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

  return {
    totalDistanceKm: totalDistance,
    suggestedStops
  };
};

export default function RoutePlanner({ stations, onPlanRoute, onClearRoute, onRouteUpdate, routeActive, onStartCharge, userSoc }) {
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
  
  // Destination search state
  const [fromQuery, setFromQuery] = useState('Lucknow, UP');
  const [toQuery, setToQuery] = useState('New Delhi');
  const [showFromList, setShowFromList] = useState(false);
  const [showToList, setShowToList] = useState(false);

  const [routeStats, setRouteStats] = useState({
    distance: 0,
    stopsCount: 0,
    timeMins: 0,
  });

  // Suggestions filter
  const fromSuggestions = CITIES.filter(c => c.toLowerCase().includes(fromQuery.toLowerCase()));
  const toSuggestions = CITIES.filter(c => c.toLowerCase().includes(toQuery.toLowerCase()));

  // Auto-close list helpers
  const handleFromBlur = () => {
    setTimeout(() => setShowFromList(false), 200);
  };
  const handleToBlur = () => {
    setTimeout(() => setShowToList(false), 200);
  };

  // ── Auto-recalculate Stops & Slices on SOC or City inputs change ──
  useEffect(() => {
    const timer = setTimeout(() => {
      const runPlan = async () => {
        let plannedStops = [];
        let totalDist = 0;
        let driveTimeMins = 0;
        let routePathCoords = [];

        try {
          const response = await fetch('http://localhost:8085/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: fromQuery,
              to: toQuery,
              startSoc: soc
            })
          });
          if (!response.ok) throw new Error('API error');
          const data = await response.json();
          plannedStops = data.suggestedStops;
          totalDist = data.totalDistanceKm;
          routePathCoords = data.routeCoords || [];
        } catch (error) {
          console.warn('⚠️ Route optimization API offline, using local heuristics fallback');
          const result = planEVRoute(fromQuery, toQuery, soc, stationsRef.current);
          plannedStops = result.suggestedStops;
          totalDist = result.totalDistanceKm;
          routePathCoords = getRouteSegment(fromQuery, toQuery);
        }
        
        setStops(plannedStops);
        setRoutePath(routePathCoords);

        // Travel time at average 80 km/h speed + charging durations
        driveTimeMins = Math.round((totalDist / 80) * 60);
        const chargingTimeMins = plannedStops.reduce((sum, s) => sum + s.chargeMins, 0);

        setRouteStats({
          distance: totalDist,
          stopsCount: plannedStops.length,
          timeMins: driveTimeMins + chargingTimeMins,
        });
        
        // Dynamic live update of route line coordinates on map
        if (onRouteUpdate) {
          onRouteUpdate(routePathCoords);
        }
      };

      runPlan();
    }, 400); // 400ms debounce to avoid spamming network requests

    return () => clearTimeout(timer);
  }, [fromQuery, toQuery, soc, onRouteUpdate]);

  const handlePlanClick = () => {
    onPlanRoute(routePath);
  };

  return (
    <div className="glass-highlight rounded-2xl p-5 animate-fade-in relative">
      <div className="flex items-center gap-2 mb-4">
        <Route className="w-5 h-5 text-sky-400" />
        <h3 className="font-bold text-sm text-white">Smart Route Planner</h3>
      </div>

      {/* Dynamic From/To Inputs with Search Auto-completion */}
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
                onChange={(e) => { setFromQuery(e.target.value); setShowFromList(true); }}
                placeholder="Start City (e.g. Lucknow)"
                className="w-full bg-white/[.04] border border-white/[.07] focus:border-sky-500/35 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Autocomplete Dropdown List */}
          {showFromList && fromSuggestions.length > 0 && (
            <div className="absolute left-6 right-0 mt-1 z-[1200] glass border-white/10 rounded-lg shadow-xl max-h-40 overflow-y-auto">
              {fromSuggestions.map(city => (
                <button
                  key={city}
                  onClick={() => { setFromQuery(city); setShowFromList(false); }}
                  className="w-full text-left px-3.5 py-2 text-[11px] text-slate-300 hover:text-white hover:bg-white/[.06] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <MapPin className="w-3 h-3 text-sky-400" />
                  {city}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-1.5 border-l border-dashed border-sky-500/20 h-4" />

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
                onChange={(e) => { setToQuery(e.target.value); setShowToList(true); }}
                placeholder="Destination City (e.g. Delhi)"
                className="w-full bg-white/[.04] border border-white/[.07] focus:border-sky-500/35 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Autocomplete Dropdown List */}
          {showToList && toSuggestions.length > 0 && (
            <div className="absolute left-6 right-0 mt-1 z-[1200] glass border-white/10 rounded-lg shadow-xl max-h-40 overflow-y-auto">
              {toSuggestions.map(city => (
                <button
                  key={city}
                  onClick={() => { setToQuery(city); setShowToList(false); }}
                  className="w-full text-left px-3.5 py-2 text-[11px] text-slate-300 hover:text-white hover:bg-white/[.06] transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <MapPin className="w-3 h-3 text-emerald-400" />
                  {city}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SOC slider */}
      <div className="mb-5">
        <div className="flex justify-between items-center text-xs mb-2">
          <span className="text-slate-400 flex items-center gap-1"><Battery className="w-3.5 h-3.5" /> Current Battery</span>
          <span className="text-sky-400 font-bold font-display">{soc}%</span>
        </div>
        <input type="range" min="5" max="95" value={soc} onChange={e => setSoc(+e.target.value)} className="w-full" />
        <div className="flex justify-between text-[9px] text-slate-500 mt-1">
          <span>~{Math.round(437 * soc / 100)} km range</span>
          <span>Tata Nexon EV Max</span>
        </div>
      </div>

      {/* Actions */}
      {!routeActive ? (
        <button onClick={handlePlanClick} className="w-full h-10 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-lg shadow-sky-500/15 hover:shadow-sky-500/30 transition-all active:scale-[.98] cursor-pointer">
          <Navigation className="w-4 h-4" /> Show Route on Map
        </button>
      ) : (
        <button onClick={onClearRoute} className="w-full h-10 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-white/[.06] border border-white/10 text-slate-300 hover:bg-white/[.1] transition-all cursor-pointer">
          Hide Route from Map
        </button>
      )}

      {/* Route Summary Stats Block */}
      {routeActive && (
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

            {stops.map((stop, i) => (
              <div key={stop.id} className="relative animate-slide-up">
                <div className="absolute -left-[24px] top-1 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-amber-400/20 flex items-center justify-center">
                  <Zap className="w-1.5 h-1.5 text-slate-950" />
                </div>
                <div className="bg-white/[.03] border border-white/[.06] rounded-xl p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-semibold text-white">{stop.name.split('—')[0].trim()}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{stop.power} kW • {stop.distKm} km from last segment • ~{stop.chargeMins} min charge</div>
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
              <div className="text-[10px] text-slate-500">Estimated arrival SOC: ~15%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
