export type StageInput = { 
  projectDescription: string; 
  prior?: Record<string, any> 
};

export const prompt = (input: StageInput): string => {
  const components = input.prior?.components ? `\n\nChosen components:\n${JSON.stringify(input.prior.components, null, 2)}` : '';
  
  return `You are a hardware wiring assistant. Use the chosen components from previous analysis and generate a full wiring plan.

=== PROJECT DESCRIPTION ===
${input.projectDescription}${components}

=== TASKS ===
1. Create a complete pin mapping table with columns:
   - Component Name
   - Pin Label
   - Connected MCU Pin
   - Voltage Level
   - Notes (e.g., pull-up resistors, bus termination, alternate functions)

2. Explicitly document:
   - Power rails (all supply voltages used, expected current per rail).
   - Grounding scheme (single-point vs. star vs. chassis ground).
   - Decoupling capacitor placement guidelines.
   - Required safety components (e.g., fuses, reverse polarity protection).

3. Describe wiring layout:
   - Distinguish between signal wiring (I²C, SPI, UART, PWM, GPIO) and power wiring.
   - Show how to avoid ground loops, excessive current through thin wires, or signal integrity issues.

4. Handle Edge Cases:
   - If pin assignments conflict (e.g., SPI bus with multiple devices), resolve and explain arbitration method.
   - If voltage mismatches exist (e.g., 5V MCU and 3.3V sensor), insert logic level shifters.
   - If power demand exceeds USB/adapter supply, specify regulators or external PSU.

=== OUTPUT FORMAT ===
Provide comprehensive wiring documentation with:
- Pin Mapping Table (Markdown)
- Power distribution narrative
- Signal routing description
- Safety considerations

Then include a JSON mapping at the end:

\`\`\`json
{
  "connections": [
    {
      "component": "BME280",
      "component_type": "sensor",
      "connections": [
        {"pin": "VDD", "mcu_pin": "3V3", "voltage": "3.3V", "notes": "Connect to 3.3V rail"},
        {"pin": "GND", "mcu_pin": "GND", "voltage": "0V", "notes": "Common ground"},
        {"pin": "SDA", "mcu_pin": "GPIO21", "voltage": "3.3V", "notes": "I2C data, 4.7k pull-up"},
        {"pin": "SCL", "mcu_pin": "GPIO22", "voltage": "3.3V", "notes": "I2C clock, 4.7k pull-up"}
      ]
    }
  ],
  "power_rails": [
    {"voltage": "3.3V", "current_ma": 500, "source": "LDO regulator"},
    {"voltage": "5V", "current_ma": 2000, "source": "USB or external"}
  ],
  "level_shifters": [
    {"from": "5V", "to": "3.3V", "signals": ["UART_TX", "UART_RX"], "part": "TXS0108E"}
  ],
  "safety_components": [
    {"type": "fuse", "rating": "2A", "location": "main power input"},
    {"type": "TVS diode", "part": "SMBJ5.0A", "location": "power input"}
  ],
  "decoupling": [
    {"component": "MCU", "capacitors": ["100nF ceramic", "10uF tantalum"]},
    {"component": "sensors", "capacitors": ["100nF ceramic"]}
  ]
}
\`\`\``;
};