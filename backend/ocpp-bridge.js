// OCPP 2.0.1 JSON-RPC Handlers (CPO CPMS Bridge)
// Manages the direct communication from physical chargers to the EVConnect CPMS cloud

export function ocppHandler(rpcPayload) {
  const { messageId, action, payload } = rpcPayload;
  
  console.log(`[OCPP RPC] Incoming action: ${action} | MsgId: ${messageId}`);

  switch (action) {
    case 'BootNotification':
      return {
        messageType: 3, // CALLRESULT
        messageId,
        payload: {
          currentTime: new Date().toISOString(),
          interval: 60,
          status: 'Accepted'
        }
      };

    case 'Heartbeat':
      return {
        messageType: 3,
        messageId,
        payload: {
          currentTime: new Date().toISOString()
        }
      };

    case 'StatusNotification':
      // StatusNotification confirms status change: Available, Occupied, Faulted, etc.
      console.log(`[OCPP Status] Charger ${payload.connectorId} state -> ${payload.connectorStatus}`);
      return {
        messageType: 3,
        messageId,
        payload: {}
      };

    case 'MeterValues':
      // Receives voltage, temperature, current telemetry readings
      console.log(`[OCPP Telemetry] Node ${payload.stationId} values: V=${payload.meterValue[0].value}V, A=${payload.meterValue[1].value}A, Temp=${payload.meterValue[2].value}C`);
      return {
        messageType: 3,
        messageId,
        payload: {}
      };

    case 'TransactionEvent':
      // TransactionEvent handles session starts/stops
      console.log(`[OCPP Transaction] Type: ${payload.eventType} | Session ID: ${payload.transactionInfo.transactionId}`);
      return {
        messageType: 3,
        messageId,
        payload: {
          status: 'Accepted',
          totalCost: payload.eventType === 'Ended' ? 450.50 : 0
        }
      };

    default:
      return {
        messageType: 4, // CALLERROR
        messageId,
        payload: {
          code: 'NotSupported',
          description: `Action ${action} is not supported on this OCPP 2.0.1 gateway`
        }
      };
  }
}
