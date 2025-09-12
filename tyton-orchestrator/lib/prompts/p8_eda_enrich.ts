export function renderEdaEnrichPrompt(projectMeta: any, unresolvedComponents: Array<{
  ref: string;
  mpn?: string;
  value?: string;
  role?: string;
  hints: string[];
}>): string {
  return `You are an expert EDA engineer. You will help resolve unresolved electronic components by assigning appropriate KiCad symbols and footprints.

## Input Data

### Project Context:
\`\`\`json
${JSON.stringify(projectMeta, null, 2)}
\`\`\`

### Unresolved Components:
\`\`\`json
${JSON.stringify(unresolvedComponents, null, 2)}
\`\`\`

## KiCad Symbol/Footprint Assignment Rules

### Standard KiCad Libraries Only:
- **Symbols**: Device:, Connector_Generic:, Power_Protection:, MCU_Module:, Interface:, Memory:
- **Footprints**: Resistor_SMD:, Capacitor_SMD:, Package_SO:, Package_QFP:, Connector_PinHeader_2.54mm:

### Common Component Patterns:
1. **Resistors**: symbol "Device:R_Small", footprint "Resistor_SMD:R_0603_1608Metric" or "R_0805_2012Metric"
2. **Capacitors**: symbol "Device:C_Small", footprint "Capacitor_SMD:C_0603_1608Metric" or "C_0805_2012Metric"
3. **Connectors**: symbol "Connector_Generic:Conn_01xNN", footprint "Connector_PinHeader_2.54mm:PinHeader_1xNN_P2.54mm_Vertical"
4. **MCUs**: ESP32 → "RF_Module:ESP32-WROOM-32", STM32 → "Package_QFP:LQFP-*"
5. **LEDs**: symbol "Device:LED", footprint "LED_SMD:LED_0603_1608Metric"
6. **Crystals**: symbol "Device:Crystal", footprint "Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm"
7. **Regulators**: symbol "Regulator_Linear:AMS1117-3.3", footprint "Package_TO_SOT_SMD:SOT-223-3_TabPin2"

### Confidence Guidelines:
- **High confidence (0.9-1.0)**: Exact MPN match or clear component type with standard package
- **Medium confidence (0.7-0.9)**: Component type clear but package/value uncertain
- **Low confidence (0.5-0.7)**: Best guess based on limited information
- **Use "TBD"**: When completely uncertain about assignment

## Output Requirements

Return ONLY a valid JSON object in this exact format:

\`\`\`json
{
  "patches": [
    {
      "ref": "R1",
      "symbol": "Device:R_Small",
      "footprint": "Resistor_SMD:R_0603_1608Metric",
      "confidence": 0.95,
      "notes": "Standard resistor assignment based on value range"
    }
  ]
}
\`\`\`

### Rules:
- Include ALL unresolved components in patches array
- Use "TBD" for symbol or footprint if uncertain
- Confidence must be 0.0-1.0 decimal
- Notes should explain reasoning briefly
- NO explanatory text, markdown, or comments outside JSON
- Focus on practical, manufacturable designs using standard KiCad libraries`;
}