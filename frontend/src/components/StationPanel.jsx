import { Zap, Clock, Wifi, WifiOff, ThermometerSun, Gauge, CalendarClock, X, AlertTriangle } from 'lucide-react';
import { OPERATORS } from '../data/mockData';

const STATUS_LABEL = {
  available: { text: 'Available', cls: 'chip-available' },
  occupied:  { text: 'Occupied',  cls: 'chip-occupied' },
  reserved:  { text: 'Reserved',  cls: 'chip-reserved' },
  offline:   { text: 'Offline',   cls: 'chip-offline' },
};

export default function StationPanel({ station, onClose, onStartCharge, onReserve, onCancelReservation, isCharging }) {
  if (!station) return null;
  const op = OPERATORS.find(o => o.id === station.operator);
  const chip = STATUS_LABEL[station.status];
  const peakHour = station.forecast.findIndex(v => v === Math.max(...station.forecast));

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1200] animate-slide-up">
      <div className="glass rounded-t-3xl p-4 md:p-6 max-h-[80vh] md:max-h-[75vh] overflow-y-auto shadow-[0_-12px_40px_rgba(0,0,0,.5)]">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg">{op?.logo}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: op?.accent }}>{op?.name}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${chip.cls}`}>{chip.text}</span>
            </div>
            <h3 className="text-base font-bold text-white leading-snug truncate">{station.name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          {[{ icon: Zap, label: 'Power', value: `${station.power} kW`, color: 'text-sky-400' },
            { icon: Gauge, label: 'Rate', value: `₹${station.price}/kWh`, color: 'text-white' },
            { icon: Clock, label: 'Wait', value: station.waitMin > 0 ? `${station.waitMin} min` : 'None', color: station.waitMin > 0 ? 'text-amber-400' : 'text-emerald-40' },
            { icon: station.latency > 0 ? Wifi : WifiOff, label: 'Latency', value: station.latency > 0 ? `${station.latency}ms` : 'Down', color: station.latency > 0 ? 'text-white' : 'text-red-400' }].map(({ icon: Icon, label, value, color }, i) => (
            <div key={i} className="bg-white/[.03] border border-white/[.05] rounded-xl p-3 text-center">
              <Icon className={`w-4 h-4 mx-auto mb-1 ${color} opacity-70`} />
              <div className={`text-sm font-bold font-display ${color}`}>{value}</div>
              <div className="text-[9px] text-slate-500 uppercase mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        {/* AI Occupancy Forecast */}
        {station.status !== 'offline' && (
          <div className="mb-5 bg-white/[.02] border border-white/[.05] rounded-xl p-4">
            <div className="flex justify-between items-center text-xs mb-3">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-violet-400" /> AI Congestion Forecast
              </span>
              <span className="text-slate-500 text-[10px]">Queue: {station.queue} car{station.queue !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-end gap-1.5 h-14">
              {station.forecast.map((pct, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-sm transition-all relative" style={{ height: `${Math.max(pct, 4)}%` }}>
                    <div className={`absolute inset-0 rounded-sm ${pct > 75 ? 'bg-rose-500/50' : pct > 40 ? 'bg-amber-500/50' : 'bg-emerald-500/50'}`} />
                  </div>
                  <span className="text-[8px] text-slate-600">+{i+1}h</span>
                </div>
              ))}
            </div>
            {peakHour >= 0 && (
              <p className="text-[10px] text-slate-500 mt-2">⚠️ Peak congestion expected in {peakHour + 1}h ({Math.max(...station.forecast)}% utilization)</p>
            )}
          </div>
        )}
        {/* Fault Risk */}
        {station.faultRisk > 40 && (
          <div className="mb-5 bg-rose-500/[.06] border border-rose-500/15 rounded-xl p-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-rose-300">AI Fault Alert — {station.faultRisk}% Failure Risk</div>
              <div className="text-[10px] text-rose-400/70 mt-0.5">Isolation Forest model detected anomalous temp ({station.temp}°C) and voltage ({station.voltage}V) patterns. Maintenance recommended.</div>
            </div>
          </div>
        )}
        {/* Action Buttons */}
        <div className="flex gap-3">
          {station.status === 'available' && (
            <>
              <button onClick={() => onStartCharge(station)} disabled={isCharging} className="flex-1 h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 to-cyan-400 text-slate-950 hover:from-sky-400 hover:to-cyan-300 disabled:opacity-40 shadow-lg shadow-sky-500/20 transition-all active:scale-[.98]">
                <Zap className="w-4 h-4" /> Start Charging
              </button>
              <button onClick={() => onReserve(station)} className="h-11 px-5 rounded-xl font-semibold text-sm glass border-white/10 text-slate-200 hover:bg-white/[.06] transition-all">Reserve</button>
            </>
          )}
          {station.status === 'occupied' && (
            <div className="flex-1 glass rounded-xl p-3 text-center text-sm text-slate-400">🔒 Currently occupied — estimated {station.waitMin} min wait</div>
          )}
          {station.status === 'reserved' && (
            <>
              <div className="flex-1 glass rounded-xl p-3 text-center text-sm text-amber-400/80">🕒 Reserved — next slot in {station.waitMin} min</div>
              <button onClick={() => onCancelReservation(station)} className="h-11 px-5 rounded-xl font-semibold text-sm glass border-white/10 text-amber-400 hover:bg-white/[.06] transition-all">Cancel Reservation</button>
            </>
          )}
          {station.status === 'offline' && (
            <button onClick={() => onStartCharge(station)} disabled={isCharging} className="flex-1 h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-amber-500/15 border border-amber-500/25 text-amber-400 hover:bg-amber-500/25 disabled:opacity-40 transition-all">
              <WifiOff className="w-4 h-4" /> Offline Charge (Edge Mode)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
