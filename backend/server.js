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
    startSoc: 32,
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

// Smart Route Optimizer Endpoint (Dynamic from/to highway calculations)
app.post('/api/route', (req, res) => {
  const { from, to, startSoc } = req.body;
  console.log(`[Routing Engine] Planning route from ${from} to ${to}. Start SOC: ${startSoc}%`);
  
  const stops = [];
  const rangeKm = Math.round(437 * startSoc / 100);
  const f = (from || 'lucknow').toLowerCase();
  const t = (to || 'delhi').toLowerCase();

  // If start is Lucknow
  if (f.includes('lucknow')) {
    if (rangeKm < 150) {
      const kanpur = mockDB.stations.find(s => s.id === 'ST-KNP-02');
      if (kanpur) {
        stops.push({
          ...kanpur,
          distKm: 80,
          chargeMins: 18,
          reason: 'Low SOC — recharge needed'
        });
      }
    }
    // If ending in Noida or Delhi or Jewar
    if (t.includes('delhi') || t.includes('noida') || t.includes('jewar')) {
      const jewar = mockDB.stations.find(s => s.id === 'TP-JWR-05');
      if (jewar) {
        stops.push({
          ...jewar,
          distKm: 400,
          chargeMins: 20,
          reason: 'Top-up before destination'
        });
      }
    }
  } 
  // If start is Kanpur
  else if (f.includes('kanpur')) {
    if (t.includes('delhi') || t.includes('noida') || t.includes('jewar') || t.includes('mathura')) {
      const mathura = mockDB.stations.find(s => s.id === 'JB-MTR-04');
      if (mathura) {
        stops.push({
          ...mathura,
          distKm: 280,
          chargeMins: 15,
          reason: 'Midway top-up'
        });
      }
    }
  }
  // If start is Agra
  else if (f.includes('agra')) {
    if (t.includes('delhi') || t.includes('noida') || t.includes('jewar')) {
      const jewar = mockDB.stations.find(s => s.id === 'TP-JWR-05');
      if (jewar) {
        stops.push({
          ...jewar,
          distKm: 180,
          chargeMins: 15,
          reason: 'Top-up before Noida/Delhi border'
        });
      }
    }
  }

  res.json({
    route: `${from} - ${to} Expressway Corridor`,
    totalDistanceKm: f.includes('lucknow') && t.includes('delhi') ? 550 : f.includes('agra') ? 220 : 350,
    suggestedStops: stops
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
