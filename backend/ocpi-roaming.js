// OCPI 2.2.1 (Open Charge Point Interface) Roaming Controller
// Enables interoperability and peer-to-peer data syncing with other networks (Tata, Statiq, ChargeZone)

import { Router } from 'express';
export const ocpiRouter = Router();

// Mock OCPI Roaming credentials
const OCPI_CREDENTIALS = {
  our_token: 'EMSP-VOLTCONNECT-SECRET-KEY',
  other_networks: {
    tata: 'CPO-TATA-ROAMING-KEY',
    statiq: 'CPO-STATIQ-ROAMING-KEY'
  }
};

// 1. Credentials handshake
ocpiRouter.post('/credentials', (req, res) => {
  const { token, url } = req.body;
  console.log(`[OCPI Handshake] Initiated by client. Roaming token received. URL: ${url}`);
  
  res.json({
    status_code: 1000,
    status_message: 'Success',
    timestamp: new Date().toISOString(),
    data: {
      token: OCPI_CREDENTIALS.our_token,
      url: process.env.OCPI_ROAMING_URL || 'https://api.evconnect.com/ocpi/v2.2.1/credentials'
    }
  });
});

// 2. Locations Module: Sync charging locations (POI - Point of Interest data sharing)
ocpiRouter.get('/locations', (req, res) => {
  console.log('[OCPI Sync] Sharing charging points (POI) with partner network.');
  res.json({
    status_code: 1000,
    status_message: 'Success',
    data: [
      {
        id: 'CZ-LKO-07',
        name: 'ChargeZone - Gomti Nagar',
        coordinates: { latitude: 26.8655, longitude: 80.9982 },
        evses: [
          {
            uid: 'CZ-LKO-07-E1',
            status: 'AVAILABLE',
            connectors: [{ id: '1', standard: 'IEC_62196_T2', format: 'CABLE', power_type: 'AC_3_PHASE', voltage: 230, amperage: 32 }]
          }
        ]
      }
    ]
  });
});

// 3. Tokens Module: Authorize another network's user to charge on our hardware (or vice versa)
ocpiRouter.post('/tokens/:token_uid/authorize', (req, res) => {
  const { token_uid } = req.params;
  const { location_id } = req.body;
  console.log(`[OCPI Auth] Roaming request received. User Token: ${token_uid} | Charger ID: ${location_id}`);

  // Auto-accept mock credentials for hackathon demonstration
  res.json({
    status_code: 1000,
    status_message: 'Success',
    data: {
      allowed: 'ALLOWED',
      token: {
        uid: token_uid,
        type: 'RFID',
        auth_id: 'USER-RFID-VOLT-8872',
        visual_number: '8872-OC',
        issuer: 'EVConnect',
        valid: true
      }
    }
  });
});
