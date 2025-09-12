// /server/llm/prompts.ts
import { z } from 'zod';

export interface ProjectMeta {
  title: string;
  description: string;
  boardSize: { width: number; height: number };
  componentCount: number;
}

export interface UnresolvedComponent {
  ref: string;
  value?: string;
  description?: string;
  pins?: number;
  power_rating?: string;
  voltage_rating?: string;
  current_rating?: string;
  frequency_range?: string;
  package_hint?: string;
  component_type?: string;
}

// EDA Component Enrichment Prompt Builder
export function buildEdaEnrichPrompt(
  projectMeta: ProjectMeta,
  unresolvedComponents: UnresolvedComponent[]
): { system: string; user: string } {
  const system = `You are an expert electronics engineer specializing in component library mapping for PCB design.

Your task is to assign appropriate KiCad symbols and footprints to electronic components based on their specifications.

CRITICAL REQUIREMENTS:
1. Respond with ONLY valid JSON - no markdown, explanations, or additional text
2. Use the exact schema format provided
3. Assign realistic, commonly available KiCad symbols and footprints
4. Consider electrical specifications, package types, and manufacturing constraints
5. Provide confidence scores based on specification clarity
6. Use standard KiCad naming conventions (Library:Component format)

SYMBOL NAMING EXAMPLES:
- Resistors: "Device:R", "Device:R_Small", "Device:R_Variable"
- Capacitors: "Device:C", "Device:C_Polarized", "Device:C_Variable"
- Inductors: "Device:L", "Device:L_Core_Ferrite"
- Diodes: "Diode:D", "Diode:D_Schottky", "Diode:LED"
- Transistors: "Transistor_BJT:Q_NPN_BCE", "Transistor_FET:Q_NMOS_GSD"
- ICs: "Logic_74xx:74LS00", "MCU_ST_STM32F1:STM32F103C8Tx"

FOOTPRINT NAMING EXAMPLES:
- Resistors: "Resistor_SMD:R_0603_1608Metric", "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal"
- Capacitors: "Capacitor_SMD:C_0603_1608Metric", "Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm"
- ICs: "Package_SOIC:SOIC-8_3.9x4.9mm_P1.27mm", "Package_DIP:DIP-8_W7.62mm"
- LEDs: "LED_SMD:LED_0603_1608Metric", "LED_THT:LED_D5.0mm"

When uncertain, prefer commonly used components and conservative ratings.`;

  const user = `PROJECT CONTEXT:
Title: ${projectMeta.title}
Description: ${projectMeta.description}
Board Size: ${projectMeta.boardSize.width}x${projectMeta.boardSize.height}mm
Total Components: ${projectMeta.componentCount}

UNRESOLVED COMPONENTS:
${unresolvedComponents.map(comp => {
  const specs = [
    comp.value && `Value: ${comp.value}`,
    comp.description && `Description: ${comp.description}`,
    comp.pins && `Pins: ${comp.pins}`,
    comp.power_rating && `Power: ${comp.power_rating}`,
    comp.voltage_rating && `Voltage: ${comp.voltage_rating}`,
    comp.current_rating && `Current: ${comp.current_rating}`,
    comp.frequency_range && `Frequency: ${comp.frequency_range}`,
    comp.package_hint && `Package: ${comp.package_hint}`,
    comp.component_type && `Type: ${comp.component_type}`
  ].filter(Boolean).join(', ');
  
  return `${comp.ref}: ${specs || 'No specifications available'}`;
}).join('\n')}

Assign appropriate KiCad symbols and footprints for each component. Consider the project context and component specifications.`;

  return { system, user };
}

// Component Library Suggestion Prompt Builder
export function buildComponentSuggestionPrompt(
  componentType: string,
  specifications: Record<string, any>,
  context?: { application?: string; constraints?: string[] }
): { system: string; user: string } {
  const system = `You are an expert in electronic component selection and KiCad library management.

Your task is to suggest appropriate KiCad symbols and footprints for a specific component type with given specifications.

CRITICAL REQUIREMENTS:
1. Respond with ONLY valid JSON - no markdown, explanations, or additional text
2. Provide multiple alternatives when applicable
3. Consider real-world availability and cost
4. Include confidence scores for each suggestion
5. Provide rationale for component choices
6. Use standard KiCad library naming conventions

Focus on commonly available components from major manufacturers (TI, Analog Devices, ST, Infineon, etc.).`;

  const user = `COMPONENT REQUEST:
Type: ${componentType}
Specifications: ${JSON.stringify(specifications, null, 2)}
${context?.application ? `Application: ${context.application}` : ''}
${context?.constraints?.length ? `Constraints: ${context.constraints.join(', ')}` : ''}

Provide symbol and footprint suggestions with alternatives and confidence ratings.`;

  return { system, user };
}

// Placement Optimization Prompt Builder  
export function buildPlacementOptimizationPrompt(
  boardSize: { width: number; height: number },
  components: Array<{
    ref: string;
    symbol: string;
    footprint: string;
    current_x?: number;
    current_y?: number;
    constraints?: string[];
  }>,
  netlist: Array<{ net: string; pins: string[] }>,
  options?: { 
    optimize_for?: 'signal_integrity' | 'thermal' | 'manufacturing' | 'compact';
    keep_existing?: boolean;
  }
): { system: string; user: string } {
  const system = `You are an expert PCB layout engineer specializing in component placement optimization.

Your task is to generate optimal component placement coordinates and groupings for a PCB design.

CRITICAL REQUIREMENTS:
1. Respond with ONLY valid JSON - no markdown, explanations, or additional text
2. Ensure all placements are within board boundaries
3. Maintain appropriate clearances between components
4. Group related components logically
5. Consider signal flow and routing efficiency
6. Provide placement coordinates in millimeters
7. Include rotation angles (0, 90, 180, 270 degrees)

OPTIMIZATION PRIORITIES:
- Minimize trace lengths for critical signals
- Group analog and digital sections
- Keep power components away from sensitive circuits
- Maintain thermal considerations
- Ensure manufacturing and assembly constraints`;

  const user = `BOARD SPECIFICATIONS:
Dimensions: ${boardSize.width}x${boardSize.height}mm
Component Count: ${components.length}
${options?.optimize_for ? `Optimization Focus: ${options.optimize_for}` : ''}
${options?.keep_existing ? 'Preserve existing placements where possible' : ''}

COMPONENTS:
${components.map(comp => 
  `${comp.ref}: ${comp.symbol} (${comp.footprint})${comp.current_x !== undefined ? ` @ ${comp.current_x},${comp.current_y}mm` : ''}${comp.constraints?.length ? ` [${comp.constraints.join(', ')}]` : ''}`
).join('\n')}

CRITICAL NETS:
${netlist.filter(net => net.pins.length > 2).slice(0, 20).map(net => 
  `${net.net}: ${net.pins.length} pins`
).join('\n')}

Generate optimized placement coordinates and component groupings.`;

  return { system, user };
}

// Routing Constraints Prompt Builder
export function buildRoutingConstraintsPrompt(
  netlist: Array<{ net: string; pins: string[]; type?: string }>,
  boardLayers: number,
  designRequirements?: {
    impedance_controlled?: boolean;
    high_speed?: boolean;
    mixed_signal?: boolean;
    power_sensitive?: boolean;
  }
): { system: string; user: string } {
  const system = `You are an expert PCB routing engineer specializing in design rule optimization and constraint definition.

Your task is to generate appropriate net classes, routing constraints, and design rules for a PCB design.

CRITICAL REQUIREMENTS:
1. Respond with ONLY valid JSON - no markdown, explanations, or additional text
2. Define appropriate track widths for different net types
3. Consider impedance control requirements
4. Set proper clearances for different voltage levels
5. Identify differential pairs and length-matched groups
6. Account for manufacturing capabilities
7. Balance electrical performance with cost

NET CLASSIFICATION GUIDELINES:
- Power nets: Wider tracks, larger vias
- High-speed signals: Controlled impedance, length matching
- Analog signals: Isolation, minimal crosstalk
- Digital signals: Standard tracks, adequate clearance
- Clock signals: Matched lengths, consistent routing`;

  const user = `DESIGN SPECIFICATIONS:
Board Layers: ${boardLayers}
Total Nets: ${netlist.length}
${designRequirements?.impedance_controlled ? 'Impedance Control Required' : ''}
${designRequirements?.high_speed ? 'High-Speed Design' : ''}
${designRequirements?.mixed_signal ? 'Mixed-Signal Design' : ''}
${designRequirements?.power_sensitive ? 'Power-Sensitive Application' : ''}

NET ANALYSIS:
${netlist.slice(0, 50).map(net => 
  `${net.net}: ${net.pins.length} pins${net.type ? ` (${net.type})` : ''}`
).join('\n')}

Generate appropriate net classes, routing constraints, and design rules.`;

  return { system, user };
}

// Design Rule Optimization Prompt Builder
export function buildDesignRulePrompt(
  fabricationSpecs: {
    min_feature_size_um: number;
    layer_count: number;
    board_thickness_mm: number;
    via_capabilities?: string[];
  },
  performanceRequirements: {
    max_frequency_mhz?: number;
    impedance_targets?: Array<{ type: string; value: number }>;
    current_requirements?: Array<{ net: string; current_a: number }>;
  },
  costTargets?: {
    target_cost_usd?: number;
    volume?: number;
    complexity_preference?: 'minimal' | 'standard' | 'advanced';
  }
): { system: string; user: string } {
  const system = `You are an expert in PCB design rule optimization and manufacturing cost analysis.

Your task is to generate optimized design rules that balance electrical performance, manufacturability, and cost.

CRITICAL REQUIREMENTS:
1. Respond with ONLY valid JSON - no markdown, explanations, or additional text
2. Ensure rules are within manufacturing capabilities
3. Optimize for specified performance requirements
4. Consider cost implications of design choices
5. Provide layer stackup recommendations
6. Include manufacturing finish recommendations
7. Estimate cost impacts of design decisions

DESIGN RULE CONSIDERATIONS:
- Minimum features must exceed fab capabilities
- Track widths must handle current requirements
- Impedance targets drive stackup design
- Via sizes affect cost and performance
- Finish selection impacts cost and performance`;

  const user = `FABRICATION CAPABILITIES:
Minimum Feature Size: ${fabricationSpecs.min_feature_size_um}µm
Layer Count: ${fabricationSpecs.layer_count}
Board Thickness: ${fabricationSpecs.board_thickness_mm}mm
${fabricationSpecs.via_capabilities?.length ? `Via Options: ${fabricationSpecs.via_capabilities.join(', ')}` : ''}

PERFORMANCE REQUIREMENTS:
${performanceRequirements.max_frequency_mhz ? `Max Frequency: ${performanceRequirements.max_frequency_mhz}MHz` : ''}
${performanceRequirements.impedance_targets?.length ? 
  `Impedance Targets:\n${performanceRequirements.impedance_targets.map(t => `  ${t.type}: ${t.value}Ω`).join('\n')}` : ''}
${performanceRequirements.current_requirements?.length ?
  `Current Requirements:\n${performanceRequirements.current_requirements.map(c => `  ${c.net}: ${c.current_a}A`).join('\n')}` : ''}

${costTargets ? `COST TARGETS:
${costTargets.target_cost_usd ? `Target Cost: $${costTargets.target_cost_usd}` : ''}
${costTargets.volume ? `Volume: ${costTargets.volume} units` : ''}
${costTargets.complexity_preference ? `Complexity: ${costTargets.complexity_preference}` : ''}` : ''}

Generate optimized design rules and manufacturing recommendations.`;

  return { system, user };
}