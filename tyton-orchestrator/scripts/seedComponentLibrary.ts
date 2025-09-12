#!/usr/bin/env tsx
// /scripts/seedComponentLibrary.ts
// Script to populate the component library with common electronic components
import { PrismaClient } from "@prisma/client";
import { batchUpsertComponents } from "@/server/services/eda/libraryService";
import pino from "pino";

const logger = pino().child({ service: 'seedComponentLibrary' });

// Common electronic components with exact MPN mappings
const SEED_COMPONENTS = [
  // ESP32 Modules
  {
    mpn: "ESP32-WROOM-32",
    category: "Microcontroller",
    value: "ESP32-WROOM-32",
    symbol: "RF_Module:ESP32-WROOM-32",
    footprint: "RF_Module:ESP32-WROOM-32",
    meta: { pins: 38, description: "Wi-Fi + Bluetooth MCU module" }
  },
  {
    mpn: "ESP32-WROOM-32D",
    category: "Microcontroller", 
    value: "ESP32-WROOM-32D",
    symbol: "RF_Module:ESP32-WROOM-32",
    footprint: "RF_Module:ESP32-WROOM-32",
    meta: { pins: 38, description: "Wi-Fi + Bluetooth MCU module (PCB antenna)" }
  },
  {
    mpn: "ESP32-C3-WROOM-02",
    category: "Microcontroller",
    value: "ESP32-C3-WROOM-02", 
    symbol: "RF_Module:ESP32-C3-WROOM-02",
    footprint: "RF_Module:ESP32-C3-WROOM-02",
    meta: { pins: 18, description: "Wi-Fi + Bluetooth LE RISC-V MCU" }
  },

  // Voltage Regulators
  {
    mpn: "AMS1117-3.3",
    category: "Regulator",
    value: "3.3V 1A LDO",
    symbol: "Regulator_Linear:AMS1117-3.3",
    footprint: "Package_TO_SOT_SMD:SOT-223-3_TabPin2",
    meta: { voltage_out: 3.3, current_max: 1.0, description: "Low dropout regulator" }
  },
  {
    mpn: "AP2112K-3.3TRG1",
    category: "Regulator",
    value: "3.3V 600mA LDO",
    symbol: "Regulator_Linear:AP2112K-3.3",
    footprint: "Package_TO_SOT_SMD:SOT-23-5",
    meta: { voltage_out: 3.3, current_max: 0.6, description: "Ultra-low quiescent current LDO" }
  },
  {
    mpn: "MCP1700-3302E/TO",
    category: "Regulator",
    value: "3.3V 250mA LDO",
    symbol: "Regulator_Linear:MCP1700-3302E_TO92",
    footprint: "Package_TO_SOT_THT:TO-92_Inline",
    meta: { voltage_out: 3.3, current_max: 0.25, description: "Low quiescent current LDO" }
  },

  // USB-C Connectors
  {
    mpn: "TYPE-C-31-M-12",
    category: "Connector",
    value: "USB-C Receptacle",
    symbol: "Connector:USB_C_Receptacle_USB2.0_16P_TopMnt_Horizontal",
    footprint: "Connector_USB:USB_C_Receptacle_JAE_DX07S016JA1R1500",
    meta: { pins: 16, description: "USB-C 2.0 receptacle" }
  },
  {
    mpn: "USB4085-GF-A",
    category: "Connector",
    value: "USB-C Receptacle",
    symbol: "Connector:USB_C_Receptacle_USB2.0_16P_TopMnt_Horizontal", 
    footprint: "Connector_USB:USB_C_Receptacle_GCT_USB4085",
    meta: { pins: 16, description: "USB-C 2.0 receptacle with castellated holes" }
  },

  // Sensors
  {
    mpn: "BME280",
    category: "Sensor",
    value: "Temperature, Humidity, Pressure",
    symbol: "Sensor_Temperature:BME280",
    footprint: "Package_LGA:Bosch_LGA-8_2.5x2.5mm_P0.65mm_ClockwisePinNumbering",
    meta: { interface: "I2C/SPI", description: "Environmental sensor" }
  },
  {
    mpn: "MPU6050",
    category: "Sensor", 
    value: "6-axis IMU",
    symbol: "Sensor_Motion:MPU-6050",
    footprint: "Sensor_Motion:InvenSense_QFN-24_4x4mm_P0.5mm",
    meta: { interface: "I2C", description: "3-axis gyroscope + 3-axis accelerometer" }
  },
  {
    mpn: "DS18B20",
    category: "Sensor",
    value: "Digital Temperature",
    symbol: "Sensor_Temperature:DS18B20",
    footprint: "Package_TO_SOT_THT:TO-92_Inline",
    meta: { interface: "1-Wire", description: "Digital temperature sensor" }
  },

  // Crystals and Oscillators
  {
    mpn: "ABM3B-16.000MHZ-B2-T",
    category: "Crystal",
    value: "16MHz",
    symbol: "Device:Crystal_GND24_Small",
    footprint: "Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm",
    meta: { frequency: 16000000, load_capacitance: "12pF", description: "16MHz crystal oscillator" }
  },
  {
    mpn: "ECS-.327-6-13X-TR",
    category: "Crystal",
    value: "32.768kHz",
    symbol: "Device:Crystal_Small",
    footprint: "Crystal:Crystal_SMD_3215-2Pin_3.2x1.5mm",
    meta: { frequency: 32768, description: "32.768kHz watch crystal" }
  },

  // Common Passives (High-precision parts)
  {
    mpn: "RC0603FR-071KL",
    category: "Resistor",
    value: "1k 1% 1/10W",
    symbol: "Device:R_Small",
    footprint: "Resistor_SMD:R_0603_1608Metric",
    meta: { resistance: 1000, tolerance: "1%", power: 0.1, description: "1k ohm precision resistor" }
  },
  {
    mpn: "RC0603FR-0710KL", 
    category: "Resistor",
    value: "10k 1% 1/10W",
    symbol: "Device:R_Small",
    footprint: "Resistor_SMD:R_0603_1608Metric",
    meta: { resistance: 10000, tolerance: "1%", power: 0.1, description: "10k ohm precision resistor" }
  },
  {
    mpn: "CC0603KRX7R9BB104",
    category: "Capacitor",
    value: "100nF 50V X7R",
    symbol: "Device:C_Small",
    footprint: "Capacitor_SMD:C_0603_1608Metric",
    meta: { capacitance: 0.0000001, voltage: 50, dielectric: "X7R", description: "100nF ceramic capacitor" }
  },
  {
    mpn: "CC0603KRX7R9BB223",
    category: "Capacitor",
    value: "22nF 50V X7R",
    symbol: "Device:C_Small", 
    footprint: "Capacitor_SMD:C_0603_1608Metric",
    meta: { capacitance: 0.000000022, voltage: 50, dielectric: "X7R", description: "22nF ceramic capacitor" }
  },
  {
    mpn: "UWX1H100MCL1GB",
    category: "Capacitor",
    value: "10uF 50V",
    symbol: "Device:CP_Small",
    footprint: "Capacitor_SMD:CP_Elec_5x5.4",
    meta: { capacitance: 0.00001, voltage: 50, description: "10uF electrolytic capacitor" }
  },

  // LEDs
  {
    mpn: "150060RS75000",
    category: "LED",
    value: "Red LED",
    symbol: "Device:LED",
    footprint: "LED_SMD:LED_0603_1608Metric",
    meta: { color: "red", forward_voltage: 2.0, description: "Red LED 0603" }
  },
  {
    mpn: "150060GS75000", 
    category: "LED",
    value: "Green LED",
    symbol: "Device:LED",
    footprint: "LED_SMD:LED_0603_1608Metric", 
    meta: { color: "green", forward_voltage: 3.2, description: "Green LED 0603" }
  },
  {
    mpn: "150060BS75000",
    category: "LED",
    value: "Blue LED", 
    symbol: "Device:LED",
    footprint: "LED_SMD:LED_0603_1608Metric",
    meta: { color: "blue", forward_voltage: 3.2, description: "Blue LED 0603" }
  },

  // Diodes
  {
    mpn: "1N4148WS",
    category: "Diode",
    value: "Switching Diode",
    symbol: "Device:D_Small",
    footprint: "Diode_SMD:D_SOD-323",
    meta: { type: "switching", forward_voltage: 0.7, description: "Fast switching diode" }
  },
  {
    mpn: "SS14",
    category: "Diode", 
    value: "Schottky 1A 40V",
    symbol: "Device:D_Schottky",
    footprint: "Diode_SMD:D_SMA",
    meta: { type: "schottky", current_max: 1.0, voltage_reverse: 40, description: "Schottky barrier rectifier" }
  },

  // Transistors
  {
    mpn: "2N7002K",
    category: "Transistor",
    value: "N-MOSFET 60V 300mA",
    symbol: "Transistor_FET:2N7002K",
    footprint: "Package_TO_SOT_SMD:SOT-23",
    meta: { type: "NMOS", voltage_max: 60, current_max: 0.3, description: "N-channel MOSFET" }
  },
  {
    mpn: "BC817",
    category: "Transistor",
    value: "NPN 45V 800mA",
    symbol: "Transistor_BJT:BC817",
    footprint: "Package_TO_SOT_SMD:SOT-23",
    meta: { type: "NPN", voltage_max: 45, current_max: 0.8, description: "General purpose NPN transistor" }
  },

  // Common Connectors
  {
    mpn: "B2B-XH-A(LF)(SN)",
    category: "Connector",
    value: "XH 2-pin connector",
    symbol: "Connector_Generic:Conn_01x02",
    footprint: "Connector_JST:JST_XH_B2B-XH-A_1x02_P2.50mm_Vertical",
    meta: { pins: 2, pitch: 2.5, description: "JST XH 2-pin connector" }
  },
  {
    mpn: "B4B-XH-A(LF)(SN)",
    category: "Connector",
    value: "XH 4-pin connector", 
    symbol: "Connector_Generic:Conn_01x04",
    footprint: "Connector_JST:JST_XH_B4B-XH-A_1x04_P2.50mm_Vertical",
    meta: { pins: 4, pitch: 2.5, description: "JST XH 4-pin connector" }
  },

  // ICs - Common op-amps and logic
  {
    mpn: "LM358DR",
    category: "Amplifier",
    value: "Dual Op-Amp",
    symbol: "Amplifier_Operational:LM358",
    footprint: "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
    meta: { channels: 2, supply_voltage: "3V-32V", description: "Dual operational amplifier" }
  },
  {
    mpn: "74HC595D",
    category: "Logic",
    value: "8-bit Shift Register", 
    symbol: "Logic_74xx:74HC595",
    footprint: "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm",
    meta: { bits: 8, type: "shift_register", description: "8-bit serial-in, serial/parallel-out shift register" }
  }
];

async function seedComponentLibrary() {
  const prisma = new PrismaClient();
  
  try {
    logger.info({ componentCount: SEED_COMPONENTS.length }, 'Starting component library seeding');
    
    // Clear existing seed data (optional - remove if you want to preserve existing)
    const deleteCount = await prisma.componentLibrary.deleteMany({
      where: {
        mpn: {
          in: SEED_COMPONENTS.map(c => c.mpn)
        }
      }
    });
    
    logger.info({ deletedCount: deleteCount.count }, 'Cleared existing seed components');
    
    // Batch insert new components
    const upsertedCount = await batchUpsertComponents(SEED_COMPONENTS);
    
    logger.info({ 
      totalSeedComponents: SEED_COMPONENTS.length,
      upsertedCount,
      successRate: (upsertedCount / SEED_COMPONENTS.length * 100).toFixed(1) + '%'
    }, 'Component library seeding completed');
    
    // Verify seeding with stats
    const stats = await prisma.componentLibrary.aggregate({
      _count: { _all: true },
      where: {
        mpn: {
          in: SEED_COMPONENTS.map(c => c.mpn)
        }
      }
    });
    
    logger.info({ verifiedCount: stats._count._all }, 'Verified seeded components in database');
    
    // Category breakdown
    const categoryStats = await prisma.componentLibrary.groupBy({
      by: ['category'],
      _count: { category: true },
      where: {
        mpn: {
          in: SEED_COMPONENTS.map(c => c.mpn)
        }
      }
    });
    
    console.log('\n📊 Component Library Seeding Summary:');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Total seeded: ${upsertedCount}/${SEED_COMPONENTS.length} components`);
    console.log(`Success rate: ${(upsertedCount / SEED_COMPONENTS.length * 100).toFixed(1)}%`);
    console.log('\nCategory breakdown:');
    
    categoryStats.forEach(stat => {
      const emoji = getCategoryEmoji(stat.category || 'Unknown');
      console.log(`  ${emoji} ${stat.category}: ${stat._count.category} components`);
    });
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Component library seeding completed successfully!`);
    
    return upsertedCount;
    
  } catch (error) {
    logger.error({ error: error.message }, 'Component library seeding failed');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

function getCategoryEmoji(category: string): string {
  const emojiMap: Record<string, string> = {
    'Microcontroller': '🧠',
    'Regulator': '⚡',
    'Connector': '🔌',
    'Sensor': '🌡️',
    'Crystal': '💎',
    'Resistor': '🎛️',
    'Capacitor': '🔋',
    'LED': '💡',
    'Diode': '🔺',
    'Transistor': '🔀',
    'Amplifier': '📢',
    'Logic': '🧮'
  };
  
  return emojiMap[category] || '📦';
}

// Run if called directly
if (require.main === module) {
  seedComponentLibrary()
    .then((count) => {
      console.log(`\n🎉 Successfully seeded ${count} components!`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}

export { seedComponentLibrary, SEED_COMPONENTS };