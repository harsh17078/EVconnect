import { useState, useCallback, useEffect } from 'react';
import {
  MapPin, Navigation, Wallet, Bot, Zap, Activity,
  ChevronLeft, ChevronRight, Search, Leaf, Sun, Moon, Menu, X,
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
  const [theme, setTheme] = useState('dark');
  const [stations, setStations] = useState(STATIONS);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const isIndiaStation = (st) => {
    return st.lat >= 8 && st.lat <= 37 && st.lng >= 68 && st.lng <= 97;
  };

  const indiaStations = stations.filter(isIndiaStation);

  const handleCancelReservation = useCallback((station) => {
    setStations(prev => prev.map(s => s.id === station.id ? { ...s, status: 'available', waitMin: 0 } : s));
  }, []);

  const stationsProp = indiaStations;
  const [activeTab, setActiveTab] = useState('map');
  const [selectedStation, setSelectedStation] = useState(null);
  const [routeActive, setRouteActive] = useState(false);
  const [filterOp, setFilterOp] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [balance, setBalance] = useState(1250);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isNetworkOnline, setIsNetworkOnline] = useState(true);
  const [chargingSession, setChargingSession] = useState(null);
  const [plannedRoutePath, setPlannedRoutePath] = useState([]);
  const [userSoc, setUserSoc] = useState(72);
  const [searchOpen, setSearchOpen] = useState(false);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, [theme]);

  const [transactions, setTransactions] = useState([
    { op: 'Statiq', station: 'Kanpur NH19', kwh: 38.2, cost: 802.20, time: '2 hours ago', type: 'Roaming' },
    { op: 'Tata Power', station: 'Hazratganj', kwh: 26.4, cost: 488.40, time: 'Yesterday', type: 'Direct' },
    { op: 'ChargeZone', station: 'Gomti Nagar', kwh: 12.0, cost: 180.00, time: 'Jun 1', type: 'Roaming' },
  ]);

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

  useEffect(() => {
    if (!isNetworkOnline) return;
    const socket = socketIO('http://localhost:8085');
    socket.on('connect', () => console.log('⚡ Connected to Live WebSocket Stream.'));
    socket.on('stations-updated', (updatedStations) => setStations(updatedStations));
    socket.on('wallet-updated', ({ balance, transactions }) => {
      setBalance(balance);
      setTransactions(transactions);
    });
    return () => socket.disconnect();
  }, [isNetworkOnline]);

  const onStartCharge = useCallback(async (station) => {
    if (balance < 50) {
      alert('Insufficient balance! Please top up your VoltPass wallet.');
      return;
    }
    if (!isNetworkOnline) {
      setChargingSession({ stationId: station.id, stationName: station.name, operator: station.operator, power: station.power, price: station.price, startSoc: userSoc, isOffline: true });
      setStations(prev => prev.map(s => s.id === station.id ? { ...s, status: 'occupied', current: Math.round(station.power * 1000 / (station.voltage || 415)) } : s));
      setSelectedStation(null);
      setActiveTab('map');
      return;
    }
    try {
      const response = await fetch(`http://localhost:8085/api/stations/${station.id}/start-charge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOffline: false, startSoc: userSoc })
      });
      if (!response.ok) throw new Error('API error');
      const data = await response.json();
      setChargingSession(data.session);
      setSelectedStation(null);
      setActiveTab('map');
    } catch (error) {
      console.warn('⚠️ Start charge endpoint offline, using local simulation fallback');
      setChargingSession({ stationId: station.id, stationName: station.name, operator: station.operator, power: station.power, price: station.price, startSoc: userSoc, isOffline: true });
      setStations(prev => prev.map(s => s.id === station.id ? { ...s, status: 'occupied', current: Math.round(station.power * 1000 / (station.voltage || 415)) } : s));
      setSelectedStation(null);
      setActiveTab('map');
    }
  }, [isNetworkOnline, balance, userSoc]);

  const onStopCharge = useCallback(async ({ cost, kwh, soc }) => {
    if (!chargingSession) return;
    const finalCost = Math.round(cost * 100) / 100;
    setUserSoc(soc);
    if (chargingSession.isOffline || !isNetworkOnline) {
      setBalance(prev => Math.round((prev - finalCost) * 100) / 100);
      const opName = OPERATORS.find(o => o.id === chargingSession.operator)?.name || chargingSession.operator;
      setTransactions(prev => [{ op: opName, station: chargingSession.stationName.split('—')[1]?.trim() || chargingSession.stationName, kwh, cost: finalCost, time: 'Just now', type: 'Offline' }, ...prev]);
      setStations(prev => prev.map(s => s.id === chargingSession.stationId ? { ...s, status: 'available', current: 0 } : s));
      setChargingSession(null);
      alert('⚡ Offline charging session saved on-device. Auto-synchronized when network restores.');
      return;
    }
    try {
      const response = await fetch(`http://localhost:8085/api/stations/${chargingSession.stationId}/stop-charge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cost, kwh, soc, isOffline: false })
      });
      if (!response.ok) throw new Error('API error');
      setChargingSession(null);
    } catch (error) {
      console.warn('⚠️ Stop charge endpoint offline, using local simulation fallback');
      setBalance(prev => Math.round((prev - finalCost) * 100) / 100);
      const opName = OPERATORS.find(o => o.id === chargingSession.operator)?.name || chargingSession.operator;
      setTransactions(prev => [{ op: opName, station: chargingSession.stationName.split('—')[1]?.trim() || chargingSession.stationName, kwh, cost: finalCost, time: 'Just now', type: 'Offline' }, ...prev]);
      setStations(prev => prev.map(s => s.id === chargingSession.stationId ? { ...s, status: 'available', current: 0 } : s));
      setChargingSession(null);
    }
  }, [chargingSession, isNetworkOnline]);

  const onReserve = useCallback(async (station) => {
    if (!isNetworkOnline) {
      setStations(prev => prev.map(s => s.id === station.id ? { ...s, status: 'reserved', waitMin: 30 } : s));
      setSelectedStation(prev => prev ? { ...prev, status: 'reserved' } : null);
      alert('🕒 Reserved offline. Hold confirmed on-device.');
      return;
    }
    try {
      const response = await fetch('http://localhost:8085/api/reservation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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

  const onTopUp = useCallback(async (amt) => {
    if (!isNetworkOnline) { setBalance(b => b + amt); return; }
    try {
      const response = await fetch('http://localhost:8085/api/wallet/topup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt })
      });
      if (!response.ok) throw new Error('Failed to top up');
    } catch (error) {
      console.warn('⚠️ Wallet topup endpoint offline, fallback to local');
      setBalance(b => b + amt);
    }
  }, [isNetworkOnline]);

  const mapStations = indiaStations.filter(s => {
    if (filterOp !== 'all' && s.operator !== filterOp) return false;
    if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase()) && !s.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const onlineCount = stations.filter(s => s.status !== 'offline').length;
  const co2Total = (85.4 + transactions.reduce((a, t) => a + (typeof t.kwh === 'number' ? t.kwh : 0) * 0.71, 0)).toFixed(1);

  const handleTabChange = (id) => {
    setActiveTab(id);
    setSelectedStation(null);
    setMobileDrawerOpen(false);
  };

  return (
    <div className={`h-screen w-screen flex overflow-hidden transition-colors duration-300 ${
      theme === 'light' ? 'bg-[#f8fafc] text-slate-900 light-theme' : 'bg-[#06080f] text-slate-200'
    }`}>

      {/* ─── Mobile Overlay ─── */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[200] md:hidden"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}

      {/* ─── Sidebar (desktop) / Drawer (mobile) ─── */}
      <aside className={`
        shrink-0 flex flex-col border-r border-white/[.05] transition-all duration-300 z-[210]
        ${theme === 'light' ? 'bg-white/90' : 'bg-[#080c17]/95'}
        backdrop-blur-xl
        fixed md:relative inset-y-0 left-0
        ${mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${sidebarOpen ? 'w-56' : 'md:w-16 w-56'}
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-white/[.05] shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-400 to-violet-500 flex items-center justify-center shadow-lg shadow-sky-500/20 shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {(sidebarOpen || mobileDrawerOpen) && (
            <div className="animate-fade-in">
              <h1 className="text-sm font-extrabold bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">EVConnect</h1>
              <p className="text-[8px] text-slate-500 uppercase tracking-widest">eMSP Platform</p>
            </div>
          )}
          {/* Close button — mobile only */}
          <button
            onClick={() => setMobileDrawerOpen(false)}
            className="ml-auto md:hidden p-1 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 p-3 space-y-1">
          {TABS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`nav-item w-full ${activeTab === id ? 'active' : ''} ${(!sidebarOpen && !mobileDrawerOpen) ? 'justify-center px-0' : ''}`}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {(sidebarOpen || mobileDrawerOpen) && <span>{label}</span>}
              {id === 'map' && chargingSession && (sidebarOpen || mobileDrawerOpen) && (
                <span className="ml-auto w-2 h-2 rounded-full bg-sky-400 animate-blink" />
              )}
            </button>
          ))}
        </nav>

        {/* Status Footer */}
        {(sidebarOpen || mobileDrawerOpen) && (
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

            {/* Theme Toggle */}
            <div className="flex bg-white/[.04] border border-white/[.07] rounded-xl p-1 gap-1">
              <button
                onClick={() => { if (theme === 'dark') toggleTheme(); }}
                className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors cursor-pointer ${
                  theme === 'light' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/15' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { if (theme === 'light') toggleTheme(); }}
                className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors cursor-pointer ${
                  theme === 'dark' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/15' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Collapse toggle — desktop only */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden md:flex h-10 items-center justify-center border-t border-white/[.05] text-slate-500 hover:text-white transition-colors"
        >
          {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top Bar */}
        <header className={`h-14 shrink-0 flex items-center justify-between px-3 md:px-5 border-b border-white/[.05] ${
          theme === 'light' ? 'bg-white/60' : 'bg-[#080c17]/60'
        } backdrop-blur-xl z-40`}>
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[.05] transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-sm font-bold text-white truncate">
              {TABS.find(t => t.id === activeTab)?.label}
            </h2>
            {chargingSession && (
              <button
                onClick={() => setActiveTab('map')}
                className="hidden sm:flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 px-2.5 py-1 rounded-full text-[10px] font-semibold hover:bg-sky-500/20 transition-colors cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-blink" />
                Charging Active
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search — expandable on mobile */}
            {(activeTab === 'map' || activeTab === 'route') && (
              <>
                {/* Desktop search bar */}
                <div className="hidden sm:flex items-center bg-white/[.04] border border-white/[.07] rounded-lg px-3 py-1.5">
                  <Search className="w-3.5 h-3.5 text-slate-500 mr-2" />
                  <input
                    type="text" placeholder="Search chargers..."
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-32 md:w-40"
                  />
                </div>
                {/* Mobile search toggle */}
                <button
                  onClick={() => setSearchOpen(v => !v)}
                  className="sm:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[.05] transition-colors"
                >
                  <Search className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Online/Offline toggle */}
            <button
              onClick={() => setIsNetworkOnline(!isNetworkOnline)}
              className={`text-[10px] font-semibold px-2 md:px-3 py-1.5 rounded-lg border transition-colors ${
                isNetworkOnline
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              {isNetworkOnline ? '● Online' : '○ Offline'}
            </button>

            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-violet-500/15">
              EV
            </div>
          </div>
        </header>

        {/* Mobile search bar (expandable) */}
        {searchOpen && (activeTab === 'map' || activeTab === 'route') && (
          <div className="sm:hidden px-3 py-2 border-b border-white/[.05] bg-[#080c17]/60 backdrop-blur-xl animate-slide-up">
            <div className="flex items-center bg-white/[.04] border border-white/[.07] rounded-lg px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-slate-500 mr-2" />
              <input
                type="text" placeholder="Search chargers..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                autoFocus
                className="bg-transparent text-xs text-white placeholder-slate-500 outline-none flex-1"
              />
              <button onClick={() => { setSearchQuery(''); setSearchOpen(false); }} className="text-slate-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden relative">

          {/* ── MAP TAB ── */}
          {activeTab === 'map' && (
            <div className="flex-1 flex relative">
              {/* Operator Filter Strip */}
              <div className="absolute top-3 left-2 right-2 md:left-4 md:right-auto z-[1100] flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setFilterOp('all')}
                  className={`text-[10px] md:text-[11px] font-semibold px-2.5 md:px-3 py-1.5 rounded-lg border backdrop-blur-md transition-all ${
                    filterOp === 'all' ? 'bg-sky-500/20 border-sky-500/30 text-sky-400' : 'bg-slate-900/70 border-white/[.06] text-slate-400 hover:text-white'
                  }`}
                >All Networks</button>
                {OPERATORS.map(op => (
                  <button key={op.id}
                    onClick={() => setFilterOp(filterOp === op.id ? 'all' : op.id)}
                    className={`text-[10px] md:text-[11px] font-semibold px-2.5 md:px-3 py-1.5 rounded-lg border backdrop-blur-md transition-all ${
                      filterOp === op.id ? 'bg-sky-500/20 border-sky-500/30 text-sky-400' : 'bg-slate-900/70 border-white/[.06] text-slate-400 hover:text-white'
                    }`}
                  >{op.logo} <span className="hidden sm:inline">{op.name.split(' ')[0]}</span></button>
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
                  theme={theme}
                  routePath={plannedRoutePath}
                />
              </div>

              {/* Map Legend — hidden on very small screens */}
              <div className="hidden sm:block absolute bottom-5 right-5 z-[1100] glass rounded-xl px-3 md:px-4 py-2 md:py-3 text-[10px] space-y-1.5">
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
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Route Planner Panel */}
              <div className="w-full md:w-[380px] lg:w-[420px] shrink-0 border-b md:border-b-0 md:border-r border-white/[.05] p-4 md:p-5 overflow-y-auto max-h-[45vh] md:max-h-none">
                <RoutePlanner
                  stations={stations}
                  routeActive={routeActive}
                  onPlanRoute={(path) => { setPlannedRoutePath(path); setRouteActive(true); }}
                  onClearRoute={() => { setPlannedRoutePath([]); setRouteActive(false); }}
                  onRouteUpdate={(path) => { if (routeActive) setPlannedRoutePath(path); }}
                  onStartCharge={onStartCharge}
                  userSoc={userSoc}
                />
              </div>
              {/* Map */}
              <div className="flex-1 min-h-[280px] relative">
                <LiveMap
                  mapId="route-map"
                  stations={mapStations}
                  selectedStation={selectedStation}
                  onSelectStation={setSelectedStation}
                  routeActive={routeActive}
                  theme={theme}
                  routePath={plannedRoutePath}
                />
              </div>
            </div>
          )}

          {/* ── WALLET TAB ── */}
          {activeTab === 'wallet' && (
            <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
              <div className="max-w-lg mx-auto p-4 md:p-6">
                <WalletPanel
                  balance={balance}
                  onTopUp={onTopUp}
                  transactions={transactions}
                />
              </div>
            </div>
          )}

          {/* ── STATIONS TAB ── */}
          {activeTab === 'stations' && (
            <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
              <div className="max-w-5xl mx-auto space-y-5 w-full">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                  <div>
                    <h3 className="text-base md:text-lg font-bold text-white">Centralized Charging Hub</h3>
                    <p className="text-xs text-slate-400 mt-1">Real-time status updates, sensor diagnostics, and reservation options.</p>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <div className="glass border-white/[.05] rounded-xl px-3 md:px-4 py-2 text-center">
                      <div className="text-[10px] text-slate-500 uppercase font-bold">India Stations</div>
                      <div className="text-sm font-extrabold text-white mt-0.5">{stationsProp.length}</div>
                    </div>
                    <div className="glass border-white/[.05] rounded-xl px-3 md:px-4 py-2 text-center">
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Uptime Avg</div>
                      <div className="text-sm font-extrabold text-emerald-400 mt-0.5">97.8%</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stationsProp.map(st => {
                    const op = OPERATORS.find(o => o.id === st.operator);
                    return (
                      <div key={st.id} className="glass-highlight rounded-2xl p-4 md:p-5 flex flex-col justify-between space-y-4 hover:border-white/10 transition-colors animate-slide-up">
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

                        <div className="grid grid-cols-2 gap-2 bg-white/[.02] border border-white/[.04] rounded-xl p-2 text-center">
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase font-semibold">Power</div>
                            <div className="text-xs font-bold text-white mt-0.5">{st.power} kW</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase font-semibold">Price</div>
                            <div className="text-xs font-bold text-sky-400 mt-0.5">₹{st.price}/kWh</div>
                          </div>
                        </div>

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
                            <div className="flex items-center gap-2 w-full">
                              <div className="flex-1 py-2 text-center rounded-xl text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/15">
                                🕒 Reserved — {st.waitMin} min
                              </div>
                              <button onClick={() => handleCancelReservation(st)} className="h-9 px-3 rounded-xl text-xs font-semibold glass border-white/10 text-amber-400 hover:bg-white/[.06] transition-colors cursor-pointer">
                                Cancel
                              </button>
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
            <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
              <div className="max-w-5xl mx-auto p-4 md:p-6 w-full">
                <AIChatbot balance={balance} co2Total={parseFloat(co2Total)} userSoc={userSoc} />
              </div>
            </div>
          )}

        </div>

        {/* Global Charging session overlay */}
        {chargingSession && (
          <div className={`absolute inset-0 z-[1300] backdrop-blur-sm flex items-center justify-center ${theme === 'light' ? 'bg-[#f8fafc]/95' : 'bg-[#06080f]/95'}`}>
            <div className="w-full max-w-lg px-4">
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
            onCancelReservation={handleCancelReservation}
            isCharging={!!chargingSession}
          />
        )}
      </main>

      {/* ─── Mobile Bottom Navigation ─── */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-[150] border-t border-white/[.05] flex ${
        theme === 'light' ? 'bg-white/90' : 'bg-[#080c17]/90'
      } backdrop-blur-xl`}>
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => handleTabChange(id)}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors relative ${
              activeTab === id ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-semibold">{label}</span>
            {activeTab === id && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-sky-400 rounded-full" />
            )}
            {id === 'map' && chargingSession && (
              <span className="absolute top-2 right-1/3 w-1.5 h-1.5 rounded-full bg-sky-400 animate-blink" />
            )}
          </button>
        ))}
      </nav>

    </div>
  );
}
