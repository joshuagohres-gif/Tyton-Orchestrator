export type StageInput = { 
  projectDescription: string; 
  prior?: Record<string, any> 
};

export const prompt = (input: StageInput): string => {
  const priorContext = input.prior ? `\n\nPrevious design context:\n${JSON.stringify(input.prior, null, 2)}` : '';
  
  return `You are a mechanical design assistant. Identify all custom-fabricated components required for the hardware project.

=== PROJECT DESCRIPTION ===
${input.projectDescription}${priorContext}

=== TASKS ===
1. For each custom part (brackets, mounts, housings, shafts, spacers):
   - Provide dimensions (length, width, thickness, hole diameters, tolerances).
   - Specify materials and finishes (PLA/ABS, aluminum 6061, stainless steel, etc.).
   - Define fit class where applicable (e.g., RC5 running fit for shafts/bearings).
   - Suggest fastening method (threaded fasteners, press fit, adhesives).
   - Flag whether hobby-level 3D printing/CNC is adequate or precision machining is required.

2. Provide ASCII or Markdown sketches for simple geometries.

3. Include safety notes for moving parts (guarding, clearance zones).

4. Handle Edge Cases:
   - If dimensions depend on components not yet finalized, mark them as "TO BE DETERMINED."
   - If part must withstand loads beyond standard materials, recommend design validation via FEA.

=== OUTPUT FORMAT ===
Provide detailed mechanical specifications with:
- Parts list with dimensions & materials
- Assembly instructions
- Safety considerations
- Manufacturing recommendations

Then include a JSON structure:

\`\`\`json
{
  "custom_parts": [
    {
      "part": "Main mounting bracket",
      "dimensions": {
        "length_mm": 100,
        "width_mm": 60,
        "thickness_mm": 3,
        "holes": [
          {"diameter_mm": 4, "count": 4, "pattern": "rectangular", "spacing_mm": 80}
        ]
      },
      "material": "Aluminum 6061-T6",
      "finish": "Clear anodized",
      "manufacturing": "CNC milling or laser cutting",
      "tolerances": "±0.1mm",
      "fit": "clearance",
      "fastening": "M4 socket head cap screws",
      "notes": "Requires deburring of edges"
    },
    {
      "part": "Electronics enclosure",
      "dimensions": {
        "length_mm": 150,
        "width_mm": 100,
        "height_mm": 50,
        "wall_thickness_mm": 2.5
      },
      "material": "ABS or PETG",
      "finish": "Matte black",
      "manufacturing": "3D printing (FDM)",
      "tolerances": "±0.5mm",
      "fit": "snap-fit with flexible tabs",
      "fastening": "Snap-fit or M3 screws",
      "notes": "Include ventilation slots for cooling"
    }
  ],
  "assembly_sequence": [
    "Mount PCB to standoffs in enclosure base",
    "Route cables through strain reliefs",
    "Attach enclosure lid with snap-fits",
    "Mount complete assembly to bracket"
  ],
  "safety_notes": [
    "All edges must be deburred or rounded (R≥0.5mm)",
    "Moving parts require minimum 5mm clearance",
    "Enclosure must meet IP54 if used outdoors"
  ],
  "required_tools": ["3D printer or CNC", "Drill press", "Deburring tool", "Thread taps"],
  "total_custom_parts": 2,
  "estimated_fabrication_cost": "$50-100"
}
\`\`\``;
};