import { useState } from 'react';
import { Route, Zap, Navigation, Battery, Search, MapPin } from 'lucide-react';

const CITIES = [
  'Lucknow, UP',
  'Kanpur, UP',
  'Agra, UP',
  'Mathura, UP',
  'Jewar, UP',
  'Noida, UP',
  'New Delhi',
];

export default function RoutePlanner({ stations, onPlanRoute, onClearRoute, routeActive, onStartCharge }) {
  const [soc, setSoc] = useState(32);
  const [stops, setStops] = useState([]);
  
  // Destination search state
  const [fromQuery, setFromQuery] = useState('Lucknow, UP');
  const [toQuery, setToQuery] = useState('New Delhi');
  const [showFromList, setShowFromList] = useState(false);
  const [showToList, setShowToList] = useState(false);

  // Suggestions filter
  const fromSuggestions = CITIES.filter(c => c.toLowerCase().includes(fromQuery.toLowerCase()));
  const toSuggestions = CITIES.filter(c => c.toLowerCase().includes(toQuery.toLowerCase()));

  const plan = async () => {
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
      setStops(data.suggestedStops);
      onPlanRoute();
    } catch (error) {
      console.warn('⚠️ Route optimization API offline, using local heuristics fallback');
      const rangeKm = Math.round(437 * soc / 100);
      const neededStops = [];

      // Fallback heuristics matching selected routes
      const f = fromQuery.toLowerCase();
      const t = toQuery.toLowerCase();

      if (f.includes('lucknow')) {
        if (rangeKm < 150) {
          const kanpur = stations.find(s => s.id === 'ST-KNP-02');
          if (kanpur) neededStops.push({ ...kanpur, distKm: 80, chargeMins: 18, reason: 'Low SOC — recharge needed' });
        }
        if (t.includes('delhi') || t.includes('noida') || t.includes('jewar')) {
          const jewar = stations.find(s => s.id === 'TP-JWR-05');
          if (jewar) neededStops.push({ ...jewar, distKm: 400, chargeMins: 20, reason: 'Top-up before destination' });
        }
      } else if (f.includes('agra')) {
        if (t.includes('delhi') || t.includes('noida') || t.includes('jewar')) {
          const jewar = stations.find(s => s.id === 'TP-JWR-05');
          if (jewar) neededStops.push({ ...jewar, distKm: 180, chargeMins: 15, reason: 'Top-up before Noida/Delhi border' });
        }
      }

      setStops(neededStops);
      onPlanRoute();
    }
  };

  const clear = () => {
    setStops([]);
    onClearRoute();
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
                  className="w-full text-left px-3.5 py-2 text-[11px] text-slate-300 hover:text-white hover:bg-white/[.06] transition-colors flex items-center gap-2"
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
                  className="w-full text-left px-3.5 py-2 text-[11px] text-slate-300 hover:text-white hover:bg-white/[.06] transition-colors flex items-center gap-2"
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
        <button onClick={plan} className="w-full h-10 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-lg shadow-sky-500/15 hover:shadow-sky-500/30 transition-all active:scale-[.98]">
          <Navigation className="w-4 h-4" /> Calculate Route
        </button>
      ) : (
        <button onClick={clear} className="w-full h-10 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 bg-white/[.06] border border-white/10 text-slate-300 hover:bg-white/[.1] transition-all">
          Clear Route
        </button>
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
              <div key={stop.id} className="relative">
                <div className="absolute -left-[24px] top-1 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-amber-400/20 flex items-center justify-center">
                  <Zap className="w-1.5 h-1.5 text-slate-950" />
                </div>
                <div className="bg-white/[.03] border border-white/[.06] rounded-xl p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-semibold text-white">{stop.name.split('—')[0].trim()}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{stop.power} kW • {stop.distKm} km from start • ~{stop.chargeMins} min charge</div>
                    </div>
                    <button
                      onClick={() => onStartCharge(stop)}
                      className="text-[10px] font-semibold bg-sky-500/15 border border-sky-500/25 text-sky-400 px-2.5 py-1 rounded-lg hover:bg-sky-500/25 transition-colors"
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
              <div className="text-[10px] text-slate-500">Estimated arrival SOC: ~18%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
