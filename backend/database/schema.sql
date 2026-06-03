-- EVConnect PostgreSQL + PostGIS Schema Setup
-- Run this script to initialize the database tables and spatial extensions

-- 1. Enable Spatial Extensions
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Charging Operators Table (Tata Power, Statiq, etc.)
CREATE TABLE IF NOT EXISTS operators (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL,
    rating DECIMAL(2,1) DEFAULT 5.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Unified Charging Stations Table with Geospatial Coordinates
CREATE TABLE IF NOT EXISTS stations (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    operator_id VARCHAR(50) REFERENCES operators(id) ON DELETE CASCADE,
    connector_type VARCHAR(50) NOT NULL, -- e.g., CCS2, Type 2, CHAdeMO
    power_output VARCHAR(20) NOT NULL,   -- e.g., 60kW, 120kW, 150kW
    price_per_unit DECIMAL(5,2) NOT NULL, -- in INR (₹)
    status VARCHAR(20) DEFAULT 'Available', -- Available, Occupied, Reserved, Offline
    uptime DECIMAL(4,1) DEFAULT 100.0,
    latency INT DEFAULT 30, -- ms
    temperature DECIMAL(4,1) DEFAULT 25.0,
    voltage INT DEFAULT 415, -- V
    current INT DEFAULT 0, -- A
    failure_probability INT DEFAULT 0, -- %
    
    -- Geospatial PostGIS Column: Point geometry in standard WGS84 coordinate system (SRID 4326)
    location GEOMETRY(Point, 4326),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. GIST (Generalized Search Tree) Index for Geospatial Query Performance
-- Critical for near-instant radius calculations across millions of points
CREATE INDEX IF NOT EXISTS idx_stations_location ON stations USING GIST(location);

-- 5. Unified Users & Charging Wallet Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    ev_id VARCHAR(50) UNIQUE NOT NULL, -- Unified EV ID
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    wallet_balance DECIMAL(8,2) DEFAULT 0.0,
    primary_vehicle_model VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Unified Roaming Transactions Table (OCPI Logs)
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(50) PRIMARY KEY, -- OCPI Session ID
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    station_id VARCHAR(50) REFERENCES stations(id) ON DELETE SET NULL,
    energy_delivered_kwh DECIMAL(6,2) NOT NULL,
    cost DECIMAL(8,2) NOT NULL,
    co2_saved_kg DECIMAL(6,2) NOT NULL,
    is_offline_cached BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- SAMPLE POSTGIS GEOSpatial RADIUS QUERY SCRIPT (Uber-like Search)
-- Find all compatible stations within 50 km (50000m) of Hazratganj, Lucknow (GPS: 26.8504, 80.9422)
-- Sorts results by distance (closest first)
-- =========================================================================
/*
SELECT 
    id, 
    name, 
    power_output, 
    price_per_unit, 
    status,
    -- Calculate precise geodesic distance in meters using geography castings
    ST_Distance(location::geography, ST_MakePoint(80.9422, 26.8504)::geography) AS distance_meters
FROM stations
WHERE 
    connector_type = 'CCS2' 
    AND status = 'Available'
    -- Spatial index filter: checks if point is within 50,000 meters
    AND ST_DWithin(location::geography, ST_MakePoint(80.9422, 26.8504)::geography, 50000)
ORDER BY distance_meters ASC;
*/
