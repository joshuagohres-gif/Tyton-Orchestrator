export type StageInput = { 
  projectDescription: string; 
  prior?: Record<string, any> 
};

export const prompt = (input: StageInput): string => {
  const priorContext = input.prior ? `\n\nPrevious analysis context:\n${JSON.stringify(input.prior, null, 2)}` : '';
  
  return `You are a hardware design assistant. Your role is to recommend components for a hardware project based on its reviewed description.

=== PROJECT DESCRIPTION ===
${input.projectDescription}${priorContext}

=== TASKS ===
1. For each subsystem (microcontroller/SoC, sensors, actuators, drivers, power supply, wires/cables, fasteners, bearings, PCBs, housings/enclosures), propose exactly 3 viable options.
   - Include part number, vendor/manufacturer, short description, voltage/current or load rating (as applicable), approximate unit cost, and common availability (in-stock, specialty only, discontinued).
   - At least one option should prioritize **cost-effectiveness**, one should prioritize **robustness/industrial grade**, and one should prioritize **ease of integration** (breadboard/educational use).
   - If the subsystem is not applicable, explicitly state "N/A – not required for this project."

2. For each option, list:
   - Advantages
   - Limitations
   - Hidden dependencies (e.g., needs special drivers, rare connectors, or specific CAD files)

3. Summarize trade-offs:
   - Cost vs. performance
   - Ease of sourcing vs. long-term availability
   - Integration effort vs. learning opportunity

4. Edge Cases to Handle:
   - If the project requires unusual specs (e.g., very high current, cryogenic, medical), state "NO OFF-THE-SHELF OPTION; custom engineering likely required."
   - If part availability is uncertain, list at least one generic substitute family.

=== OUTPUT FORMAT ===
Provide a comprehensive analysis with:
- Human-readable Markdown tables for each subsystem
- Clear component recommendations with specifications
- Trade-off analysis

Then include a JSON object at the end with the following structure:

\`\`\`json
{
  "microcontroller": [
    {
      "option": "budget",
      "part_no": "ESP32-WROOM-32",
      "manufacturer": "Espressif",
      "description": "WiFi/BLE MCU",
      "specs": "3.3V, 240MHz dual-core",
      "unit_cost": 3.50,
      "availability": "in-stock",
      "pros": ["Low cost", "WiFi/BLE built-in"],
      "cons": ["3.3V logic only"],
      "dependencies": ["USB-to-serial adapter"]
    },
    {
      "option": "robust",
      "part_no": "STM32F407VGT6",
      "manufacturer": "STMicroelectronics",
      "description": "Industrial ARM Cortex-M4",
      "specs": "3.3V, 168MHz",
      "unit_cost": 15.00,
      "availability": "in-stock",
      "pros": ["Industrial grade", "Many peripherals"],
      "cons": ["Complex setup"],
      "dependencies": ["ST-Link programmer"]
    },
    {
      "option": "easy",
      "part_no": "Arduino Uno R3",
      "manufacturer": "Arduino",
      "description": "Educational MCU board",
      "specs": "5V, 16MHz ATmega328P",
      "unit_cost": 25.00,
      "availability": "in-stock",
      "pros": ["Beginner-friendly", "5V tolerant"],
      "cons": ["Limited memory", "No wireless"],
      "dependencies": []
    }
  ],
  "sensors": [...],
  "actuators": [...],
  "drivers": [...],
  "power_supply": [...],
  "wires_cables": [...],
  "fasteners": [...],
  "bearings": [...],
  "pcbs": [...],
  "housings": [...],
  "trade_offs": {
    "cost_vs_performance": "...",
    "sourcing_vs_availability": "...",
    "integration_vs_learning": "..."
  }
}
\`\`\``;
};