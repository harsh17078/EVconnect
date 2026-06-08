import { useState, useCallback, useEffect } from 'react';
import {
  MapPin, Navigation, Wallet, Bot, Zap, Activity,
  ChevronLeft, ChevronRight, Search, Leaf, Sun, Moon, Menu, X, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { io as socketIO } from 'socket.io-client';
import LiveMap from './components/LiveMap';
import StationPanel from './components/StationPanel';
import ChargingSession from './components/ChargingSession';
import RoutePlanner from './components/RoutePlanner';
import WalletPanel from './components/WalletPanel';
import AIChatbot from './components/AIChatbot';
import { STATIONS, OPERATORS, VEHICLES } from './data/mockData';

const INDIA_POLYGON = [
  [34.5, 74.0], // J&K West
  [35.6, 76.8], // J&K North
  [34.5, 78.5], // Aksai Chin East
  [31.0, 78.8], // Uttarakhand North
  [30.2, 80.5], // Uttarakhand East
  [27.4, 88.1], // Sikkim West
  [28.0, 88.8], // Sikkim North
  [27.3, 88.9], // Sikkim East
  [27.8, 91.5], // Arunachal West
  [29.3, 96.0], // Arunachal North
  [28.2, 97.3], // Arunachal East
  [24.3, 94.5], // Manipur East
  [22.0, 93.0], // Mizoram South
  [24.0, 92.2], // Tripura
  [25.2, 89.8], // Meghalaya South
  [22.0, 89.0], // West Bengal South
  [21.6, 87.0], // Odisha Coast
  [17.0, 82.2], // AP Coast (Kakinada)
  [13.0, 80.3], // Chennai
  [9.0, 79.8],  // Rameshwaram
  [8.0, 77.5],  // Kanyakumari
  [10.0, 76.0], // Kerala West
  [15.0, 73.8], // Goa
  [19.0, 72.8], // Mumbai
  [23.5, 68.2], // Gujarat West (Kutch)
  [24.6, 71.0], // Gujarat/Rajasthan border
  [26.8, 69.3], // Rajasthan West (Jaisalmer)
  [30.0, 73.8], // Rajasthan/Punjab border
  [32.5, 75.6], // Punjab North
  [34.0, 74.2], // J&K Southwest
];

function isPointInPolygon(point, polygon) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}


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
    if (st.lat < 8 || st.lat > 37 || st.lng < 68 || st.lng > 97) return false;
    return isPointInPolygon([st.lat, st.lng], INDIA_POLYGON);
  };

  const indiaStations = stations.filter(isIndiaStation);


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
  const [showWelcome, setShowWelcome] = useState(true);

  // Route planner state — lifted here so it persists across tab switches
  const [routeFromQuery, setRouteFromQuery] = useState('');
  const [routeToQuery, setRouteToQuery] = useState('');
  const [routeFromCoords, setRouteFromCoords] = useState(null);
  const [routeToCoords, setRouteToCoords] = useState(null);
  const [routeStations, setRouteStations] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(VEHICLES[0]);

  const stationsProp = routeActive && routeStations.length > 0
    ? routeStations.map(rs => {
        const latest = stations.find(s => s.id === rs.id);
        return latest ? { ...rs, status: latest.status, waitMin: latest.waitMin, current: latest.current, voltage: latest.voltage, temp: latest.temp } : rs;
      })
    : stations;

  const handleCancelReservation = useCallback(async (station) => {
    setStations(prev => prev.map(s => s.id === station.id ? { ...s, status: 'available', waitMin: 0 } : s));
    setSelectedStation(prev => prev && prev.id === station.id ? { ...prev, status: 'available', waitMin: 0 } : prev);
    if (!isNetworkOnline) {
      alert('🕒 Cancelled offline. Sync when connection restores.');
      return;
    }
    try {
      const response = await fetch('http://localhost:8085/api/reservation/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: station.id })
      });
      if (!response.ok) throw new Error('Failed to cancel');
    } catch (error) {
      console.warn('⚠️ Cancel reservation endpoint offline, fallback to local');
    }
  }, [isNetworkOnline]);

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
      setSelectedStation(prev => prev && prev.id === station.id ? { ...prev, status: 'reserved', waitMin: 30 } : prev);
      alert('🕒 Reserved offline. Hold confirmed on-device.');
      return;
    }
    try {
      const response = await fetch('http://localhost:8085/api/reservation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: station.id })
      });
      if (!response.ok) throw new Error('Failed to reserve');
      setStations(prev => prev.map(s => s.id === station.id ? { ...s, status: 'reserved', waitMin: 30 } : s));
      setSelectedStation(prev => prev && prev.id === station.id ? { ...prev, status: 'reserved', waitMin: 30 } : prev);
      alert(`Slot confirmed at ${station.name}. Hold fee: ₹50 (refundable).`);
    } catch (error) {
      console.warn('⚠️ Reservation endpoint offline, fallback to local');
      setStations(prev => prev.map(s => s.id === station.id ? { ...s, status: 'reserved', waitMin: 30 } : s));
      setSelectedStation(prev => prev && prev.id === station.id ? { ...prev, status: 'reserved', waitMin: 30 } : prev);
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

  const onPlanRoute = useCallback((path) => {
    setPlannedRoutePath(path);
    setRouteActive(true);
  }, []);

  const onClearRoute = useCallback(() => {
    setPlannedRoutePath([]);
    setRouteActive(false);
  }, []);

  const onRouteUpdate = useCallback((path) => {
    setPlannedRoutePath(path);
  }, []);

  const mapStations = stationsProp.filter(s => {
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
          className="fixed inset-0 bg-black/60 z-[1400] md:hidden"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}

      {/* ─── Sidebar (desktop) / Drawer (mobile) ─── */}
      <aside className={`
        shrink-0 flex flex-col border-r border-white/[.05] transform transition-all duration-300 z-[1500]
        ${theme === 'light' ? 'bg-white/90' : 'bg-[#080c17]/95'}
        backdrop-blur-xl
        fixed md:relative inset-y-0 left-0
        ${mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${sidebarOpen ? 'w-56' : 'md:w-16 w-56'}
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-white/[.05] shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-400 to-violet-500 flex items-center justify-center shadow-lg shadow-sky-500/20 shrink-0">
            <Zap className="w-4 h-4 text-white keep-white" />
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

        {/* Vehicle Selector */}
        {(sidebarOpen || mobileDrawerOpen) && (
          <div className={`px-4 py-3 border-t ${theme === 'light' ? 'border-slate-200' : 'border-white/[.05]'}`}>
            <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold mb-2">My Vehicle</div>
            <select
              value={selectedVehicle.id}
              onChange={(e) => setSelectedVehicle(VEHICLES.find(v => v.id === e.target.value) || VEHICLES[0])}
              className={`w-full text-xs rounded-lg px-2 py-1.5 outline-none transition-colors ${
                theme === 'light' 
                  ? 'bg-slate-100 border border-slate-200 text-slate-900 focus:border-sky-500'
                  : 'bg-slate-900 border border-white/10 text-white focus:border-sky-500/50'
              }`}
            >
              {VEHICLES.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Status Footer */}
        {(sidebarOpen || mobileDrawerOpen) && (
          <div className="p-4 border-t border-white/[.05] space-y-3.5 animate-fade-in text-[11px]">
            <div>
              <div className="text-slate-500 uppercase tracking-widest text-[9px] font-bold">Network Status</div>
              <div className={`flex items-center gap-1.5 font-semibold ${routeActive ? 'text-emerald-400' : 'text-slate-400'} mt-1`}>
                <span className={`w-1.5 h-1.5 rounded-full ${routeActive ? 'bg-emerald-400 animate-blink' : 'bg-slate-500'}`} />
                {routeActive ? 'Route Systems Operational' : 'Awaiting Route Data'}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Online Status</span>
              <span className="text-slate-300 font-bold">
                {isNetworkOnline ? (routeActive ? `${routeStations.filter(s => s.status !== 'offline').length}/${routeStations.length} Online` : '--/-- Online') : 'Offline'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Available Now</span>
              <span className="text-emerald-400 font-bold">
                {routeActive ? `${routeStations.filter(s => s.status === 'available').length} Stations` : '--'}
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
          {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0 relative">

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
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-xs font-bold text-white keep-white shadow-lg shadow-violet-500/15">
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
                    filterOp === 'all'
                      ? (theme === 'light'
                          ? 'bg-sky-500/10 border-sky-500/25 text-sky-600 shadow-sm'
                          : 'bg-sky-500/20 border-sky-500/30 text-sky-400')
                      : (theme === 'light'
                          ? 'bg-white/80 border-slate-200/80 text-slate-600 hover:text-slate-900 hover:bg-white'
                          : 'bg-slate-900/70 border-white/[.06] text-slate-400 hover:text-white')
                  }`}
                >All Networks</button>
                {OPERATORS.map(op => (
                  <button key={op.id}
                    onClick={() => setFilterOp(filterOp === op.id ? 'all' : op.id)}
                    className={`text-[10px] md:text-[11px] font-semibold px-2.5 md:px-3 py-1.5 rounded-lg border backdrop-blur-md transition-all ${
                      filterOp === op.id
                        ? (theme === 'light'
                            ? 'bg-sky-500/10 border-sky-500/25 text-sky-600 shadow-sm'
                            : 'bg-sky-500/20 border-sky-500/30 text-sky-400')
                        : (theme === 'light'
                            ? 'bg-white/80 border-slate-200/80 text-slate-600 hover:text-slate-900 hover:bg-white'
                            : 'bg-slate-900/70 border-white/[.06] text-slate-400 hover:text-white')
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

              {/* Map Legend */}
              <div className="absolute top-[90px] md:top-4 right-3 md:right-4 z-[1100] glass rounded-xl px-2.5 md:px-4 py-2 md:py-3 text-[9px] md:text-[10px] space-y-1.5 shadow-lg">
                {[
                  { color: '#34d399', label: 'Available' },
                  { color: '#fb7185', label: 'Occupied' },
                  { color: '#fbbf24', label: 'Reserved' },
                  { color: '#64748b', label: 'Offline' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}60` }} />
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
                  onPlanRoute={onPlanRoute}
                  onClearRoute={onClearRoute}
                  onRouteUpdate={onRouteUpdate}
                  onStartCharge={onStartCharge}
                  userSoc={userSoc}
                  onSocChange={setUserSoc}
                  fromQuery={routeFromQuery}
                  toQuery={routeToQuery}
                  fromCoords={routeFromCoords}
                  toCoords={routeToCoords}
                  onFromQueryChange={setRouteFromQuery}
                  onToQueryChange={setRouteToQuery}
                  onFromCoordsChange={setRouteFromCoords}
                  onToCoordsChange={setRouteToCoords}
                  onStopsComputed={setRouteStations}
                  selectedVehicle={selectedVehicle}
                />
              </div>
              {/* Map */}
              <div className="flex-1 min-h-[280px] relative">
                <LiveMap
                  mapId="route-map"
                  stations={routeStations}
                  selectedStation={selectedStation}
                  onSelectStation={(st) => {
                    setSelectedStation(st);
                  }}
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
            <div className={`flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 ${!routeActive ? 'flex items-center justify-center' : ''}`}>
              {!routeActive ? (
                <div className="flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-4 animate-fade-in -mt-10">
                  <div className="w-16 h-16 bg-sky-500/10 rounded-full flex items-center justify-center border border-sky-500/20 mb-2">
                    <Navigation className="w-8 h-8 text-sky-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Route Directory</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    This directory dynamically generates based on your journey. Please plan a route first to unlock a personalized list of all EV charging stations along your specific path.
                  </p>
                  <button
                    onClick={() => setActiveTab('route')}
                    className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-lg shadow-sky-500/20 hover:shadow-sky-500/40 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    Go to Route Planner
                  </button>
                </div>
              ) : (
                <div className="max-w-5xl mx-auto space-y-5 w-full">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div>
                      {routeActive && routeFromQuery && routeToQuery ? (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-[0_0_10px_rgba(56,189,248,0.1)]">
                              <Navigation className="w-3 h-3" /> Planned Route
                            </span>
                          </div>
                          <h3 className="text-lg md:text-xl font-extrabold text-white flex items-center gap-2.5 flex-wrap">
                            <span>{routeFromQuery.split(',')[0]}</span>
                            <div className="w-6 h-[2px] bg-gradient-to-r from-sky-400 to-emerald-400 rounded-full" />
                            <span>{routeToQuery.split(',')[0]}</span>
                          </h3>
                        </>
                      ) : (
                        <h3 className="text-base md:text-lg font-bold text-white">Centralized Charging Hub</h3>
                      )}
                      <p className="text-xs text-slate-400 mt-1.5">
                        {routeActive 
                          ? 'Showing EV chargers along your planned journey.'
                          : 'Real-time status updates, sensor diagnostics, and reservation options.'}
                      </p>
                    </div>
                    <div className="flex gap-3 shrink-0">
                      <div className="glass border-white/[.05] rounded-xl px-3 md:px-4 py-2 text-center">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">{routeActive ? 'Route Stations' : 'India Stations'}</div>
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
                      <div key={st.id} onClick={() => setSelectedStation(st)} className="cursor-pointer glass-highlight rounded-2xl p-4 md:p-5 flex flex-col justify-between space-y-4 hover:border-white/10 transition-colors animate-slide-up">
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
                      </div>
                    );
                  })}
                </div>
              </div>
              )}
            </div>
          )}

          {/* ── AI TAB ── */}
          {activeTab === 'ai' && (
            <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
              <div className="max-w-5xl mx-auto p-4 md:p-6 w-full">
                <AIChatbot balance={balance} co2Total={parseFloat(co2Total)} userSoc={userSoc} selectedVehicle={selectedVehicle} />
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

        {/* Hackathon Welcome Pitch Modal */}
        {showWelcome && (
          <div className={`absolute inset-0 z-[2000] backdrop-blur-md flex items-center justify-center p-4 ${theme === 'light' ? 'bg-[#f8fafc]/80' : 'bg-[#080c17]/80'}`}>
            <div className="glass max-w-md w-full rounded-2xl p-6 md:p-8 shadow-2xl border border-sky-500/20 animate-slide-up relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-400 to-emerald-400" />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center border border-sky-500/20">
                  <Zap className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400">EVConnect</h2>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">ET AutoTech Hackathon 2026</div>
                </div>
              </div>
              
              <div className="space-y-4 mb-6">
                <div className="bg-white/[.02] border border-white/[.05] rounded-xl p-3">
                  <h3 className="text-xs font-bold text-white mb-1">The Problem</h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">EV owners suffer from "Range Anxiety" and app fatigue, needing dozens of different apps just to pay at different charging stations.</p>
                </div>
                <div className="bg-white/[.02] border border-white/[.05] rounded-xl p-3">
                  <h3 className="text-xs font-bold text-emerald-400 mb-1">Our Solution</h3>
                  <ul className="text-[11px] text-slate-400 leading-relaxed space-y-1.5 list-disc pl-4">
                    <li><strong className="text-slate-200">AI Route Planner:</strong> Calculates exact battery drops and safely routes you to mid-way charging stops.</li>
                    <li><strong className="text-slate-200">Unified Roaming Wallet:</strong> Pay across Tata, Statiq, and ChargeZone using one single balance.</li>
                    <li><strong className="text-slate-200">Live IoT Telemetry:</strong> Real-time hardware monitoring via WebSockets.</li>
                  </ul>
                </div>
              </div>

              <button
                onClick={() => setShowWelcome(false)}
                className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-sky-500 to-emerald-500 text-white shadow-lg shadow-sky-500/20 hover:shadow-sky-500/40 transition-all active:scale-[0.98] cursor-pointer"
              >
                Launch Prototype Demo
              </button>
            </div>
          </div>
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
