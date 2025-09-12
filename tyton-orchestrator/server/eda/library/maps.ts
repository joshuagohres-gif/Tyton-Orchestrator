// Enhanced version of the existing library maps with broader coverage
// Re-exports and extends the existing library system

export * from "@/server/services/eda/libraryMaps";
export * from "@/server/services/eda/libraryLookup";

import { LibraryRule } from "@/server/services/eda/libraryMaps";

// Additional rules for broader EDA coverage
export const EXTENDED_MCU_RULES: LibraryRule[] = [
  {
    id: "mcu-esp8266-12e",
    matches: { mpnRegex: /ESP8266[-_]?12[EF]/i, roleIncludes: ["MCU"] },
    symbol: "RF_Module:ESP-12E",
    footprint: "RF_Module:ESP-12E",
    confidence: 0.95,
    notes: "ESP8266 module with WiFi capability"
  },
  {
    id: "mcu-esp32-s2-mini",
    matches: { mpnRegex: /ESP32[-_]?S2[-_]?MINI/i, roleIncludes: ["MCU"] },
    symbol: "RF_Module:ESP32-S2-MINI-1",
    footprint: "RF_Module:ESP32-S2-MINI-1",
    confidence: 0.93
  },
  {
    id: "mcu-arduino-nano",
    matches: { valueRegex: /Arduino.?Nano/i, roleIncludes: ["MCU", "Module"] },
    symbol: "Module:Arduino_Nano",
    footprint: "Module:Arduino_Nano",
    confidence: 0.85,
    notes: "Arduino Nano module - verify exact variant"
  },
  {
    id: "mcu-teensy-40",
    matches: { valueRegex: /Teensy.?4/i, roleIncludes: ["MCU"] },
    symbol: "Module:Teensy-4.0",
    footprint: "Module:Teensy-4.0",
    confidence: 0.8
  },
  {
    id: "mcu-stm32f407-lqfp100",
    matches: { mpnRegex: /STM32F407[VZ][GE]/i, roleIncludes: ["MCU"] },
    symbol: "MCU_ST_STM32F4:STM32F407VGTx",
    footprint: "Package_QFP:LQFP-100_14x14mm_P0.5mm",
    confidence: 0.9
  }
];

export const EXTENDED_SENSOR_RULES: LibraryRule[] = [
  {
    id: "sensor-dht22",
    matches: { mpnRegex: /DHT22|AM2302/i, roleIncludes: ["Sensor"] },
    symbol: "Sensor_Humidity:DHT22",
    footprint: "Sensor_Humidity:DHT22",
    confidence: 0.85
  },
  {
    id: "sensor-ds18b20",
    matches: { mpnRegex: /DS18B20/i, roleIncludes: ["Sensor"] },
    symbol: "Sensor_Temperature:DS18B20",
    footprint: "Package_TO_SOT_THT:TO-92_Inline",
    confidence: 0.9
  },
  {
    id: "sensor-mpu9250",
    matches: { mpnRegex: /MPU[-_]?9250/i, roleIncludes: ["Sensor"] },
    symbol: "Sensor_Motion:MPU-9250",
    footprint: "Package_DFN_QFN:QFN-24-1EP_3x3mm_P0.4mm_EP1.75x1.75mm",
    confidence: 0.8
  },
  {
    id: "sensor-hc-sr04",
    matches: { valueRegex: /HC[-_]?SR04/i, roleIncludes: ["Sensor"] },
    symbol: "Sensor_Distance:HC-SR04",
    footprint: "Sensor_Distance:HC-SR04",
    confidence: 0.85
  },
  {
    id: "sensor-bno055",
    matches: { mpnRegex: /BNO055/i, roleIncludes: ["Sensor"] },
    symbol: "Sensor_Motion:BNO055",
    footprint: "Package_LGA:LGA-28_5.2x3.8mm_P0.5mm",
    confidence: 0.8
  }
];

export const EXTENDED_DISPLAY_RULES: LibraryRule[] = [
  {
    id: "display-ssd1306",
    matches: { mpnRegex: /SSD1306/i, roleIncludes: ["Display"] },
    symbol: "Display_Controller:SSD1306",
    footprint: "Package_SO:SOIC-28W_7.5x17.9mm_P1.27mm",
    confidence: 0.85
  },
  {
    id: "display-lcd-16x2",
    matches: { valueRegex: /LCD.?16.?2|1602/i, roleIncludes: ["Display"] },
    symbol: "Display_Character:WC1602A",
    footprint: "Display:WC1602A",
    confidence: 0.8
  },
  {
    id: "display-oled-128x64",
    matches: { valueRegex: /OLED.?128.?64/i, roleIncludes: ["Display"] },
    symbol: "Display:OLED-128x64_I2C",
    footprint: "Display:OLED-128x64_I2C",
    confidence: 0.8
  }
];

export const EXTENDED_POWER_RULES: LibraryRule[] = [
  {
    id: "power-lm2596",
    matches: { valueRegex: /LM2596/i, roleIncludes: ["Regulator"] },
    symbol: "Regulator_Switching:LM2596T-5",
    footprint: "Package_TO_SOT_SMD:TO-263-5_TabPin3",
    confidence: 0.9
  },
  {
    id: "power-xl6009",
    matches: { valueRegex: /XL6009/i, roleIncludes: ["Regulator"] },
    symbol: "Regulator_Switching:XL6009",
    footprint: "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
    confidence: 0.85
  },
  {
    id: "power-tp4056",
    matches: { valueRegex: /TP4056/i, roleIncludes: ["Charger"] },
    symbol: "Battery_Management:TP4056",
    footprint: "Package_SO:SOIC-8-1EP_3.9x4.9mm_P1.27mm_EP2.29x3mm",
    confidence: 0.9
  }
];

export const EXTENDED_INTERFACE_RULES: LibraryRule[] = [
  {
    id: "interface-cp2102",
    matches: { mpnRegex: /CP2102/i, roleIncludes: ["Interface"] },
    symbol: "Interface_USB:CP2102",
    footprint: "Package_DFN_QFN:QFN-28-1EP_5x5mm_P0.5mm_EP3.35x3.35mm",
    confidence: 0.9
  },
  {
    id: "interface-ch340",
    matches: { mpnRegex: /CH340[GC]/i, roleIncludes: ["Interface"] },
    symbol: "Interface_USB:CH340G",
    footprint: "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm",
    confidence: 0.9
  },
  {
    id: "interface-max485",
    matches: { mpnRegex: /MAX485/i, roleIncludes: ["Interface"] },
    symbol: "Interface:MAX485",
    footprint: "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
    confidence: 0.9
  }
];

export const EXTENDED_MEMORY_RULES: LibraryRule[] = [
  {
    id: "memory-at24c32",
    matches: { mpnRegex: /AT24C(32|64|128)/i, roleIncludes: ["Memory"] },
    symbol: "Memory_EEPROM:24LC32",
    footprint: "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
    confidence: 0.85
  },
  {
    id: "memory-w25q32",
    matches: { mpnRegex: /W25Q(32|64|128)/i, roleIncludes: ["Memory"] },
    symbol: "Memory_Flash:W25Q32JV",
    footprint: "Package_SO:SOIC-8_5.23x5.23mm_P1.27mm",
    confidence: 0.85
  }
];

// Aggregate all extended rules
export const ALL_EXTENDED_RULES: LibraryRule[] = [
  ...EXTENDED_MCU_RULES,
  ...EXTENDED_SENSOR_RULES,
  ...EXTENDED_DISPLAY_RULES,
  ...EXTENDED_POWER_RULES,
  ...EXTENDED_INTERFACE_RULES,
  ...EXTENDED_MEMORY_RULES
];

/**
 * Quick-pick footprint suggestions for TBD components
 */
export const QUICK_PICK_FOOTPRINTS = {
  resistor: [
    "Resistor_SMD:R_0603_1608Metric",
    "Resistor_SMD:R_0805_2012Metric", 
    "Resistor_SMD:R_1206_3216Metric",
    "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal"
  ],
  capacitor: [
    "Capacitor_SMD:C_0603_1608Metric",
    "Capacitor_SMD:C_0805_2012Metric",
    "Capacitor_SMD:C_1206_3216Metric",
    "Capacitor_THT:C_Disc_D3.0mm_W1.6mm_P2.50mm"
  ],
  connector: [
    "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical",
    "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical",
    "Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical",
    "Connector_JST:JST_PH_B4B-PH-K_1x04_P2.00mm_Vertical",
    "Connector_JST:JST_XH_B4B-XH-A_1x04_P2.50mm_Vertical"
  ],
  led: [
    "LED_SMD:LED_0603_1608Metric",
    "LED_SMD:LED_0805_2012Metric",
    "LED_THT:LED_D3.0mm"
  ],
  ic: [
    "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
    "Package_SO:SOIC-14_3.9x8.7mm_P1.27mm",
    "Package_DFN_QFN:QFN-16-1EP_3x3mm_P0.5mm_EP1.75x1.75mm",
    "Package_QFP:TQFP-32_7x7mm_P0.8mm"
  ]
};

/**
 * Get quick-pick suggestions based on component role
 */
export function getQuickPickFootprints(role: string): string[] {
  const roleKey = role.toLowerCase();
  
  if (roleKey.includes('resistor')) return QUICK_PICK_FOOTPRINTS.resistor;
  if (roleKey.includes('capacitor')) return QUICK_PICK_FOOTPRINTS.capacitor;
  if (roleKey.includes('connector')) return QUICK_PICK_FOOTPRINTS.connector;
  if (roleKey.includes('led')) return QUICK_PICK_FOOTPRINTS.led;
  if (roleKey.includes('ic') || roleKey.includes('mcu')) return QUICK_PICK_FOOTPRINTS.ic;
  
  return [];
}

/**
 * Check if KiCad library exists in user environment
 */
export function validateLibraryExists(libraryRef: string): boolean {
  // This would integrate with actual KiCad library detection
  // For now, assume standard KiCad libraries exist
  const standardLibraries = [
    "Device", "Connector", "Connector_Generic", "MCU_",
    "RF_Module", "Package_", "Resistor_", "Capacitor_",
    "LED_", "Display", "Sensor_", "Interface", "Memory_"
  ];
  
  return standardLibraries.some(lib => libraryRef.startsWith(lib));
}

/**
 * Suggest alternative footprints if primary not available
 */
export function getAlternativeFootprints(primary: string): string[] {
  const alternatives: string[] = [];
  
  // Extract package type and suggest similar
  if (primary.includes("0603")) {
    alternatives.push(
      primary.replace("0603", "0805"),
      primary.replace("0603", "1206")
    );
  } else if (primary.includes("SOIC-8")) {
    alternatives.push(
      primary.replace("SOIC-8", "SOIC-14"),
      primary.replace("SOIC-8", "DIP-8")
    );
  } else if (primary.includes("QFN")) {
    alternatives.push(
      primary.replace("QFN", "TQFP"),
      primary.replace("_3x3mm", "_5x5mm")
    );
  }
  
  return alternatives.filter(alt => alt !== primary);
}