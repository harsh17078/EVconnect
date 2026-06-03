# EVConnect AI ML Predictive Engine
# Simulates live predictions of charger availability (XGBoost) and telemetry failures (Isolation Forest)

import numpy as np

class XGBoostAvailabilityModel:
    """
    Simulates a regression XGBoost tree predicting station congestion (0-100% occupancy)
    Inputs: Hour of day, Day of week, Temperature (Weather), Holiday flag
    """
    def __init__(self):
        # Mocking the trained model weights
        self.base_score = 0.45

    def predict_occupancy_curve(self, start_hour=10):
        """
        Generates 6-hour dynamic congestion prediction array
        """
        predictions = []
        for i in range(6):
            hour = (start_hour + i) % 24
            
            # Simple diurnal cycle logic (Peak commute = higher load, Night = lower load)
            hour_factor = np.sin((hour - 6) / 24 * 2 * np.pi) * 0.35 + 0.5
            
            # Add small random noise
            noise = np.random.normal(0, 0.05)
            
            # Bound and scale
            pct = int(min(max((hour_factor + noise) * 100, 0), 100))
            predictions.append(pct)
            
        return predictions


class IsolationForestAnomalyDetector:
    """
    Simulates an Isolation Forest model detecting electrical / structural faults.
    Takes inputs: [Voltage (V), Current (A), Operating Temp (C)]
    Outliers (Anomaly score < -0.15) indicate hardware failure likelihood.
    """
    def __init__(self):
        # Center of healthy distribution
        self.healthy_voltage = 415.0
        self.healthy_temp = 30.0

    def evaluate_telemetry(self, voltage, current, temp):
        """
        Returns anomaly decision and probability of failure
        """
        # Calculate deviation from nominal values
        volt_dev = abs(voltage - self.healthy_voltage)
        temp_dev = max(0, temp - self.healthy_temp)
        
        # Isolation anomaly metric score
        anomaly_score = 0.5 - (volt_dev / 100.0) - (temp_dev / 40.0)
        
        # Calculate failure probability based on anomaly score
        if anomaly_score < 0.1:
            failure_probability = min(int(80 + (0.1 - anomaly_score) * 100), 99)
            status = "Error" if failure_probability > 90 else "Warning"
            recommended_action = "Preventive Maintenance Recommended (Thermal/Voltage Anomaly)"
        else:
            failure_probability = max(int(5 + (0.5 - anomaly_score) * 15), 1)
            status = "Healthy"
            recommended_action = "None"
            
        return {
            "status": status,
            "anomaly_score": round(float(anomaly_score), 3),
            "failure_probability": failure_probability,
            "action_recommended": recommended_action
        }
