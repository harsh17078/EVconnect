from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from predictor import XGBoostAvailabilityModel, IsolationForestAnomalyDetector

app = FastAPI(title="EVConnect AI Prediction Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instantiate models
xg_model = XGBoostAvailabilityModel()
if_detector = IsolationForestAnomalyDetector()

class TelemetryPayload(BaseModel):
    voltage: float
    current: float
    temperature: float

class OccupancyRequest(BaseModel):
    start_hour: int = 12

@app.post("/predict/occupancy")
def predict_occupancy(req: OccupancyRequest):
    """
    Returns 6-hour occupancy forecast percentages using simulated XGBoost tree
    """
    forecast = xg_model.predict_occupancy_curve(req.start_hour)
    return {
        "model": "XGBoost Availability Model v1.2",
        "start_hour": req.start_hour,
        "forecast": forecast
    }

@app.post("/predict/anomaly")
def predict_anomaly(req: TelemetryPayload):
    """
    Returns outlier diagnostic score using simulated Isolation Forest
    """
    diagnostics = if_detector.evaluate_telemetry(req.voltage, req.current, req.temperature)
    return {
        "model": "Isolation Forest Outlier Model v1.0",
        "inputs": {
            "voltage": req.voltage,
            "current": req.current,
            "temperature": req.temperature
        },
        "diagnostics": diagnostics
    }

if __name__ == "__main__":
    import uvicorn
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    
    uvicorn.run(app, host=host, port=port)
