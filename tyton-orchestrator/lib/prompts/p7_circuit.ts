// /lib/prompts/p7_circuit.ts
export type CircuitPromptInput = {
  projectContext: string;                  // free text
  selectedComponentsJson?: any;            // from Prompt 1
  pinMapJson?: any;                        // from Prompt 2
  powerConstraints?: any;                  // optional
  safetyComplianceNotes?: any;             // optional
};

export function renderCircuitPrompt(input: CircuitPromptInput): string {
  const {
    projectContext,
    selectedComponentsJson,
    pinMapJson,
    powerConstraints,
    safetyComplianceNotes,
  } = input;

  return `SYSTEM ROLE
You are an electrical design assistant generating a detailed circuit diagram specification suitable for EDA import and programmatic rendering. Your output must be a single, valid JSON object that adheres to the 'schematicSpec v1.2' schema. Do not include any other text, markdown, or explanations outside of the JSON object.

INPUTS
1) Project Context (free text):
${projectContext || "TBD"}

2) Selected Components JSON (from Component Selection stage):
${selectedComponentsJson ? JSON.stringify(selectedComponentsJson, null, 2) : "TBD"}

3) Pin Map JSON (from Wiring & Pin Mapping stage, if available):
${pinMapJson ? JSON.stringify(pinMapJson, null, 2) : "N/A"}

4) Power Requirements & Constraints (if available):
${powerConstraints ? JSON.stringify(powerConstraints, null, 2) : "N/A"}

5) Environmental / Safety / Compliance Notes (if available):
${safetyComplianceNotes ? JSON.stringify(safetyComplianceNotes, null, 2) : "N/A"}

OBJECTIVE
Produce a complete, accurate circuit diagram specification for the project, including all nets, pin-to-net connections, power distribution, decoupling, protection, bus topology, and labeled connectors—sufficient for an engineer to recreate the schematic in KiCad/Altium or for an automated renderer to draw the diagram with minimal manual edits.

GENERAL RULES
- Do not hallucinate manufacturer pin names. If a device's pins aren't in inputs, mark as "TBD" with a one-line reason (e.g., "datasheet not provided").
- Always include power/ground pins explicitly (avoid implicit power symbols on ICs).
- Insert industry-standard support components where best practice dictates (e.g., 0.1 µF per VCC pin, bulk caps on rails, flyback diodes for inductive loads, pull-ups for I²C, series resistors/ESD for USB, CC resistors for USB-C, sense resistors for motor drivers).
- Resolve voltage mismatches with level shifters or alternative pin selections; document the choice.
- If multiple devices share a bus, assign unique addresses/CS lines and show them.
- Identify and flag ERC issues: floating inputs, multiple drivers on a net, power flag needs, net class violations.
- Prefer standard reference designators (U#, R#, C#, L#, D#, Q#, J#, TP#, F#).
- Maintain stable identifiers: map each module/component to a stable "componentId" if given in inputs.

OUTPUTS (exactly the following sections)

SECTION A — Human Summary (Markdown)
- One-paragraph overview of the circuit.
- Power tree narrative: sources, regulators, rail voltages and estimated current.
- Bus summary (I²C/SPI/UART/CAN/etc.) with who's on which bus.
- Notable protections (fuse, TVS, reverse polarity, ESD, flyback).

SECTION B — Pin-Level Mapping Table (Markdown)
A table covering every component and every connected pin:
| RefDes | MPN/Value | Pin Number/Name | Net Name | Direction (IN/OUT/IO/PWR) | Voltage Level | Notes |
Include also a short table of unconnected or TBD pins with rationale.

SECTION C — Machine-Readable Schematic Spec (JSON "schematicSpec v1.2")
Return a single JSON object following this schema EXACTLY:
{
  "version": "1.2",
  "project": {
    "name": "string",
    "description": "string",
    "revision": "string",
    "author": "string",
    "date": "YYYY-MM-DD"
  },
  "netClasses": {
    "power": {
      "minWidth": 0.2,
      "maxVia": 0.6,
      "clearance": 0.2
    },
    "signal": {
      "minWidth": 0.1,
      "maxVia": 0.3,
      "clearance": 0.1
    },
    "differential": {
      "minWidth": 0.1,
      "diffPair": 0.2,
      "clearance": 0.2
    }
  },
  "powerTree": {
    "rails": [
      {
        "name": "VIN",
        "voltage": 12.0,
        "current": 2.0,
        "regulation": "unregulated",
        "source": "J1.1"
      },
      {
        "name": "3V3",
        "voltage": 3.3,
        "current": 0.5,
        "regulation": "LDO",
        "source": "U_REG1.OUT"
      }
    ]
  },
  "components": [
    {
      "refDes": "U1",
      "mpn": "ESP32-WROOM-32",
      "package": "MODULE",
      "value": "",
      "description": "WiFi+BT MCU module",
      "pins": {
        "1": { "name": "GND", "type": "power_in" },
        "2": { "name": "3V3", "type": "power_in" },
        "15": { "name": "GPIO2", "type": "io" },
        "16": { "name": "GPIO4", "type": "io" }
      }
    }
  ],
  "nets": [
    {
      "name": "GND",
      "class": "power",
      "members": ["U1.1", "C1.2", "J1.2"],
      "props": {
        "voltage": 0,
        "tolerance": 0
      }
    },
    {
      "name": "I2C_SDA",
      "class": "signal",
      "members": ["U1.15", "U2.4", "R1.2"],
      "props": {
        "pullup": "4K7",
        "voltage": 3.3
      }
    }
  ],
  "buses": [
    {
      "name": "I2C1",
      "type": "I2C",
      "nets": ["I2C_SDA", "I2C_SCL"],
      "devices": [
        {
          "refDes": "U1",
          "role": "master",
          "address": "N/A"
        },
        {
          "refDes": "U2",
          "role": "slave",
          "address": "0x68"
        }
      ]
    }
  ],
  "protections": [
    {
      "type": "fuse",
      "refDes": "F1",
      "rating": "3A",
      "rationale": "Input overcurrent protection"
    },
    {
      "type": "tvs",
      "refDes": "D1",
      "rating": "15V",
      "rationale": "Input overvoltage protection"
    }
  ],
  "decoupling": [
    {
      "refDes": "C1",
      "value": "100nF",
      "voltage": "16V",
      "type": "ceramic",
      "placement": "near U1 VCC pin",
      "rationale": "High-frequency decoupling"
    }
  ],
  "connectors": [
    {
      "refDes": "J1",
      "type": "screw_terminal",
      "pins": 2,
      "description": "Power input",
      "pinout": {
        "1": "+12V",
        "2": "GND"
      }
    }
  ],
  "testPoints": [
    {
      "refDes": "TP1",
      "net": "3V3",
      "description": "3.3V rail test point"
    }
  ],
  "mechanical": [
    {
      "type": "mounting_hole",
      "refDes": "H1",
      "size": "M3",
      "location": "corner"
    }
  ],
  "layoutHints": {
    "keepouts": [],
    "criticalNets": ["3V3", "GND"],
    "placement": {
      "U1": "center",
      "power": "left_edge",
      "connectors": "edge"
    }
  },
  "erc": [
    {
      "type": "warning",
      "issue": "floating_input",
      "details": "U1.EN not connected - add pullup",
      "severity": "medium"
    }
  ],
  "assumptions": [
    "12V input assumed regulated and clean",
    "Operating temperature 0-70°C",
    "Standard PCB stackup (1.6mm, 2-layer)"
  ],
  "openQuestions": [
    "Verify I2C address conflicts",
    "Confirm connector pinout with mechanical team"
  ]
}

SECTION D — Addressing & Bus Resolution
- If any shared bus devices clash (I²C addresses or missing CS lines), propose explicit strap pins, resistor values, or pin reassignments. Update JSON nets accordingly.

SECTION E — Power Integrity & Protection Rationale
- Brief bullets justifying decoupling values, bulk caps, fuses, TVS rating, reverse polarity/ideal diode choices. Include estimated rail currents and headroom.

SECTION F — Rendering Hints
Provide minimal but sufficient hints for an automatic renderer:
- Grouping: { "MCU":["U1","C5","C6"], "Power":["J1","U_REG1","U_REG2","F1","D1"], "I2C":["U1","U3","R10","R11"] }
- Edge labels for buses (SDA/SCL, MOSI/MISO/SCK/CSx).
- Net label short names where long: e.g., "I2C1_SDA" → "SDA1".

VALIDATION CHECKLIST (must pass or be flagged in ERC)
- Every listed component has at least power and ground defined unless N/A.
- Every net has ≥2 members (except test points).
- No undeclared pins referenced in nets.
- Pull-ups present for every open-drain bus.
- Flyback or integrated diode for each inductive load.
- USB-C includes CC resistors and ESD; UART has level matching; CAN has 120 Ω termination as needed.
- Battery or high-energy input has fuse and reverse-polarity protection.

END OF SPEC`;
}