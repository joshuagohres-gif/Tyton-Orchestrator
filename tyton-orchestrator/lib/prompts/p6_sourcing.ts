export type StageInput = { 
  projectDescription: string; 
  prior?: Record<string, any> 
};

export const prompt = (input: StageInput): string => {
  const bomData = input.prior?.bom ? `\n\nBill of Materials:\n${JSON.stringify(input.prior.bom, null, 2)}` : '';
  
  return `You are a sourcing assistant. Based on the generated BOM, provide detailed sourcing information.

=== PROJECT DESCRIPTION ===
${input.projectDescription}${bomData}

=== TASKS ===
1. For each part:
   - Supplier(s): Digi-Key, Mouser, SparkFun, Adafruit, Amazon, McMaster-Carr, AliExpress, etc.
   - Availability: In stock, lead time estimate, or discontinued.
   - Datasheet link (manufacturer URL).
   - Purchase link (if reliable).
   - Alternate part options if primary is not readily available.

2. For mechanical components:
   - Suggest standard sources (e.g., McMaster for fasteners, 3D Hubs/Shapeways for prints, local machine shops).
   - Provide approximate costs for small quantities vs bulk.

3. Handle edge cases:
   - If specialty or restricted (e.g., lasers, medical devices), mark as "RESTRICTED – professional purchase only."
   - If region-specific sourcing applies, suggest general equivalents.

=== OUTPUT FORMAT ===
Provide comprehensive sourcing information with:
- Supplier recommendations for each component
- Availability status
- Direct purchase links where available
- Alternative sourcing options

Then include JSON structure:

\`\`\`json
{
  "sourcing": [
    {
      "part_no": "ESP32-WROOM-32",
      "description": "WiFi/BLE MCU module",
      "suppliers": [
        {
          "name": "Digi-Key",
          "sku": "1965-ESP32-WROOM-32E(M113EH3200PH3Q0)CT-ND",
          "url": "https://www.digikey.com/en/products/detail/espressif-systems/ESP32-WROOM-32E/11613129",
          "availability": "In Stock (5000+)",
          "price": 3.20,
          "moq": 1,
          "lead_time": "Immediate"
        },
        {
          "name": "Mouser",
          "sku": "356-ESP32WROOM32E16MB",
          "url": "https://www.mouser.com/ProductDetail/Espressif-Systems/ESP32-WROOM-32E",
          "availability": "In Stock (2000+)",
          "price": 3.50,
          "moq": 1,
          "lead_time": "Immediate"
        },
        {
          "name": "AliExpress",
          "sku": "Generic",
          "url": "Search: ESP32 WROOM 32",
          "availability": "In Stock",
          "price": 2.50,
          "moq": 1,
          "lead_time": "2-4 weeks"
        }
      ],
      "datasheet": "https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf",
      "alternates": [
        {"part": "ESP32-S3-WROOM-1", "reason": "Newer generation, more features"},
        {"part": "ESP8266", "reason": "Lower cost, fewer features"}
      ]
    },
    {
      "part_no": "BME280",
      "description": "Environmental sensor",
      "suppliers": [
        {
          "name": "Adafruit",
          "sku": "2652",
          "url": "https://www.adafruit.com/product/2652",
          "availability": "In Stock",
          "price": 19.95,
          "moq": 1,
          "lead_time": "Immediate"
        },
        {
          "name": "SparkFun",
          "sku": "SEN-13676",
          "url": "https://www.sparkfun.com/products/13676",
          "availability": "In Stock",
          "price": 19.95,
          "moq": 1,
          "lead_time": "Immediate"
        }
      ],
      "datasheet": "https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf",
      "alternates": [
        {"part": "BME680", "reason": "Includes gas sensor"},
        {"part": "DHT22", "reason": "Lower cost, temp/humidity only"}
      ]
    },
    {
      "part_no": "CUSTOM-PCB",
      "description": "Custom PCB fabrication",
      "suppliers": [
        {
          "name": "JLCPCB",
          "sku": "Custom",
          "url": "https://jlcpcb.com",
          "availability": "5-7 days fabrication",
          "price": 5.00,
          "moq": 5,
          "lead_time": "1-2 weeks with shipping"
        },
        {
          "name": "PCBWay",
          "sku": "Custom",
          "url": "https://www.pcbway.com",
          "availability": "24-hour quick turn available",
          "price": 25.00,
          "moq": 5,
          "lead_time": "3-5 days express"
        },
        {
          "name": "OSH Park",
          "sku": "Custom",
          "url": "https://oshpark.com",
          "availability": "12 day fabrication",
          "price": 5.00,
          "moq": 3,
          "lead_time": "2 weeks"
        }
      ],
      "datasheet": "N/A - Custom design",
      "alternates": [
        {"part": "Breadboard", "reason": "Prototyping only"},
        {"part": "Perfboard", "reason": "Semi-permanent prototype"}
      ]
    }
  ],
  "mechanical_sourcing": [
    {
      "category": "Fasteners",
      "supplier": "McMaster-Carr",
      "url": "https://www.mcmaster.com",
      "notes": "Best for USA, excellent selection"
    },
    {
      "category": "3D Printing",
      "supplier": "Shapeways / Printables",
      "url": "https://www.shapeways.com",
      "notes": "Professional quality, various materials"
    }
  ],
  "regional_notes": {
    "USA": "Digi-Key, Mouser, and Adafruit offer fast shipping",
    "Europe": "Consider Farnell, RS Components for faster delivery",
    "Asia": "Local suppliers like LCSC may offer better prices"
  },
  "restricted_items": [],
  "total_estimated_lead_time": "1-2 weeks for all components",
  "bulk_discount_available": true,
  "minimum_order_total": 91.95
}
\`\`\``;
};