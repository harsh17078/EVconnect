import { useState, useCallback, useEffect } from 'react';
import {
  MapPin, Navigation, Wallet, Bot, Zap, Activity,
  ChevronLeft, ChevronRight, Search, Leaf, Sun, Moon,
} from 'lucide-react';
import { io as socketIO } from 'socket.io-client';
import LiveMap from './components/LiveMap';
import StationPanel from './components/StationPanel';
import ChargingSession from './components/ChargingSession';
import RoutePlanner from './components/RoutePlanner';
import WalletPanel from './components/WalletPanel';
import AIChatbot from './components/AIChatbot';
import { STATIONS, OPERATORS } from './data/mockData';

const TABS = [
  { id: 'map',      icon: MapPin,      label: 'Live Map' },
  { id: 'route',    icon: Navigation,  label: 'Route Plan' },
  { id: 'stations', icon: Activity,    label: 'Stations' },
  { id: 'wallet',   icon: Wallet,      label: 'Payments' },
  { id: 'ai',       icon: Bot,         label: 'AI Assistant' },
];

export default function App() {
  const [stations, setStations] = useState(STATIONS);
  const [activeTab, setActiveTab] = useState('map');
  const [selectedStation, setSelectedStation] = useState(null);
  const [routeActive, setRouteActive] = useState(false);
  const [filterOp, setFilterOp] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [balance, setBalance] = useState(1250);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isNetworkOnline, setIsNetworkOnline] = useState(true);
  const [chargingSession, setChargingSession] = useState(null);
  const [transactions, setTransactions] = useState([
    { op: 'Statiq', station: 'Kanpur NH19', kwh: 38.2, cost: 802.20, time: '2 hours ago', type: 'Roaming' },
    { op: 'Tata Power', station: 'Hazratganj', kwh: 26.4, cost: 488.40, time: 'Yesterday', type: 'Direct' },
    { op: 'ChargeZone', station: 'Gomti Nagar', kwh: 12.0, cost: 180.00, time: 'Jun 1', type: 'Roaming' },
  ]);

  // ── 1. Fetch initial states from Backend if online ──
  const fetchInitialData = useCallback(async () => {
    if (!isNetworkOnline) return;
    try {
      const resStations = await fetch('http://localhost:8085/api/stations');
      if (resStations.ok) {
        const data = await resStations.json();
        setStations(data);
      }
      const resWallet = await fetch('http://localhost:8085/api/wallet');
      if (resWallet.ok) {
        const data = await resWallet.json();
        setBalance(data.balance);
        setTransactions(data.transactions);
      }
    } catch (err) {
      console.warn('⚠️ Could not connect to EVConnect API Gateway during initial fetch');
    }
  }, [isNetworkOnline]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // ── 2. Live WebSocket Stream Synchronization ──
  useEffect(() => {
    if (!isNetworkOnline) return;

    const socket = socketIO('http://localhost:8085');

    socket.on('connect', () => {
      console.log('⚡ Connected to Live WebSocket Stream (API Gateway).');
    });

    socket.on('stations-updated', (updatedStations) => {
      setStations(updatedStations);
    });

    socket.on('wallet-updated', ({ balance, transactions }) => {
      setBalance(balance);
      setTransactions(transactions);
    });

    return () => {
      socket.disconnect();
    };
  }, [isNetworkOnline]);

  // ── Start Charging ──
  const onStartCharge = useCallback(async (station) => {
    if (balance < 50) {
      alert('Insufficient balance! Please top up your VoltPass wallet.');
      return;
    }

    if (!isNetworkOnline) {
      // Offline simulation fallback
      setChargingSession({
        stationId: station.id,
        stationName: station.name,
        operator: station.operator,
        power: station.power,
        price: station.price,
        startSoc: 32,
        isOffline: true,
      });
      setStations(prev => prev.map(s =>
        s.id === station.id ? { ...s, status: 'occupied', current: Math.round(station.power * 1000 / (station.voltage || 415)) } : s
      ));
      setSelectedStation(null);
      setActiveTab('map');
      return;
    }

    try {
      const response = await fetch(`http://localhost:8085/api/stations/${station.id}/start-charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOffline: false })
      });
      if (!response.ok) throw new Error('API error');
      const data = await response.json();
      setChargingSession(data.session);
      setSelectedStation(null);
      setActiveTab('map');
    } catch (error) {
      console.warn('⚠️ Start charge endpoint offline, using local simulation fallback');
      setChargingSession({
        stationId: station.id,
        stationName: station.name,
        operator: station.operator,
        power: station.power,
        price: station.price,
        startSoc: 32,
        isOffline: true,
      });
      setStations(prev => prev.map(s =>
        s.id === station.id ? { ...s, status: 'occupied', current: Math.round(station.power * 1000 / (station.voltage || 415)) } : s
      ));
      setSelectedStation(null);
      setActiveTab('map');
    }
  }, [isNetworkOnline, balance]);

  // ── Stop Charging ──
  const onStopCharge = useCallback(async ({ cost, kwh, soc }) => {
    if (!chargingSession) return;
    const finalCost = Math.round(cost * 100) / 100;

    if (chargingSession.isOffline || !isNetworkOnline) {
      // Local sync simulation
      setBalance(prev => Math.round((prev - finalCost) * 100) / 100);
      const opName = OPERATORS.find(o => o.id === chargingSession.operator)?.name || chargingSession.operator;
      setTransactions(prev => [{
        op: opName,
        station: chargingSession.stationName.split('—')[1]?.trim() || chargingSession.stationName,
        kwh: kwh,
        cost: finalCost,
        time: 'Just now',
        type: 'Offline',
      }, ...prev]);

      setStations(prev => prev.map(s =>
        s.id === chargingSession.stationId ? { ...s, status: 'available', current: 0 } : s
      ));
      setChargingSession(null);
      alert('⚡ Offline charging session saved on-device. Auto-synchronized when network restores.');
      return;
    }

    try {
      const response = await fetch(`http://localhost:8085/api/stations/${chargingSession.stationId}/stop-charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cost, kwh, soc, isOffline: false })
      });
      if (!response.ok) throw new Error('API error');
      setChargingSession(null);
    } catch (error) {
      console.warn('⚠️ Stop charge endpoint offline, using local simulation fallback');
      setBalance(prev => Math.round((prev - finalCost) * 100) / 100);
      const opName = OPERATORS.find(o => o.id === chargingSession.operator)?.name || chargingSession.operator;
      setTransactions(prev => [{
        op: opName,
        station: chargingSession.stationName.split('—')[1]?.trim() || chargingSession.stationName,
        kwh: kwh,
        cost: finalCost,
        time: 'Just now',
        type: 'Offline',
      }, ...prev]);

      setStations(prev => prev.map(s =>
        s.id === chargingSession.stationId ? { ...s, status: 'available', current: 0 } : s
      ));
      setChargingSession(null);
    }
  }, [chargingSession, isNetworkOnline]);

  // ── Reserve a Slot ──
  const onReserve = useCallback(async (station) => {
    if (!isNetworkOnline) {
      setStations(prev => prev.map(s => s.id === station.id ? { ...s, status: 'reserved', waitMin: 30 } : s));
      setSelectedStation(prev => prev ? { ...prev, status: 'reserved' } : null);
      alert('🕒 Reserved offline. Hold confirmed on-device.');
      return;
    }

    try {
      const response = await fetch('http://localhost:8085/api/reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: station.id })
      });
      if (!response.ok) throw new Error('Failed to reserve');
      alert(`Slot confirmed at ${station.name}. Hold fee: ₹50 (refundable).`);
    } catch (error) {
      console.warn('⚠️ Reservation endpoint offline, fallback to local');
      setStations(prev => prev.map(s => s.id === station.id ? { ...s, status: 'reserved', waitMin: 30 } : s));
      setSelectedStation(prev => prev ? { ...prev, status: 'reserved' } : null);
      alert('🕒 Reserved (Offline Mode). Hold confirmed on-device.');
    }
  }, [isNetworkOnline]);

  // ── Top Up ──
  const onTopUp = useCallback(async (amt) => {
    if (!isNetworkOnline) {
      setBalance(b => b + amt);
      return;
    }

    try {
      const response = await fetch('http://localhost:8085/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt })
      });
      if (!response.ok) throw new Error('Failed to top up');
    } catch (error) {
      console.warn('⚠️ Wallet topup endpoint offline, fallback to local');
      setBalance(b => b + amt);
    }
  }, [isNetworkOnline]);

  // Filtered stations for map tab
  const mapStations = stations.filter(s => {
    if (filterOp !== 'all' && s.operator !== filterOp) return false;
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase()) && !s.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const onlineCount = stations.filter(s => s.status !== 'offline').length;
  const co2Total = (85.4 + transactions.reduce((a, t) => a + (typeof t.kwh === 'number' ? t.kwh : 0) * 0.71, 0)).toFixed(1);

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#06080f] text-slate-200">

      {/* ─── Sidebar ─── */}
      <aside className={`shrink-0 flex flex-col border-r border-white/[.05] bg-[#080c17]/80 backdrop-blur-xl transition-all duration-300 z-50 ${
        sidebarOpen ? 'w-56' : 'w-16'
      }`}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-white/[.05] shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-400 to-violet-500 flex items-center justify-center shadow-lg shadow-sky-500/20 shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {sidebarOpen && (
            <div className="animate-fade-in">
              <h1 className="text-sm font-extrabold bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">EVConnect</h1>
              <p className="text-[8px] text-slate-500 uppercase tracking-widest">eMSP Platform</p>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 p-3 space-y-1">
          {TABS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); setSelectedStation(null); }}
              className={`nav-item w-full ${activeTab === id ? 'active' : ''} ${!sidebarOpen ? 'justify-center px-0' : ''}`}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {sidebarOpen && <span>{label}</span>}
              {id === 'map' && chargingSession && sidebarOpen && (
                <span className="ml-auto w-2 h-2 rounded-full bg-sky-400 animate-blink" />
              )}
            </button>
          ))}
        </nav>

        {/* Status Footer (Matching Mockup) */}
        {sidebarOpen && (
          <div className="p-4 border-t border-white/[.05] space-y-3.5 animate-fade-in text-[11px]">
            <div>
              <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold">Network Status</div>
              <div className="flex items-center gap-1.5 font-semibold text-emerald-400 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-blink" />
                All Systems Operational
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Online Status</span>
              <span className="text-slate-300 font-bold">
                {isNetworkOnline ? `${onlineCount}/${stations.length} Online` : 'Offline'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">CO₂ Saved</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <Leaf className="w-3 h-3" /> {co2Total} kg
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-white/[.05] pb-3">
              <span className="text-slate-500 font-medium">Total Users</span>
              <span className="text-slate-300 font-bold font-mono">21,042</span>
            </div>

            {/* Pill Theme Toggle */}
            <div className="flex bg-white/[.04] border border-white/[.07] rounded-xl p-1 gap-1">
              <button className="flex-1 flex items-center justify-center py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors">
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button className="flex-1 flex items-center justify-center py-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/15 transition-colors">
                <Moon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="h-10 flex items-center justify-center border-t border-white/[.05] text-slate-500 hover:text-white transition-colors"
        >
          {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Top Bar */}
        <header className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-white/[.05] bg-[#080c17]/60 backdrop-blur-xl z-40">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-white">
              {TABS.find(t => t.id === activeTab)?.label}
            </h2>
            {chargingSession && (
              <button
                onClick={() => setActiveTab('map')}
                className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 px-2.5 py-1 rounded-full text-[10px] font-semibold hover:bg-sky-500/20 transition-colors cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-blink" />
                Charging Active — View Session
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {(activeTab === 'map' || activeTab === 'route') && (
              <div className="flex items-center bg-white/[.04] border border-white/[.07] rounded-lg px-3 py-1.5">
                <Search className="w-3.5 h-3.5 text-slate-500 mr-2" />
                <input
                  type="text" placeholder="Search chargers..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-40"
                />
              </div>
            )}

            {/* Offline toggle */}
            <button
              onClick={() => setIsNetworkOnline(!isNetworkOnline)}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                isNetworkOnline
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              {isNetworkOnline ? '● Online' : '○ Offline Mode'}
            </button>

            {/* User avatar */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-violet-500/15">
              EV
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden relative">

          {/* ── MAP TAB ── */}
          {activeTab === 'map' && (
            <div className="flex-1 flex relative">
              {/* Operator Filter Strip */}
              <div className="absolute top-4 left-4 z-[1100] flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setFilterOp('all')}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border backdrop-blur-md transition-all ${
                    filterOp === 'all' ? 'bg-sky-500/20 border-sky-500/30 text-sky-400' : 'bg-slate-900/70 border-white/[.06] text-slate-400 hover:text-white'
                  }`}
                >All Networks</button>
                {OPERATORS.map(op => (
                  <button key={op.id}
                    onClick={() => setFilterOp(filterOp === op.id ? 'all' : op.id)}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border backdrop-blur-md transition-all ${
                      filterOp === op.id ? 'bg-sky-500/20 border-sky-500/30 text-sky-400' : 'bg-slate-900/70 border-white/[.06] text-slate-400 hover:text-white'
                    }`}
                  >{op.logo} {op.name.split(' ')[0]}</button>
                ))}
              </div>

              {/* Map */}
              <div className="flex-1 h-full relative">
                <LiveMap
                  mapId="main-map"
                  stations={mapStations}
                  selectedStation={selectedStation}
                  onSelectStation={setSelectedStation}
                  routeActive={routeActive}
                />
              </div>

              {/* Map Legend */}
              <div className="absolute bottom-5 right-5 z-[1100] glass rounded-xl px-4 py-3 text-[10px] space-y-1.5">
                {[
                  { color: '#34d399', label: 'Available' },
                  { color: '#fb7185', label: 'Occupied' },
                  { color: '#fbbf24', label: 'Reserved' },
                  { color: '#64748b', label: 'Offline' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}60` }} />
                    <span className="text-slate-400">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ROUTE TAB ── */}
          {activeTab === 'route' && (
            <div className="flex-1 flex">
              <div className="w-[400px] shrink-0 border-r border-white/[.05] p-5 overflow-y-auto">
                <RoutePlanner
                  stations={stations}
                  routeActive={routeActive}
                  onPlanRoute={() => setRouteActive(true)}
                  onClearRoute={() => setRouteActive(false)}
                  onStartCharge={onStartCharge}
                />
              </div>
              <div className="flex-1 h-full relative">
                <LiveMap
                  mapId="route-map"
                  stations={stations}
                  selectedStation={selectedStation}
                  onSelectStation={setSelectedStation}
                  routeActive={routeActive}
                />
              </div>
            </div>
          )}

          {/* ── WALLET TAB ── */}
          {activeTab === 'wallet' && (
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-lg mx-auto p-6">
                <WalletPanel
                  balance={balance}
                  onTopUp={onTopUp}
                  transactions={transactions}
                />
              </div>
            </div>
          )}

          {/* ── STATIONS TAB (Grid list / Analytics) ── */}
          {activeTab === 'stations' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-5xl mx-auto space-y-6 w-full">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-white">Centralized Charging Hub</h3>
                    <p className="text-xs text-slate-400 mt-1">Real-time status updates, sensor diagnostics, and reservation options.</p>
                  </div>
                  
                  {/* Quick summary specs */}
                  <div className="flex gap-4">
                    <div className="glass border-white/[.05] rounded-xl px-4 py-2 text-center">
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Total Stations</div>
                      <div className="text-sm font-extrabold text-white mt-0.5">{stations.length}</div>
                    </div>
                    <div className="glass border-white/[.05] rounded-xl px-4 py-2 text-center">
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Uptime Average</div>
                      <div className="text-sm font-extrabold text-emerald-400 mt-0.5">97.8%</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {stations.map(st => {
                    const op = OPERATORS.find(o => o.id === st.operator);
                    const isOccupied = st.status === 'occupied';
                    const isOffline = st.status === 'offline';
                    
                    return (
                      <div key={st.id} className="glass-highlight rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-white/10 transition-colors animate-slide-up">
                        {/* Operator & Status header */}
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: op?.accent }}>
                              {op?.logo} {op?.name}
                            </span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              st.status === 'available' ? 'chip-available' :
                              st.status === 'occupied' ? 'chip-occupied' :
                              st.status === 'reserved' ? 'chip-reserved' : 'chip-offline'
                            }`}>{st.status.toUpperCase()}</span>
                          </div>
                          <h4 className="text-sm font-bold text-white truncate">{st.name.split('—')[1] || st.name}</h4>
                          <p className="text-[10px] text-slate-500 font-semibold mt-1">ID: {st.id}</p>
                        </div>

                        {/* Power & rate */}
                        <div className="grid grid-cols-2 gap-2 bg-white/[.02] border border-white/[.04] rounded-xl p-2 text-center">
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase font-semibold font-sans">Power</div>
                            <div className="text-xs font-bold text-white mt-0.5">{st.power} kW</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase font-semibold font-sans">Price</div>
                            <div className="text-xs font-bold text-sky-400 mt-0.5">₹{st.price}/kWh</div>
                          </div>
                        </div>

                        {/* Anomaly sensors telemetry diagnostics */}
                        <div className="space-y-1.5 text-[10px] text-slate-400 pt-1">
                          <div className="flex justify-between">
                            <span>Operating Temp:</span>
                            <span className={st.temp > 40 ? 'text-rose-400 font-bold animate-pulse' : 'text-slate-300'}>{st.temp}°C</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Voltage / Current:</span>
                            <span className="text-slate-300">{st.voltage}V / {st.current}A</span>
                          </div>
                          <div className="flex justify-between">
                            <span>AI Fault Risk:</span>
                            <span className={st.faultRisk > 50 ? 'text-rose-400 font-bold animate-pulse' : 'text-slate-300'}>{st.faultRisk}%</span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2 pt-2">
                          {st.status === 'available' && (
                            <>
                              <button onClick={() => onStartCharge(st)} className="flex-1 h-9 rounded-xl text-xs font-bold bg-sky-500 text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer">
                                Charge
                              </button>
                              <button onClick={() => onReserve(st)} className="h-9 px-3 rounded-xl text-xs font-semibold glass border-white/10 text-slate-300 hover:bg-white/[.05] transition-colors cursor-pointer">
                                Reserve
                              </button>
                            </>
                          )}
                          {st.status === 'occupied' && (
                            <div className="flex-1 py-2 text-center rounded-xl text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/15">
                              🔒 Occupied — wait {st.waitMin}m
                            </div>
                          )}
                          {st.status === 'reserved' && (
                            <div className="flex-1 py-2 text-center rounded-xl text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/15">
                              🕒 Reserved Slot
                            </div>
                          )}
                          {st.status === 'offline' && (
                            <button onClick={() => onStartCharge(st)} className="flex-1 h-9 rounded-xl text-xs font-semibold bg-amber-500/15 border border-amber-500/25 text-amber-400 hover:bg-amber-500/25 transition-colors cursor-pointer">
                              Edge Offline Charge
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── AI TAB ── */}
          {activeTab === 'ai' && (
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-5xl mx-auto p-6 w-full">
                <AIChatbot balance={balance} co2Total={parseFloat(co2Total)} />
              </div>
            </div>
          )}

        </div>

        {/* Global Charging session overlay */}
        {chargingSession && (
          <div className="absolute inset-0 z-[1300] bg-[#06080f]/95 backdrop-blur-sm flex items-center justify-center">
            <div className="w-full max-w-lg">
              <ChargingSession session={chargingSession} onStop={onStopCharge} />
            </div>
          </div>
        )}

        {/* Global Station detail panel */}
        {selectedStation && !chargingSession && (
          <StationPanel
            station={selectedStation}
            onClose={() => setSelectedStation(null)}
            onStartCharge={onStartCharge}
            onReserve={onReserve}
            isCharging={!!chargingSession}
          />
        )}
      </main>
    </div>
  );
}
