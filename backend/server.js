import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import mqtt from 'mqtt';
import { ocppHandler } from './ocpp-bridge.js';
import { ocpiRouter } from './ocpi-roaming.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8085;

// Core Stations List (State stored in memory)
const INITIAL_STATIONS = [
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

const mockDB = {
  walletBalance: 1250.00,
  stations: [...INITIAL_STATIONS],
  sessions: [],
  reservations: [],
  transactions: [
    { op: 'Statiq', station: 'Kanpur NH19', kwh: 38.2, cost: 802.20, time: '2 hours ago', type: 'Roaming' },
    { op: 'Tata Power', station: 'Hazratganj', kwh: 26.4, cost: 488.40, time: 'Yesterday', type: 'Direct' },
    { op: 'ChargeZone', station: 'Gomti Nagar', kwh: 12.0, cost: 180.00, time: 'Jun 1', type: 'Roaming' },
  ]
};

// 1. MQTT Telemetry Pulse Subscriber (CPO Hardware Link)
let mqttClient = null;
try {
  mqttClient = mqtt.connect('mqtt://localhost:1883', { connectTimeout: 1000 });
  
  mqttClient.on('connect', () => {
    console.log('⚡ Connected to Mosquitto MQTT Broker.');
    mqttClient.subscribe('evconnect/chargers/+/telemetry');
  });

  mqttClient.on('message', (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      console.log(`[MQTT Telemetry] Topic: ${topic} | Payload:`, payload);
      
      // Update local memory state with live telemetry
      const station = mockDB.stations.find(s => s.id === payload.stationId);
      if (station) {
        station.voltage = payload.voltage;
        station.current = payload.current;
        station.temp = payload.temperature;
        io.emit('stations-updated', mockDB.stations);
      }
    } catch (e) {
      console.warn('Failed to parse MQTT payload:', message.toString());
    }
  });
} catch (err) {
  console.log('⚠️ Mosquitto Broker offline. Telemetry simulation running in local server memory.');
}

// 2. Socket.io Connection Controller
io.on('connection', (socket) => {
  console.log(`🔌 Client connected to Live WebSocket stream. ID: ${socket.id}`);
  
  // Send current state immediately on connect
  socket.emit('stations-updated', mockDB.stations);
  socket.emit('wallet-updated', { balance: mockDB.walletBalance, transactions: mockDB.transactions });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// Broadcast Helper
function broadcastState() {
  io.emit('stations-updated', mockDB.stations);
  io.emit('wallet-updated', { balance: mockDB.walletBalance, transactions: mockDB.transactions });
}

// 3. Core REST Endpoints (eMSP Services)

// OCPI Roaming Integrations
app.use('/ocpi/v2.2.1', ocpiRouter);

// OCPP-RPC bridge endpoint
app.post('/api/ocpp-rpc', (req, res) => {
  const result = ocppHandler(req.body);
  res.json(result);
});

// Stations list endpoint
app.get('/api/stations', (req, res) => {
  res.json(mockDB.stations);
});

// Start Charging Endpoint
app.post('/api/stations/:id/start-charge', (req, res) => {
  const { id } = req.params;
  const { isOffline } = req.body;
  const station = mockDB.stations.find(s => s.id === id);
  if (!station) {
    return res.status(404).json({ error: 'Station not found' });
  }
  if (mockDB.walletBalance < 50) {
    return res.status(400).json({ error: 'Insufficient wallet balance' });
  }

  station.status = 'occupied';
  station.current = Math.round(station.power * 1000 / (station.voltage || 415));

  const session = {
    id: `SESS-${Math.floor(Math.random() * 90000) + 10000}`,
    stationId: id,
    stationName: station.name,
    operator: station.operator,
    power: station.power,
    price: station.price,
    startSoc: req.body.startSoc || 32,
    isOffline: isOffline || false,
    startedAt: new Date().toISOString()
  };
  mockDB.sessions.push(session);
  broadcastState();

  res.json({ status: 'success', session });
});

// Stop Charging Endpoint
app.post('/api/stations/:id/stop-charge', (req, res) => {
  const { id } = req.params;
  const { cost, kwh, soc } = req.body;
  const station = mockDB.stations.find(s => s.id === id);
  if (!station) {
    return res.status(404).json({ error: 'Station not found' });
  }

  station.status = 'available';
  station.current = 0;

  const finalCost = Math.round(cost * 100) / 100;
  mockDB.walletBalance = Math.round((mockDB.walletBalance - finalCost) * 100) / 100;

  // Add transaction
  const opName = station.operator.toUpperCase();
  mockDB.transactions.unshift({
    op: opName,
    station: station.name.split('—')[1]?.trim() || station.name,
    kwh: kwh,
    cost: finalCost,
    time: 'Just now',
    type: req.body.isOffline ? 'Offline' : 'Roaming',
  });

  // Clear current active sessions for this station
  mockDB.sessions = mockDB.sessions.filter(s => s.stationId !== id);
  broadcastState();

  res.json({ status: 'success', walletBalance: mockDB.walletBalance, transactions: mockDB.transactions });
});

// ─── Routing Utilities (Haversine & OpenStreetMap Integrations) ───

// Predefined geocoding backups for corridor cities (useful when offline/fallback)
const BACKUP_GEOLOCATIONS = {
  'lucknow': { lat: 26.8504, lng: 80.9422 },
  'kanpur': { lat: 26.4712, lng: 80.2618 },
  'agra': { lat: 27.1625, lng: 78.0215 },
  'mathura': { lat: 27.5255, lng: 77.6212 },
  'jewar': { lat: 28.1402, lng: 77.5852 },
  'noida': { lat: 28.5800, lng: 77.3100 },
  'delhi': { lat: 28.6139, lng: 77.2090 },
};

const DEFAULT_ROUTE_PATH = [
  [26.8467, 80.9462], [26.7584, 80.7012], [26.6110, 80.4501],
  [26.4499, 80.3319], [26.5401, 79.9102], [26.8821, 79.0232],
  [27.1767, 78.0081], [27.3501, 77.8102], [27.5255, 77.6212],
  [27.8102, 77.5852], [28.1402, 77.5852], [28.4744, 77.5040],
  [28.5800, 77.3100], [28.6139, 77.2090],
];

// Distance calculations helper
function haversineDistance(coords1, coords2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(coords2[0] - coords1[0]);
  const dLng = toRad(coords2[1] - coords1[1]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coords1[0])) *
      Math.cos(toRad(coords2[0])) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Nominatim Geocoder
async function geocodeCity(name) {
  const clean = (name || '').toLowerCase().trim();
  for (const [key, val] of Object.entries(BACKUP_GEOLOCATIONS)) {
    if (clean.includes(key)) return val;
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(name)}&limit=1`, {
      headers: { 'User-Agent': 'EVConnect-Charging-App' }
    });
    if (!res.ok) throw new Error('Nominatim geocoder error');
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.warn(`[Geocoder] Failed to fetch coordinates for "${name}":`, err.message);
  }
  return null;
}

// Nominatim Reverse Geocoder (find intermediate place names)
async function getPlaceName(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`, {
      headers: { 'User-Agent': 'EVConnect-Charging-App' }
    });
    if (!res.ok) throw new Error('Nominatim reverse geocoder error');
    const data = await res.json();
    if (data && data.address) {
      return data.address.city || data.address.town || data.address.village || data.address.county || null;
    }
  } catch (err) {
    console.warn(`[Geocoder] Reverse lookup failed for ${lat}, ${lng}:`, err.message);
  }
  return null;
}

// OSRM Driving Route Engine
async function getOSRMRoute(start, end) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM routing engine response error');
  const data = await res.json();
  if (data && data.routes && data.routes.length > 0) {
    const route = data.routes[0];
    const coords = route.geometry.coordinates.map(c => [c[1], c[0]]); // convert to [lat, lng]
    const distanceKm = Math.round(route.distance / 1000);
    return { coords, distanceKm };
  }
  throw new Error('OSRM route was empty');
}

// Main Endpoint handler
app.post('/api/route', async (req, res) => {
  const { from, to, startSoc } = req.body;
  console.log(`[Routing Engine] Planning route from ${from} to ${to}. Start SOC: ${startSoc}%`);

  // Clear stale dynamic stations to prevent database pollution
  mockDB.stations = mockDB.stations.filter(s => {
    if (!s.id.startsWith('DYN-')) return true;
    const isOccupied = s.status === 'occupied' || s.status === 'reserved';
    const hasActiveSession = mockDB.sessions.some(sess => sess.stationId === s.id);
    return isOccupied || hasActiveSession;
  });

  let startCoords = await geocodeCity(from);
  let endCoords = await geocodeCity(to);

  // Fallback coords
  if (!startCoords) startCoords = BACKUP_GEOLOCATIONS.lucknow;
  if (!endCoords) endCoords = BACKUP_GEOLOCATIONS.delhi;

  let routeCoords = null;
  let totalDistanceKm = 0;

  try {
    const result = await getOSRMRoute(startCoords, endCoords);
    routeCoords = result.coords;
    totalDistanceKm = result.distanceKm;
    console.log(`[Routing Engine] Real-world route found. Distance: ${totalDistanceKm} km. Nodes: ${routeCoords.length}`);
  } catch (err) {
    console.warn('⚠️ OSRM routing failed. Falling back to default Lucknow-Delhi corridor.');
    const startDistToLucknow = haversineDistance([startCoords.lat, startCoords.lng], [BACKUP_GEOLOCATIONS.lucknow.lat, BACKUP_GEOLOCATIONS.lucknow.lng]);
    const startDistToDelhi = haversineDistance([startCoords.lat, startCoords.lng], [BACKUP_GEOLOCATIONS.delhi.lat, BACKUP_GEOLOCATIONS.delhi.lng]);
    if (startDistToDelhi < startDistToLucknow) {
      routeCoords = [...DEFAULT_ROUTE_PATH].reverse();
    } else {
      routeCoords = DEFAULT_ROUTE_PATH;
    }
    totalDistanceKm = 500;
  }

  // Calculate cumulative distances along route nodes
  const cumulativeDistances = [0];
  for (let i = 1; i < routeCoords.length; i++) {
    cumulativeDistances.push(
      cumulativeDistances[i - 1] + haversineDistance(routeCoords[i - 1], routeCoords[i])
    );
  }

  // Filter existing stations close to this route (within 25 km)
  let stationsAlongRoute = [];
  mockDB.stations.forEach(s => {
    let minDistance = Infinity;
    let closestIndex = -1;
    for (let i = 0; i < routeCoords.length; i++) {
      const dist = haversineDistance([s.lat, s.lng], routeCoords[i]);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }
    if (minDistance <= 25) { // Within 25 km threshold
      stationsAlongRoute.push({
        ...s,
        routeIndex: closestIndex,
        distFromRoute: minDistance,
        km: cumulativeDistances[closestIndex]
      });
    }
  });

  // Sort stations sequence by their index on route to check gaps
  stationsAlongRoute.sort((a, b) => a.routeIndex - b.routeIndex);

  let hasLargeGap = false;
  let lastKm = 0;
  for (const s of stationsAlongRoute) {
    if (s.km - lastKm > 150) {
      hasLargeGap = true;
      break;
    }
    lastKm = s.km;
  }
  if (totalDistanceKm - lastKm > 150) {
    hasLargeGap = true;
  }

  // Dynamically generate highway chargers if fewer than 5 are present or there is a large gap
  if (stationsAlongRoute.length < 5 || hasLargeGap) {
    const numToGen = Math.max(3, Math.floor(totalDistanceKm / 110));
    console.log(`[Routing Engine] Only ${stationsAlongRoute.length} stations found, or gap detected. Generating ${numToGen} dynamic highway chargers...`);
    const newStations = [];

    for (let j = 1; j <= numToGen; j++) {
      const frac = j / (numToGen + 1);
      const coordIndex = Math.floor(routeCoords.length * frac);
      const [lat, lng] = routeCoords[coordIndex];

      // Reverse geocode to find a nearby town/place name
      let townName = await getPlaceName(lat, lng);
      if (!townName) {
        townName = `Corridor Plaza km ${Math.round(totalDistanceKm * frac)}`;
      }

      const operators = ['tata', 'statiq', 'chargezone', 'jiobp'];
      const op = operators[j % operators.length];
      const newStId = `DYN-${op.toUpperCase()}-${Math.floor(Math.random() * 90000) + 10000}`;

      const newSt = {
        id: newStId,
        name: `${op === 'tata' ? 'Tata Power Hub' : op === 'statiq' ? 'Statiq Fast' : op === 'chargezone' ? 'ChargeZone' : 'Jio-bp Pulse'} — ${townName}`,
        operator: op,
        lat,
        lng,
        status: 'available',
        connector: 'CCS2',
        power: [60, 120, 150, 180][Math.floor(Math.random() * 4)],
        price: parseFloat((18.0 + Math.random() * 5.0).toFixed(1)),
        queue: 0,
        waitMin: 0,
        uptime: parseFloat((95.0 + Math.random() * 4.9).toFixed(1)),
        latency: Math.floor(30 + Math.random() * 40),
        temp: Math.floor(25 + Math.random() * 12),
        voltage: 415,
        current: 0,
        faultRisk: Math.floor(Math.random() * 15),
        forecast: Array.from({ length: 6 }, () => Math.floor(10 + Math.random() * 80))
      };

      mockDB.stations.push(newSt);
      newStations.push({
        ...newSt,
        routeIndex: coordIndex,
        distFromRoute: 0,
        km: cumulativeDistances[coordIndex]
      });
    }

    stationsAlongRoute = [...stationsAlongRoute, ...newStations];
    broadcastState();
  }

  // Sort stations in the direction of travel
  stationsAlongRoute.sort((a, b) => a.routeIndex - b.routeIndex);

  const suggestedStops = [];
  let currentKm = 0;
  let currentSoc = parseFloat(startSoc) || 72;
  const maxRange = 437; 

  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    const remainingRange = maxRange * (currentSoc / 100);
    const distanceToDest = totalDistanceKm - currentKm;

    // Buffer to verify we can comfortably reach destination
    if (remainingRange >= distanceToDest + (maxRange * 0.1) || remainingRange >= distanceToDest) {
      break;
    }

    let bestStation = null;
    for (const station of stationsAlongRoute) {
      if (suggestedStops.some(s => s.id === station.id)) continue;
      const distFromCurrent = station.km - currentKm;
      if (distFromCurrent > 0 && distFromCurrent <= remainingRange - (maxRange * 0.05)) {
        bestStation = station;
      }
    }

    if (!bestStation) {
      for (const station of stationsAlongRoute) {
        if (suggestedStops.some(s => s.id === station.id)) continue;
        const distFromCurrent = station.km - currentKm;
        if (distFromCurrent > 0 && distFromCurrent <= remainingRange) {
          bestStation = station;
          break;
        }
      }
    }

    if (!bestStation) break;

    const distToStation = bestStation.km - currentKm;
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

  res.json({
    route: `${from} - ${to} Corridor`,
    totalDistanceKm: totalDistanceKm,
    suggestedStops,
    routeCoords
  });
});

// Wallet balance operations (Unified Payments)
app.get('/api/wallet', (req, res) => {
  res.json({ balance: mockDB.walletBalance, transactions: mockDB.transactions });
});

app.post('/api/wallet/topup', (req, res) => {
  const { amount } = req.body;
  mockDB.walletBalance = Math.round((mockDB.walletBalance + parseFloat(amount)) * 100) / 100;
  broadcastState();
  res.json({ status: 'success', balance: mockDB.walletBalance });
});

// Charger Slots Reservation
app.post('/api/reservation', (req, res) => {
  const { stationId } = req.body;
  const station = mockDB.stations.find(s => s.id === stationId);
  if (!station) {
    return res.status(404).json({ error: 'Station not found' });
  }

  station.status = 'reserved';
  station.waitMin = 30;

  const newReservation = {
    id: `RES-${Math.floor(Math.random() * 90000) + 10000}`,
    stationId,
    status: 'Confirmed'
  };
  mockDB.reservations.push(newReservation);
  broadcastState();

  res.json({ status: 'success', reservation: newReservation });
});

// AI Predictor Ping Endpoint (relays to Python ai-service)
app.get('/api/ai/predict-occupancy', async (req, res) => {
  const { stationId } = req.query;
  try {
    const response = await fetch('http://localhost:8000/predict/occupancy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_hour: new Date().getHours() })
    });
    if (!response.ok) throw new Error('FastAPI response error');
    const data = await response.json();
    res.json({
      stationId,
      model: data.model,
      predictions: data.forecast
    });
  } catch (error) {
    console.warn('⚠️ FastAPI predictor offline, using fallback predictions');
    const fallbackPredictions = [30, 45, 60, 20, 15, 30];
    res.json({
      stationId,
      model: 'XGBoost Availability Model v1.2 (Local Mock)',
      predictions: fallbackPredictions
    });
  }
});

// AI Anomaly Predictor
app.get('/api/ai/predict-anomaly', async (req, res) => {
  const { voltage, current, temp } = req.query;
  try {
    const response = await fetch('http://localhost:8000/predict/anomaly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voltage: parseFloat(voltage || 415),
        current: parseFloat(current || 0),
        temperature: parseFloat(temp || 30)
      })
    });
    if (!response.ok) throw new Error('FastAPI response error');
    const data = await response.json();
    res.json(data.diagnostics);
  } catch (error) {
    console.warn('⚠️ FastAPI anomaly detector offline, using fallback diagnostics');
    res.json({
      status: "Healthy",
      anomaly_score: 0.45,
      failure_probability: 5,
      action_recommended: "None"
    });
  }
});

httpServer.listen(PORT, () => {
  console.log(`🚀 EVConnect API Gateway running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket server mapped and active.`);
});
