# EVConnect: Unified Cross-Platform EV Charging Platform

EVConnect is a high-fidelity, production-grade template designed for EV interoperability and network reliability. The project separates CPO (Charge Point Operator) telemetry and eMSP (eMobility Service Provider) discovery layers, featuring PostGIS radius queries, OCPP 2.0.1 and OCPI 2.2.1 handshakes, and AI-driven availability and predictive maintenance models.

---

## 📂 Repository Directory Layout

```
ET hackon/
├── infrastructure/
│   └── docker-compose.yml       # DB/Cache/Broker stack (PostgreSQL + PostGIS, Redis, Mosquitto)
├── backend/
│   ├── database/
│   │   └── schema.sql           # PostGIS schemas, tables, GIST index, and spatial queries
│   ├── server.js                # Express API Gateway & WebSocket server
│   ├── ocpp-bridge.js           # OCPP 2.0.1 JSON-RPC message handlers
│   └── ocpi-roaming.js          # OCPI 2.2.1 operator roaming routes
├── ai-service/
│   ├── requirements.txt         # Python dependencies (XGBoost, Scikit-learn, FastAPI)
│   ├── main.py                  # FastAPI route server
│   └── predictor.py             # ML availability and anomaly models logic
└── frontend/
    ├── index.html               # Google Fonts (Orbitron) and Leaflet map imports
    ├── vite.config.js           # Vite config with Tailwind CSS v4 compiler
    ├── package.json
    └── src/
        ├── App.jsx              # Responsive client layout (Mobile, Tablet, Laptop)
        ├── index.css            # Cyber theme styles, glowing animations, map filters
        ├── data/
        │   └── mockData.js      # NH-19 corridor coordinate nodes & vehicle specs
        └── components/
            ├── UserAppSim.jsx   # eMSP driver mobile simulation UI
            └── OperatorDashboard.jsx # CPO dashboard and OCPP console UI
```

---

## 🚀 Orchestrating the Services (Setup Guides)

### Step 1: Run Infrastructure (Docker)
Ensure Docker is installed and active on your system.
```bash
cd infrastructure
docker-compose up -d
```
This spins up:
- **PostgreSQL/PostGIS** on port `5432` (user: `ev_admin`, database: `evconnect_db`).
- **Redis Cache** on port `6379`.
- **Mosquitto MQTT Broker** on port `1883`.

*To verify the PostGIS setup, connect to PostgreSQL and run the SQL radius query script defined in [backend/database/schema.sql](file:///d:/users/ET%20hackon/backend/database/schema.sql).*

---

### Step 2: Run Express Backend
Requires Node.js installed.
```bash
cd backend
npm install
npm start
```
Starts the API gateway on: **`http://localhost:8085`**
- Intercepts CPO telemetry heartbeats on `evconnect/chargers/+/telemetry` MQTT topic.
- Integrates Socket.io WebSockets to push live availability updates.
- Hosts REST APIs for range planning, reservations, and OCPI handshakes.

---

### Step 3: Run AI Prediction Service (Python)
Requires Python 3.9+ installed.
```bash
cd ai-service
# (Optional) Create virtual environment
python -m venv venv
source venv/bin/activate  # Or 'venv\Scripts\activate' on Windows
pip install -r requirements.txt
python main.py
```
Starts the FastAPI prediction engine on: **`http://localhost:8000`**
- **XGBoost occupancy model**: Returns 6-hour availability curves via `/predict/occupancy`.
- **Isolation Forest classifier**: Flags anomalies and failure probability in telemetry via `/predict/anomaly`.

---

### Step 4: Run Responsive Frontend Client
Requires Node.js.
```bash
cd frontend
npm install
npm run dev
```
Starts the web client on: **`http://localhost:5173/`**

---

## 📱 Cross-Platform Design Details
The frontend client includes an **auto-adapting layout controller** alongside a manual profile switcher:
- **Mobile Screen**: Drivers see a map, range stops, bottom navigation, QR Scanner, and VoltPass Wallet payments.
- **Tablet Screen**: Split-screen displaying the Map on the left and active charging values / local reservations on the right.
- **Laptop/Desktop Screen**: Renders the smartphone frame (Driver App) alongside the full CPO console containing OCPP WebSockets logs, dynamic load balancers, and Isolation Forest risks.

## 🎥Project Demonstration Video

Watch the complete project demonstration here:



https://github.com/user-attachments/assets/d42f5cd0-4e0f-45c2-9ad4-8ce6518bf56e


