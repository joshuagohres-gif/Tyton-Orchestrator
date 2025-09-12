export type StageInput = { 
  projectDescription: string; 
  prior?: Record<string, any> 
};

export const prompt = (input: StageInput): string => {
  const priorContext = input.prior ? `\n\nPrevious design selections:\n${JSON.stringify(input.prior, null, 2)}` : '';
  
  return `You are a BOM generator assistant. Using the outputs of component selection, wiring, and mechanical design, create a complete bill of materials.

=== PROJECT DESCRIPTION ===
${input.projectDescription}${priorContext}

=== TASKS ===
1. Create a BOM table with:
   - Category
   - Part Number
   - Description
   - Quantity
   - Unit Cost
   - Extended Cost
   - Notes (dependencies, alternates, comments)

2. Calculate totals:
   - Subtotal (all extended costs)
   - Add contingency (10–20%)
   - Provide total project estimate.

3. Handle edge cases:
   - If component has multiple options, list all with cost ranges.
   - If custom part, mark Part Number as "CUSTOM" and Unit Cost as estimate (e.g., $20 CNC, $3 3D print).
   - If unknown, write "TBD" clearly.

=== OUTPUT FORMAT ===
Provide a comprehensive BOM with:
- Detailed component listing
- Cost breakdown by category
- Total project cost with contingency

Then include JSON BOM structure:

\`\`\`json
{
  "items": [
    {
      "category": "Microcontroller",
      "part_no": "ESP32-WROOM-32",
      "description": "WiFi/BLE MCU module",
      "quantity": 1,
      "unit_cost": 3.50,
      "extended_cost": 3.50,
      "notes": "Main processor",
      "alternates": ["ESP32-S3-WROOM-1"]
    },
    {
      "category": "Sensors",
      "part_no": "BME280",
      "description": "Temperature/Humidity/Pressure sensor",
      "quantity": 1,
      "unit_cost": 8.95,
      "extended_cost": 8.95,
      "notes": "I2C interface",
      "alternates": ["BME680", "DHT22"]
    },
    {
      "category": "Power",
      "part_no": "LM2596S",
      "description": "Step-down voltage regulator module",
      "quantity": 1,
      "unit_cost": 2.50,
      "extended_cost": 2.50,
      "notes": "5V to 3.3V conversion",
      "alternates": ["MP1584EN"]
    },
    {
      "category": "Connectors",
      "part_no": "Various",
      "description": "Headers, terminals, USB connector",
      "quantity": 1,
      "unit_cost": 5.00,
      "extended_cost": 5.00,
      "notes": "Assorted connectors",
      "alternates": []
    },
    {
      "category": "Mechanical",
      "part_no": "CUSTOM-001",
      "description": "3D printed enclosure",
      "quantity": 1,
      "unit_cost": 15.00,
      "extended_cost": 15.00,
      "notes": "Custom design, PETG material",
      "alternates": ["Off-shelf project box"]
    },
    {
      "category": "Passive Components",
      "part_no": "KIT-PASSIVE",
      "description": "Resistors, capacitors, LEDs",
      "quantity": 1,
      "unit_cost": 10.00,
      "extended_cost": 10.00,
      "notes": "Common values kit",
      "alternates": []
    },
    {
      "category": "PCB",
      "part_no": "CUSTOM-PCB",
      "description": "Custom PCB (2-layer, 100x80mm)",
      "quantity": 1,
      "unit_cost": 25.00,
      "extended_cost": 25.00,
      "notes": "JLCPCB or PCBWay",
      "alternates": ["Breadboard + perfboard"]
    }
  ],
  "cost_breakdown": {
    "electronics": 29.95,
    "mechanical": 15.00,
    "pcb": 25.00,
    "misc": 10.00
  },
  "subtotal": 79.95,
  "contingency_percent": 15,
  "contingency_amount": 12.00,
  "total": 91.95,
  "currency": "USD",
  "notes": [
    "Prices based on single quantity purchases",
    "Bulk ordering can reduce costs by 20-30%",
    "Does not include shipping or taxes"
  ]
}
\`\`\``;
};