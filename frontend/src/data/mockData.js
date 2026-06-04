// ─── Core Mock Data: Stations, Vehicles, Operators, AI Models ───

export const OPERATORS = [
  { id: 'tata',       name: 'Tata Power',   logo: '⚡', accent: '#06b6d4' },
  { id: 'statiq',     name: 'Statiq',       logo: '🔋', accent: '#3b82f6' },
  { id: 'chargezone', name: 'ChargeZone',   logo: '🟢', accent: '#10b981' },
  { id: 'jiobp',      name: 'Jio-bp Pulse', logo: '🟠', accent: '#f97316' },
];

export const VEHICLES = [
  { id: 'nexon',  name: 'Tata Nexon EV Max',    range: 437, battery: 40.5, connector: 'CCS2' },
  { id: 'zsev',   name: 'MG ZS EV',             range: 461, battery: 50.3, connector: 'CCS2' },
  { id: 'kona',   name: 'Hyundai Kona Electric', range: 452, battery: 39.2, connector: 'CCS2' },
  { id: 'atto3',  name: 'BYD Atto 3',           range: 521, battery: 60.5, connector: 'CCS2' },
  { id: 'tiago',  name: 'Tata Tiago.ev',        range: 250, battery: 24.0, connector: 'Type2' },
];

export const STATIONS = [
  {
    id: 'TP-LKO-01', name: 'Tata Power Hub — Hazratganj', operator: 'tata',
    lat: 26.8504, lng: 80.9422, status: 'available',
    connector: 'CCS2', power: 60, price: 18.5,
    queue: 0, waitMin: 0, uptime: 99.4, latency: 42,
    temp: 34, voltage: 415, current: 0, faultRisk: 2,
    forecast: [30,45,60,20,15,30],
  },
  {
    id: 'ST-KNP-02', name: 'Statiq Fast — Kanpur NH19', operator: 'statiq',
    lat: 26.4712, lng: 80.2618, status: 'occupied',
    connector: 'CCS2', power: 120, price: 21.0,
    queue: 2, waitMin: 12, uptime: 96.8, latency: 128,
    temp: 45, voltage: 408, current: 285, faultRisk: 64,
    forecast: [90,95,80,75,60,45],
  },
  {
    id: 'CZ-AGR-03', name: 'ChargeZone — Yamuna Exp km100', operator: 'chargezone',
    lat: 27.1625, lng: 78.0215, status: 'available',
    connector: 'CCS2', power: 60, price: 19.0,
    queue: 0, waitMin: 0, uptime: 98.9, latency: 55,
    temp: 31, voltage: 412, current: 0, faultRisk: 5,
    forecast: [20,10,40,75,80,90],
  },
  {
    id: 'JB-MTR-04', name: 'Jio-bp Pulse — Mathura Plaza', operator: 'jiobp',
    lat: 27.5255, lng: 77.6212, status: 'reserved',
    connector: 'CCS2', power: 150, price: 22.5,
    queue: 1, waitMin: 6, uptime: 97.5, latency: 68,
    temp: 41, voltage: 418, current: 120, faultRisk: 12,
    forecast: [80,90,85,70,50,40],
  },
  {
    id: 'TP-JWR-05', name: 'Tata Power UltraFast — Jewar Toll', operator: 'tata',
    lat: 28.1402, lng: 77.5852, status: 'available',
    connector: 'CCS2', power: 180, price: 20.0,
    queue: 0, waitMin: 0, uptime: 99.8, latency: 38,
    temp: 29, voltage: 421, current: 0, faultRisk: 1,
    forecast: [15,30,45,55,60,70],
  },
  {
    id: 'ST-DLH-06', name: 'Statiq Hub — Sarita Vihar Metro', operator: 'statiq',
    lat: 28.5284, lng: 77.2915, status: 'offline',
    connector: 'CCS2', power: 120, price: 21.0,
    queue: 0, waitMin: 0, uptime: 84.2, latency: 0,
    temp: 18, voltage: 0, current: 0, faultRisk: 98,
    forecast: [0,0,0,0,0,0],
  },
  {
    id: 'CZ-LKO-07', name: 'ChargeZone AC — Gomti Nagar', operator: 'chargezone',
    lat: 26.8655, lng: 80.9982, status: 'available',
    connector: 'Type2', power: 22, price: 15.0,
    queue: 0, waitMin: 0, uptime: 99.1, latency: 48,
    temp: 28, voltage: 230, current: 0, faultRisk: 3,
    forecast: [10,15,20,25,40,50],
  },
];

export const ROUTE_PATH = [
  [26.8467, 80.9462], [26.7584, 80.7012], [26.6110, 80.4501],
  [26.4499, 80.3319], [26.5401, 79.9102], [26.8821, 79.0232],
  [27.1767, 78.0081], [27.3501, 77.8102], [27.5255, 77.6212],
  [27.8102, 77.5852], [28.1402, 77.5852], [28.4744, 77.5040],
  [28.5800, 77.3100], [28.6139, 77.2090],
];

export const AI_RESPONSES = {
  range: (soc, dest, vehicle) => {
    const range = vehicle ? vehicle.range : 437;
    const name = vehicle ? vehicle.name : 'Nexon EV Max';
    const remaining = Math.round(range * soc / 100);
    return `Based on your ${name} (${range} km range) at **${soc}% SOC** (~${remaining} km remaining):\n\n` +
    (remaining < 330
      ? `❌ You **cannot** reach ${dest} directly (~330 km).\n\n💡 **Recommended stop**: Statiq Fast — Kanpur NH19 (80 km). Charge 18 min to 80% and continue.`
      : `✅ You **can** reach ${dest} comfortably with ${remaining - 330} km to spare.`);
  },
  offline: `When connectivity drops, **EVConnect's Edge Gateway** activates:\n\n1. 🔐 Local NFC/token authentication\n2. 📊 Energy metering continues locally\n3. 💾 Encrypted session logs stored on-device\n4. ☁️ Auto-sync when connection restores\n\nYour charging never stops.`,
  cheapest: `**Cheapest chargers right now:**\n\n1. ChargeZone Gomti Nagar — ₹15.0/kWh (AC)\n2. Tata Power Hazratganj — ₹18.5/kWh (DC)\n3. ChargeZone Yamuna — ₹19.0/kWh (DC)\n\n⚡ Night rates (11PM–6AM) are 10% cheaper.`,
  payment: `**VoltPass Unified Wallet** works across ALL networks:\n\n• One-tap QR scan at any charger\n• UPI, Cards, or Prepaid balance\n• Single monthly invoice across all CPOs\n• No separate operator accounts needed`,
  default: `I can help with:\n• "Can I reach Delhi with 30% battery?"\n• "Which charger is cheapest?"\n• "How does offline mode work?"\n• "How do I pay across networks?"`,
};
