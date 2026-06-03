import { useState, useEffect } from 'react';
import { Zap, Leaf, StopCircle, WifiOff, ShieldCheck } from 'lucide-react';

const CIRCUMFERENCE = 2 * Math.PI * 62;

export default function ChargingSession({ session, onStop }) {
  const [soc, setSoc] = useState(session.startSoc);
  const [kwh, setKwh] = useState(0);
  const [cost, setCost] = useState(0);
  const [power, setPower] = useState(session.power);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => {
      setSoc(prev => {
        if (prev >= 100) { clearInterval(tick); return 100; }
        const next = prev + 1;
        const p = next > 80 ? Math.round(session.power * 0.35) : session.power;
        setPower(p);
        const dKwh = (p / 3600) * 12;
        setKwh(k => parseFloat((k + dKwh).toFixed(2)));
        setCost(c => parseFloat((c + dKwh * session.price).toFixed(2)));
        setElapsed(e => e + 1);
        return next;
      });
    }, 800);
    return () => clearInterval(tick);
  }, [session]);

  const offset = CIRCUMFERENCE * (1 - soc / 100);
  const co2 = (kwh * 0.71).toFixed(1);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">

      {/* Offline badge */}
      {session.isOffline && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 mb-6">
          <WifiOff className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-semibold text-amber-400">Edge Gateway — Offline Sync Active</span>
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
        </div>
      )}

      {/* Station Info */}
      <div className="text-center mb-6">
        <h3 className="text-lg font-bold text-white">{session.stationName}</h3>
        <p className="text-xs text-slate-400 mt-1">{session.operator.toUpperCase()} Network • Connector CCS2</p>
      </div>

      {/* Animated Charging Ring */}
      <div className="relative w-48 h-48 mb-8">
        {/* Ambient glow */}
        <div className="absolute inset-4 rounded-full bg-sky-500/5 blur-xl" />

        <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
          {/* Track */}
          <circle cx="70" cy="70" r="62" fill="none" stroke="rgba(148,163,184,.08)" strokeWidth="8" />
          {/* Progress */}
          <circle
            cx="70" cy="70" r="62" fill="none"
            stroke="url(#ring-gradient)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset .6s ease' }}
          />
          <defs>
            <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black font-display text-white drop-shadow-[0_0_16px_rgba(56,189,248,.4)]">
            {soc}%
          </span>
          <span className="text-xs text-sky-400 font-semibold mt-1">{power} kW</span>
        </div>
      </div>

      {/* Live Metrics */}
      <div className="grid grid-cols-4 gap-3 w-full max-w-md mb-8">
        {[
          { label: 'Energy', value: `${kwh} kWh`, icon: Zap, color: 'text-sky-400' },
          { label: 'Cost',   value: `₹${cost}`, icon: Zap, color: 'text-violet-400' },
          { label: 'CO₂ Saved', value: `${co2} kg`, icon: Leaf, color: 'text-emerald-400' },
          { label: 'Time',   value: `${Math.floor(elapsed/60)}m ${elapsed%60}s`, icon: Zap, color: 'text-slate-300' },
        ].map(({ label, value, color }, i) => (
          <div key={i} className="bg-white/[.03] border border-white/[.05] rounded-xl p-3 text-center">
            <div className={`text-sm font-bold font-display ${color}`}>{value}</div>
            <div className="text-[9px] text-slate-500 uppercase mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Animated charge bar */}
      <div className="w-full max-w-md h-1.5 rounded-full overflow-hidden bg-white/[.05] mb-6">
        <div className="h-full charge-bar rounded-full" style={{ width: `${soc}%`, transition: 'width .5s ease' }} />
      </div>

      {/* Stop Button */}
      <button
        onClick={() => onStop({ cost, kwh, soc })}
        className="flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-sm
          bg-rose-500/10 border border-rose-500/20 text-rose-400
          hover:bg-rose-500/20 hover:border-rose-500/30 transition-all active:scale-[.97]"
      >
        <StopCircle className="w-4 h-4" /> End Session
      </button>
    </div>
  );
}
