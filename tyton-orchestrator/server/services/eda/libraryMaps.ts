// /server/services/eda/libraryMaps.ts
// Starter symbol/footprint maps for common parts.
// Focus: KiCad official libs (v7/8). If a library symbol/footprint does not exist in the user's install,
// we leave it as "TBD" at lookup-time (see libraryLookup.ts).

export type LibraryRule = {
  id: string;                       // unique rule id
  matches: {
    mpnRegex?: RegExp;              // match on manufacturer part number
    valueRegex?: RegExp;            // match on "value" string (e.g., R, C, LED, AMS1117-3.3)
    refPrefix?: RegExp;             // match on refdes group (U, R, C, J, D, Q, Y, L, etc.)
    roleIncludes?: string[];        // if eda component role contains any of these tokens (e.g., "MCU","Connector","Protection")
    pinsGte?: number;               // helper for guessing packages (headers)
    pitchMm?: number;               // for connectors/headers (2.54, 2.00, 2.50, etc.)
  };
  symbol: string | "GENERIC" | "TBD";
  footprint: string | "TBD" | ((inp: { pins?: number; pitchMm?: number }) => string | "TBD");
  confidence: number;               // 0..1
  notes?: string;
};

// Helper generator for pin headers
const pinHeaderFootprint = (pins: number, pitch = 2.54, rows = 1) =>
  rows === 1
    ? `Connector_PinHeader_${pitch.toFixed(2)}mm:PinHeader_1x${pins}_P${pitch.toFixed(2)}mm_Vertical`
    : `Connector_PinHeader_${pitch.toFixed(2)}mm:PinHeader_2x${Math.ceil(pins/2)}_P${pitch.toFixed(2)}mm_Vertical`;

// Helper generator for JST PH / XH vertical
const jstPH = (pins: number) => `Connector_JST:JST_PH_B${pins}B-PH-K_1x${pins}_P2.00mm_Vertical`;
const jstXH = (pins: number) => `Connector_JST:JST_XH_B${pins}B-XH-A_1x${pins}_P2.50mm_Vertical`;

// --- MCU / Modules ---
export const MCU_RULES: LibraryRule[] = [
  {
    id: "mcu-esp32-wroom-32",
    matches: { mpnRegex: /ESP32-?WROOM-?32/i, roleIncludes: ["MCU"] },
    symbol: "RF_Module:ESP32-WROOM-32",                 // KiCad official
    footprint: "RF_Module:ESP32-WROOM-32",
    confidence: 0.98,
    notes: "ESP32 module footprint with keep-out; antenna edge placement recommended."
  },
  {
    id: "mcu-esp32-s3-wroom-1",
    matches: { mpnRegex: /ESP32-?S3-?WROOM-?1/i, roleIncludes: ["MCU"] },
    symbol: "RF_Module:ESP32-S3-WROOM-1",
    footprint: "RF_Module:ESP32-S3-WROOM-1",
    confidence: 0.95,
    notes: "Ensure library includes S3 module; if missing, leave as TBD."
  },
  {
    id: "mcu-esp32-c3-mini-1",
    matches: { mpnRegex: /ESP32-?C3-?MINI-?1/i, roleIncludes: ["MCU"] },
    symbol: "RF_Module:ESP32-C3-MINI-1",
    footprint: "RF_Module:ESP32-C3-MINI-1",
    confidence: 0.95
  },
  {
    id: "mcu-rp2040-ic",
    matches: { mpnRegex: /RP2040/i, roleIncludes: ["MCU"] },
    symbol: "MCU_RaspberryPi_and_Broadcom:RP2040",
    footprint: "Package_DFN_QFN:QFN-56-1EP_7x7mm_P0.4mm_EP5.3x5.3mm",
    confidence: 0.9,
    notes: "Bare IC; not Pico module."
  },
  {
    id: "module-rpi-pico",
    matches: { valueRegex: /pico/i, roleIncludes: ["MCU"] },
    symbol: "MCU_RaspberryPi_and_Broadcom:RPi_Pico",
    footprint: "Module:RPi_Pico_SMD_TH",
    confidence: 0.85,
    notes: "Pico module; verify exact variant (with/without headers)."
  },
  {
    id: "mcu-stm32f103-lqfp48",
    matches: { mpnRegex: /STM32F103C8|STM32F103CB/i, roleIncludes: ["MCU"] },
    symbol: "MCU_ST_STM32F1:STM32F103C8Tx",
    footprint: "Package_QFP:LQFP-48_7x7mm_P0.5mm",
    confidence: 0.9
  },
  {
    id: "mcu-stm32h743-lqfp144",
    matches: { mpnRegex: /STM32H743Z[I|G]/i, roleIncludes: ["MCU"] },
    symbol: "MCU_ST_STM32H7:STM32H743ZITx",
    footprint: "Package_QFP:LQFP-144_20x20mm_P0.5mm",
    confidence: 0.85
  },
  {
    id: "mcu-atmega328p-tqfp32",
    matches: { mpnRegex: /ATmega328P/i, roleIncludes: ["MCU"] },
    symbol: "MCU_Microchip_ATmega:ATmega328P-AU",
    footprint: "Package_QFP:TQFP-32_7x7mm_P0.8mm",
    confidence: 0.95
  },
  {
    id: "mcu-atmega32u4-tqfp44",
    matches: { mpnRegex: /ATmega32U4/i, roleIncludes: ["MCU"] },
    symbol: "MCU_Microchip_ATmega:ATmega32U4-AU",
    footprint: "Package_QFP:TQFP-44_10x10mm_P0.8mm",
    confidence: 0.95
  },
  {
    id: "mcu-nrf52832-qfn48",
    matches: { mpnRegex: /nRF52832/i, roleIncludes: ["MCU","RF"] },
    symbol: "MCU_Nordic:nRF52832",
    footprint: "Package_DFN_QFN:QFN-48_6x6mm_P0.5mm",
    confidence: 0.8
  }
];

// --- Regulators / Power ---
export const REGULATOR_RULES: LibraryRule[] = [
  {
    id: "reg-ams1117-33",
    matches: { valueRegex: /AMS1117[-_ ]?3\.3/i, refPrefix: /^U$/ },
    symbol: "Regulator_Linear:AMS1117-3.3",
    footprint: "Package_TO_SOT_SMD:SOT-223-3_TabPin2",
    confidence: 0.95
  },
  {
    id: "reg-ap2112k-33",
    matches: { valueRegex: /AP2112K[-_ ]?3\.3/i, refPrefix: /^U$/ },
    symbol: "Regulator_Linear:AP2112K-3.3",
    footprint: "Package_TO_SOT_SMD:SOT-23-5",
    confidence: 0.9
  },
  {
    id: "buck-mp1584",
    matches: { valueRegex: /MP1584/i, refPrefix: /^U$/ },
    symbol: "Regulator_Switching:MP1584EN",
    footprint: "Package_SO:SOIC-8-1EP_3.9x4.9mm_P1.27mm_EP3x3mm",
    confidence: 0.85,
    notes: "Verify EP pad size per datasheet."
  }
];

// --- Passives ---
export const PASSIVE_RULES: LibraryRule[] = [
  // Resistors
  {
    id: "r-0603",
    matches: { valueRegex: /^R($|[\s0-9kKmM]+)/, refPrefix: /^R$/ },
    symbol: "Device:R_Small",
    footprint: "Resistor_SMD:R_0603_1608Metric",
    confidence: 0.9
  },
  {
    id: "r-0805",
    matches: { valueRegex: /^R.*(power|1W|0\.5W)/i, refPrefix: /^R$/ },
    symbol: "Device:R_Small",
    footprint: "Resistor_SMD:R_0805_2012Metric",
    confidence: 0.75,
    notes: "Use for higher power hints; adjust as needed."
  },
  // Capacitors
  {
    id: "c-0603",
    matches: { valueRegex: /^C($|[\s0-9uUnNpPfF]+)/, refPrefix: /^C$/ },
    symbol: "Device:C_Small",
    footprint: "Capacitor_SMD:C_0603_1608Metric",
    confidence: 0.9
  },
  {
    id: "c-0805-bulk",
    matches: { valueRegex: /10uF|22uF|47uF/i, refPrefix: /^C$/ },
    symbol: "Device:C_Small",
    footprint: "Capacitor_SMD:C_0805_2012Metric",
    confidence: 0.8
  },
  // Inductors (generic SMD)
  {
    id: "l-1008",
    matches: { valueRegex: /^L/i, refPrefix: /^L$/ },
    symbol: "Device:L_Small",
    footprint: "Inductor_SMD:L_1008_2520Metric",
    confidence: 0.7
  }
];

// --- Protection / Diodes / LEDs ---
export const DIODE_LED_RULES: LibraryRule[] = [
  {
    id: "led-0603",
    matches: { refPrefix: /^D$/, valueRegex: /LED/i },
    symbol: "Device:LED",
    footprint: "LED_SMD:LED_0603_1608Metric",
    confidence: 0.9
  },
  {
    id: "tvs-sma",
    matches: { valueRegex: /TVS|SMBJ|SMAJ/i, refPrefix: /^D$/ },
    symbol: "Device:D_TVS",
    footprint: "Diode_SMD:D_SMA",
    confidence: 0.8
  },
  {
    id: "schottky-sod123",
    matches: { valueRegex: /SS14|Schottky/i, refPrefix: /^D$/ },
    symbol: "Device:D_Schottky",
    footprint: "Diode_SMD:D_SOD-123",
    confidence: 0.8
  }
];

// --- Crystals / Oscillators ---
export const TIMING_RULES: LibraryRule[] = [
  {
    id: "xtal-3225",
    matches: { refPrefix: /^Y$/, valueRegex: /(?:8|12|16|24|25)\s?MHz/i },
    symbol: "Device:Crystal_GND24_Small",
    footprint: "Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm",
    confidence: 0.85
  }
];

// --- Connectors / USB / Headers / JST / Barrel / Terminal ---
export const CONNECTOR_RULES: LibraryRule[] = [
  // Pin headers (default 2.54mm)
  {
    id: "hdr-1xN-2.54",
    matches: { refPrefix: /^J$/, valueRegex: /Header|PinHeader|GPIO/i, pinsGte: 2, pitchMm: 2.54 },
    symbol: "Connector_Generic:Conn_01x??", // resolved at runtime
    footprint: ({ pins }) => pinHeaderFootprint(pins || 2, 2.54, 1),
    confidence: 0.85,
    notes: "symbol name resolved in lookup based on pin count."
  },
  // JST-PH
  {
    id: "jst-ph",
    matches: { refPrefix: /^J$/, valueRegex: /JST[-_ ]?PH/i, pinsGte: 2, pitchMm: 2.0 },
    symbol: "Connector_Generic:Conn_01x??",
    footprint: ({ pins }) => jstPH(pins || 2),
    confidence: 0.9
  },
  // JST-XH
  {
    id: "jst-xh",
    matches: { refPrefix: /^J$/, valueRegex: /JST[-_ ]?XH/i, pinsGte: 2, pitchMm: 2.5 },
    symbol: "Connector_Generic:Conn_01x??",
    footprint: ({ pins }) => jstXH(pins || 2),
    confidence: 0.9
  },
  // USB-C receptacle (USB2.0)
  {
    id: "usb-c-receptacle",
    matches: { refPrefix: /^J$/, valueRegex: /USB[-_ ]?C/i },
    symbol: "Connector:USB_C_Receptacle_USB2.0",
    footprint: "Connector_USB:USB_C_Receptacle_USB2.0",
    confidence: 0.8,
    notes: "If library not present, leave TBD; ensure CC resistors in schematic."
  },
  // Micro-USB B
  {
    id: "usb-micro-b",
    matches: { refPrefix: /^J$/, valueRegex: /USB[-_ ]?Micro[-_ ]?B/i },
    symbol: "Connector:USB_B_Micro",
    footprint: "Connector_USB:USB_Micro-B_Molex-105017-0001",
    confidence: 0.85
  },
  // Barrel jack (DC)
  {
    id: "barrel-jack",
    matches: { refPrefix: /^J$/, valueRegex: /Barrel|DC[-_ ]?Jack/i },
    symbol: "Connector:Barrel_Jack",
    footprint: "Connector_BarrelJack:BarrelJack_Horizontal",
    confidence: 0.8
  },
  // Terminal block 5.08mm (2-pin)
  {
    id: "terminal-2p-5.08",
    matches: { refPrefix: /^J$/, valueRegex: /Terminal|TB|Screw/i },
    symbol: "Connector:Conn_01x02_Male",
    footprint: "TerminalBlock:TerminalBlock_Phoenix_MPT-5.08mm_2pol",
    confidence: 0.75,
    notes: "Adjust pitch/model to match supplier."
  }
];

// --- Sensors (common ICs) ---
export const SENSOR_RULES: LibraryRule[] = [
  {
    id: "sensor-bme280",
    matches: { mpnRegex: /BME280/i, roleIncludes: ["Sensor"] },
    symbol: "Sensor_Environmental:BME280",
    footprint: "Package_LGA:Bosch_LGA-8_2.5x2.5mm_P0.65mm",
    confidence: 0.8
  },
  {
    id: "sensor-bmp280",
    matches: { mpnRegex: /BMP280/i, roleIncludes: ["Sensor"] },
    symbol: "Sensor_Pressure:BMP280",
    footprint: "Package_LGA:Bosch_LGA-8_2.5x2.5mm_P0.65mm",
    confidence: 0.8
  },
  {
    id: "sensor-mpu6050",
    matches: { mpnRegex: /MPU-?6050/i, roleIncludes: ["Sensor"] },
    symbol: "Sensor_Motion:MPU-6050",
    footprint: "Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.7x2.7mm",
    confidence: 0.75
  }
];

// Aggregate in priority order
export const ALL_RULES: LibraryRule[] = [
  ...MCU_RULES,
  ...REGULATOR_RULES,
  ...SENSOR_RULES,
  ...DIODE_LED_RULES,
  ...TIMING_RULES,
  ...CONNECTOR_RULES,
  ...PASSIVE_RULES
];