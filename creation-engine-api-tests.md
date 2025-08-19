# Creation Engine API Testing Guide

## Prerequisites

Before running these tests, make sure:
1. The Tyton API server is running on `http://localhost:3000`
2. You have a valid JWT token for authentication
3. You have registered a user account

## Authentication

First, get a JWT token by logging in:

```bash
# Register a new user (if needed)
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123", "name": "Test User"}'

# Login to get JWT token
TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}' \
  | jq -r '.token')

echo "Token: $TOKEN"
```

## 1. Create Project

Create a new Creation Engine project:

```bash
curl -X POST http://localhost:3000/api/ce/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "summary": "A temperature and humidity monitoring system with wireless data transmission",
    "constraints": {
      "voltage": "3.3V",
      "power": "<1W",
      "size": "compact"
    }
  }'
```

Expected Response:
```json
{
  "success": true,
  "data": {
    "id": "proj_abc123",
    "title": "Temperature Monitoring System",
    "summary": "A temperature and humidity monitoring system...",
    "constraints": {
      "voltage": "3.3V",
      "power": "<1W",
      "size": "compact"
    },
    "status": "created",
    "createdAt": "2025-08-19T12:00:00.000Z"
  },
  "message": "Project created successfully"
}
```

## 2. Start Pipeline Execution

Queue pipeline execution for the project:

```bash
PROJECT_ID="proj_abc123"  # Use ID from previous response

curl -X POST http://localhost:3000/api/ce/projects/$PROJECT_ID/run \
  -H "Authorization: Bearer $TOKEN"
```

Expected Response:
```json
{
  "success": true,
  "data": {
    "id": "run_xyz789",
    "projectId": "proj_abc123",
    "status": "queued",
    "stages": [
      "parseSpec",
      "decompose", 
      "sourceParts",
      "compatCheck",
      "firmware",
      "wiring",
      "cad",
      "simulate",
      "docs",
      "collate"
    ],
    "currentStage": "parseSpec",
    "queuedAt": "2025-08-19T12:01:00.000Z"
  },
  "message": "Pipeline execution queued"
}
```

## 3. Get Project Details

Retrieve project information and artifacts:

```bash
curl -X GET http://localhost:3000/api/ce/projects/$PROJECT_ID \
  -H "Authorization: Bearer $TOKEN"
```

Expected Response:
```json
{
  "success": true,
  "data": {
    "id": "proj_abc123",
    "title": "Temperature Monitoring System",
    "summary": "A temperature and humidity monitoring system...",
    "status": "completed",
    "artifacts": [
      {
        "id": "art_wiring_001",
        "type": "wiring_svg", 
        "url": "/artifacts/wiring_diagram.svg",
        "meta": {
          "components": 5,
          "nets": 8,
          "complexity": "moderate"
        }
      },
      {
        "id": "art_firmware_001",
        "type": "firmware_zip",
        "url": "/artifacts/firmware.zip",
        "meta": {
          "platform": "esp32",
          "files": 5,
          "size": "2.4KB"
        }
      }
    ],
    "lastRun": "run_xyz789",
    "createdAt": "2025-08-19T12:00:00.000Z",
    "completedAt": "2025-08-19T12:05:30.000Z"
  },
  "message": "Project retrieved successfully"
}
```

## 4. Get Bill of Materials (BOM)

Retrieve the component list and pricing:

```bash
curl -X GET http://localhost:3000/api/ce/projects/$PROJECT_ID/bom \
  -H "Authorization: Bearer $TOKEN"
```

Expected Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "bom_item_001",
      "component": {
        "id": "comp_esp32_dev",
        "title": "ESP32 Development Board",
        "sku": "ESP32-DEVKIT-V1",
        "specs": {
          "type": "mcu",
          "voltage": 3.3,
          "freq": 240,
          "gpio": 30,
          "wifi": true
        },
        "price": 8.50,
        "source": "Adafruit"
      },
      "quantity": 1,
      "purpose": "Main microcontroller for sensor reading and WiFi communication",
      "subsystem": "Control",
      "missing": false
    },
    {
      "id": "bom_item_002", 
      "component": {
        "id": "comp_bme280",
        "title": "BME280 Temperature/Humidity/Pressure Sensor",
        "sku": "BME280",
        "specs": {
          "type": "sensor",
          "interface": "i2c",
          "voltage": 3.3,
          "accuracy": "±1°C"
        },
        "price": 12.95,
        "source": "Adafruit"
      },
      "quantity": 1,
      "purpose": "Environmental sensor for temperature and humidity measurement",
      "subsystem": "Sensors",
      "missing": false
    }
  ],
  "totalCost": 21.45,
  "message": "BOM retrieved successfully"
}
```

## 5. Export Project Files

Export the complete project as a downloadable package:

```bash
# Export as ZIP file
curl -X POST http://localhost:3000/api/ce/export/$PROJECT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "format": "zip"
  }'

# Export for 3D printing
curl -X POST http://localhost:3000/api/ce/export/$PROJECT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "format": "3dprint"
  }'

# Export for PCB fabrication
curl -X POST http://localhost:3000/api/ce/export/$PROJECT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "format": "pcb"
  }'

# Export documentation only
curl -X POST http://localhost:3000/api/ce/export/$PROJECT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "format": "docs"
  }'
```

Expected Response:
```json
{
  "success": true,
  "data": {
    "exportId": "export_def456",
    "format": "zip",
    "filename": "temperature_monitoring_project.zip",
    "downloadUrl": "/exports/temperature_monitoring_project.zip",
    "size": "1.2MB",
    "includes": [
      "Bill of Materials (BOM)",
      "Wiring Diagrams (SVG/PDF)",
      "Firmware Source Code",
      "3D Enclosure Files (STL)",
      "Circuit Simulation Results", 
      "Assembly Instructions",
      "Technical Documentation"
    ],
    "createdAt": "2025-08-19T12:06:00.000Z"
  },
  "message": "Export created successfully"
}
```

## 6. Partner Integration - 3D Printing Service

Send project to 3D printing service:

```bash
curl -X POST http://localhost:3000/api/partners/print \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "projectId": "'$PROJECT_ID'",
    "files": ["enclosure.stl"],
    "material": "PLA",
    "options": {
      "infill": "20%",
      "layerHeight": "0.2mm",
      "supports": true
    }
  }'
```

Expected Response:
```json
{
  "success": true,
  "data": {
    "orderId": "print_order_789",
    "partner": "Craftcloud (by All3DP)",
    "estimatedCost": "$12.50",
    "estimatedTime": "3-5 business days",
    "trackingUrl": "https://craftcloud.3dhubs.com/order/print_order_789",
    "files": ["enclosure.stl"],
    "material": "PLA",
    "status": "submitted"
  },
  "message": "3D printing order submitted successfully"
}
```

## 7. Partner Integration - PCB Fabrication

Send project to PCB fabrication service:

```bash
curl -X POST http://localhost:3000/api/partners/pcb \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "projectId": "'$PROJECT_ID'",
    "quantity": 5,
    "options": {
      "layers": 2,
      "thickness": "1.6mm",
      "color": "green",
      "finish": "HASL"
    }
  }'
```

Expected Response:
```json
{
  "success": true,
  "data": {
    "orderId": "pcb_order_456",
    "partner": "JLCPCB",
    "estimatedCost": "$8.00",
    "estimatedTime": "5-7 business days",
    "trackingUrl": "https://jlcpcb.com/order/pcb_order_456",
    "quantity": 5,
    "specifications": {
      "layers": 2,
      "thickness": "1.6mm",
      "color": "green",
      "finish": "HASL"
    },
    "status": "quote_pending"
  },
  "message": "PCB fabrication quote requested"
}
```

## 8. Test Error Cases

### Invalid project creation
```bash
curl -X POST http://localhost:3000/api/ce/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "summary": "bomb making tutorial"
  }'
```

Expected Response (400):
```json
{
  "success": false,
  "error": "Safety validation failed: Project contains potentially hazardous keywords",
  "code": "SAFETY_VIOLATION"
}
```

### Unauthorized access
```bash
curl -X GET http://localhost:3000/api/ce/projects/$PROJECT_ID
# (without Authorization header)
```

Expected Response (401):
```json
{
  "success": false,
  "error": "Authentication required",
  "code": "UNAUTHORIZED"
}
```

### Project not found
```bash
curl -X GET http://localhost:3000/api/ce/projects/invalid_project_id \
  -H "Authorization: Bearer $TOKEN"
```

Expected Response (404):
```json
{
  "success": false,
  "error": "Project not found",
  "code": "PROJECT_NOT_FOUND"
}
```

## 9. Complete Workflow Test Script

Here's a complete bash script to test the entire workflow:

```bash
#!/bin/bash

# Creation Engine API Test Script
set -e

BASE_URL="http://localhost:3000"
EMAIL="test@example.com"
PASSWORD="password123"

echo "🚀 Testing Creation Engine API..."

# 1. Login and get token
echo "📝 Logging in..."
TOKEN=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}" \
  | jq -r '.token')

if [ "$TOKEN" == "null" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Login successful"

# 2. Create project
echo "📦 Creating project..."
PROJECT_RESPONSE=$(curl -s -X POST $BASE_URL/api/ce/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "summary": "IoT weather station with temperature and humidity sensors",
    "constraints": {
      "voltage": "3.3V",
      "power": "<1W", 
      "size": "compact"
    }
  }')

PROJECT_ID=$(echo $PROJECT_RESPONSE | jq -r '.data.id')

if [ "$PROJECT_ID" == "null" ]; then
  echo "❌ Project creation failed"
  echo $PROJECT_RESPONSE | jq '.'
  exit 1
fi

echo "✅ Project created: $PROJECT_ID"

# 3. Start pipeline
echo "⚡ Starting pipeline..."
RUN_RESPONSE=$(curl -s -X POST $BASE_URL/api/ce/projects/$PROJECT_ID/run \
  -H "Authorization: Bearer $TOKEN")

RUN_ID=$(echo $RUN_RESPONSE | jq -r '.data.id')
echo "✅ Pipeline started: $RUN_ID"

# 4. Wait a moment then check project status
sleep 2
echo "📊 Checking project status..."
curl -s -X GET $BASE_URL/api/ce/projects/$PROJECT_ID \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# 5. Get BOM
echo "📋 Getting BOM..."
curl -s -X GET $BASE_URL/api/ce/projects/$PROJECT_ID/bom \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# 6. Export project
echo "📤 Exporting project..."
curl -s -X POST $BASE_URL/api/ce/export/$PROJECT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"format": "zip"}' | jq '.'

echo "🎉 All tests completed successfully!"
```

Save this script as `test_creation_engine.sh` and run with:
```bash
chmod +x test_creation_engine.sh
./test_creation_engine.sh
```

## Notes

- Replace `localhost:3000` with your actual server URL
- Update the email/password with valid credentials
- Some endpoints may take time to complete pipeline processing
- File downloads may require additional handling depending on server configuration
- Partner integration endpoints are currently stubs and return mock responses