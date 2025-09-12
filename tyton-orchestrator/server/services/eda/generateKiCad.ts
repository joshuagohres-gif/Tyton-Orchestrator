import { EdaSpecV1 } from "./spec";
import { SchematicSpec } from "@/server/validation/schematicSpecValidator";
import * as archiver from "archiver";
import { Readable } from "stream";

export async function makeKiCadProjectZip(
  projectTitle: string, 
  schematic: SchematicSpec, 
  eda: EdaSpecV1
): Promise<Buffer> {
  console.log(`[KICAD_EXPORT] Generating KiCad project for "${projectTitle}"`);
  
  const safeTitle = projectTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
  
  // Generate all project files
  const files = {
    [`${safeTitle}.kicad_pro`]: generateKiCadProject(safeTitle, eda),
    [`${safeTitle}.kicad_sch`]: generateKiCadSchematic(safeTitle, schematic, eda),
    [`${safeTitle}.kicad_pcb`]: generateKiCadPCB(safeTitle, schematic, eda),
    [`bom/bom.csv`]: generateBOM(eda),
    [`doc/README.txt`]: generateReadme(projectTitle, schematic, eda),
    [`doc/WARNINGS.txt`]: generateWarnings(eda)
  };
  
  // Create zip archive
  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  
  archive.on('data', chunk => chunks.push(chunk));
  
  return new Promise((resolve, reject) => {
    archive.on('end', () => {
      const buffer = Buffer.concat(chunks);
      console.log(`[KICAD_EXPORT] Generated zip: ${buffer.length} bytes`);
      resolve(buffer);
    });
    
    archive.on('error', reject);
    
    // Add files to archive
    Object.entries(files).forEach(([filename, content]) => {
      archive.append(content, { name: filename });
    });
    
    archive.finalize();
  });
}

function generateKiCadProject(projectName: string, eda: EdaSpecV1): string {
  const project = {
    board: {
      design_settings: {
        defaults: {
          board_outline_line_width: 0.15,
          copper_line_width: 0.2,
          copper_text_size_h: 1.5,
          copper_text_size_v: 1.5,
          copper_text_thickness: 0.3,
        },
        diff_pair_dimensions: eda.diffPairs?.map(dp => ({
          gap: 0.2,
          via_gap: 0.25,
          width: 0.2
        })) || [],
        drc_exclusions: [],
        rules: {
          min_clearance: eda.manufacturing?.min_clearance_mm || 0.127,
          min_track_width: eda.manufacturing?.min_track_mm || 0.127,
          min_via_diameter: 0.6,
          min_via_drill: 0.3
        },
        teardrop_options: {
          td_allow_use_two_tracks: true,
          td_curve_segcount: 5,
          td_on_pad_in_zone: false,
          td_onpadsmd: true,
          td_onroundshapesonly: false,
          td_ontrackend: false,
          td_onviapad: true
        },
        track_widths: eda.netClasses.map(nc => nc.track_mm),
        via_dimensions: eda.netClasses.map(nc => ({
          diameter: nc.via_diam_mm || 0.8,
          drill: nc.via_drill_mm || 0.4
        }))
      },
      layer_presets: [],
      viewports: []
    },
    boards: [],
    cvpcb: {
      equivalence_files: []
    },
    libraries: {
      pinned_footprint_libs: [],
      pinned_symbol_libs: []
    },
    meta: {
      filename: `${projectName}.kicad_pro`,
      version: 1
    },
    net_settings: {
      classes: eda.netClasses.map(nc => ({
        bus_width: 12,
        clearance: nc.clearance_mm,
        diff_pair_gap: 0.25,
        diff_pair_via_gap: 0.25,
        diff_pair_width: 0.2,
        line_style: 0,
        microvia_diameter: 0.3,
        microvia_drill: 0.1,
        name: nc.name,
        pcb_color: "rgba(0, 0, 0, 0.000)",
        schematic_color: "rgba(0, 0, 0, 0.000)",
        track_width: nc.track_mm,
        via_diameter: nc.via_diam_mm || 0.8,
        via_drill: nc.via_drill_mm || 0.4,
        wire_width: 6
      })),
      meta: {
        version: 3
      },
      net_colors: null
    },
    pcbnew: {
      last_paths: {
        gencad: "",
        idf: "",
        netlist: "",
        specctra_dsn: "",
        step: "",
        vrml: ""
      },
      page_layout_descr_file: ""
    },
    schematic: {
      annotate_start_num: 0,
      drawing: {
        dashed_lines_dash_length_ratio: 12.0,
        dashed_lines_gap_length_ratio: 3.0,
        default_line_thickness: 6.0,
        default_text_size: 50.0,
        field_names: [],
        intersheets_ref_own_page: false,
        intersheets_ref_prefix: "",
        intersheets_ref_short: false,
        intersheets_ref_show: false,
        intersheets_ref_suffix: "",
        junction_size_choice: 3,
        label_size_ratio: 0.375,
        no_connect_size: 30.0,
        pin_symbol_size: 25.0,
        text_offset_ratio: 0.15
      },
      legacy_lib_dir: "",
      legacy_lib_list: [],
      meta: {
        version: 1
      },
      net_format_name: "",
      ngspice: {
        fix_include_paths: true,
        fix_passive_vals: false,
        meta: {
          version: 0
        },
        model_mode: 0,
        workbook_filename: ""
      },
      page_layout_descr_file: "",
      plot_directory: "",
      spice_current_sheet_as_root: false,
      spice_external_command: 'spice "%I"',
      spice_model_current_sheet_as_root: true,
      spice_save_all_currents: false,
      spice_save_all_voltages: false,
      subpart_first_id: 65,
      subpart_id_separator: 0
    },
    sheets: [
      [
        "e63e39d7-6ac0-4ffd-8aa3-1b24dc379185",
        ""
      ]
    ],
    text_variables: {}
  };
  
  return JSON.stringify(project, null, 2);
}

function generateKiCadSchematic(projectName: string, schematic: SchematicSpec, eda: EdaSpecV1): string {
  // KiCad schematic files use S-expressions format
  let sch = `(kicad_sch (version 20230121) (generator eeschema)\
\
`;
  
  // UUID for the sheet
  sch += `  (uuid e63e39d7-6ac0-4ffd-8aa3-1b24dc379185)\
\
`;
  
  // Paper size
  sch += `  (paper "A4")\
\
`;
  
  // Title block
  sch += `  (title_block\
`;
  sch += `    (title "${schematic.project.name}")\
`;
  sch += `    (date "${schematic.project.date}")\
`;
  sch += `    (rev "${schematic.project.revision}")\
`;
  sch += `    (company "${schematic.project.author}")\
`;
  sch += `    (comment 1 "${schematic.project.description}")\
`;
  sch += `    (comment 2 "Generated by Tyton EDA")\
`;
  sch += `  )\
\
`;
  
  // Add symbols for each component
  let x = 50, y = 50; // Starting position
  const gridSize = 25.4; // 1 inch grid
  
  for (const comp of eda.components) {
    const symbol = comp.symbol || "Device:R_Small";
    const compId = generateUUID();
    
    sch += `  (symbol (lib_id "${symbol}") (at ${x} ${y} 0) (unit 1)\
`;
    sch += `    (uuid ${compId})\
`;
    sch += `    (property "Reference" "${comp.ref}" (at ${x} ${y - 5} 0)\
`;
    sch += `      (effects (font (size 1.27 1.27)))\
`;
    sch += `    )\
`;
    sch += `    (property "Value" "${comp.value || comp.mpn || 'TBD'}" (at ${x} ${y + 5} 0)\
`;
    sch += `      (effects (font (size 1.27 1.27)))\
`;
    sch += `    )\
`;
    sch += `    (property "Footprint" "${comp.footprint || 'TBD'}" (at ${x} ${y} 0)\
`;
    sch += `      (effects (font (size 1.27 1.27)) hide)\
`;
    sch += `    )\
`;
    
    if (comp.mpn) {
      sch += `    (property "MPN" "${comp.mpn}" (at ${x} ${y} 0)\
`;
      sch += `      (effects (font (size 1.27 1.27)) hide)\
`;
      sch += `    )\
`;
    }
    
    sch += `  )\
\
`;
    
    // Move to next position (simple grid layout)
    x += gridSize;
    if (x > 200) {
      x = 50;
      y += gridSize;
    }
  }
  
  // Add net labels for key nets
  let labelY = 150;
  const importantNets = schematic.nets?.filter(net => 
    net.class === 'power' || net.name.includes('USB') || 
    net.name.includes('VCC') || net.name.includes('GND')
  ).slice(0, 10) || [];
  
  for (const net of importantNets) {
    sch += `  (label "${net.name}" (at 200 ${labelY} 0) (fields_autoplaced)\
`;
    sch += `    (effects (font (size 1.27 1.27)) (justify left bottom))\
`;
    sch += `    (uuid ${generateUUID()})\
`;
    sch += `  )\
\
`;
    labelY += 10;
  }
  
  sch += `)\
`; // Close kicad_sch
  
  return sch;
}

function generateKiCadPCB(projectName: string, schematic: SchematicSpec, eda: EdaSpecV1): string {
  let pcb = `(kicad_pcb (version 20221018) (generator pcbnew)\
\
`;
  
  // General settings
  pcb += `  (general\
`;
  pcb += `    (thickness ${eda.manufacturing?.thickness_mm || 1.6})\
`;
  pcb += `  )\
\
`;
  
  // Paper size
  pcb += `  (paper "A4")\
\
`;
  
  // Layers
  pcb += `  (layers\
`;
  if (eda.board.layers === 2) {
    pcb += `    (0 "F.Cu" signal)\
`;
    pcb += `    (31 "B.Cu" signal)\
`;
  } else {
    pcb += `    (0 "F.Cu" signal)\
`;
    pcb += `    (1 "In1.Cu" signal)\
`;
    pcb += `    (2 "In2.Cu" signal)\
`;
    pcb += `    (31 "B.Cu" signal)\
`;
  }
  pcb += `    (32 "B.Adhes" user "B.Adhesive")\
`;
  pcb += `    (33 "F.Adhes" user "F.Adhesive")\
`;
  pcb += `    (34 "B.Paste" user)\
`;
  pcb += `    (35 "F.Paste" user)\
`;
  pcb += `    (36 "B.SilkS" user "B.Silkscreen")\
`;
  pcb += `    (37 "F.SilkS" user "F.Silkscreen")\
`;
  pcb += `    (38 "B.Mask" user)\
`;
  pcb += `    (39 "F.Mask" user)\
`;
  pcb += `    (40 "Dwgs.User" user "User.Drawings")\
`;
  pcb += `    (41 "Cmts.User" user "User.Comments")\
`;
  pcb += `    (42 "Eco1.User" user "User.Eco1")\
`;
  pcb += `    (43 "Eco2.User" user "User.Eco2")\
`;
  pcb += `    (44 "Edge.Cuts" user)\
`;
  pcb += `    (45 "Margin" user)\
`;
  pcb += `    (46 "B.CrtYd" user "B.Courtyard")\
`;
  pcb += `    (47 "F.CrtYd" user "F.Courtyard")\
`;
  pcb += `    (48 "B.Fab" user)\
`;
  pcb += `    (49 "F.Fab" user)\
`;
  pcb += `  )\
\
`;
  
  // Setup
  pcb += `  (setup\
`;
  pcb += `    (pad_to_mask_clearance 0)\
`;
  pcb += `    (pcbplotparams\
`;
  pcb += `      (layerselection 0x00010fc_ffffffff)\
`;
  pcb += `      (plot_on_all_layers_selection 0x0000000_00000000)\
`;
  pcb += `      (disableapertmacros false)\
`;
  pcb += `      (usegerberextensions false)\
`;
  pcb += `      (usegerberattributes true)\
`;
  pcb += `      (usegerberadvancedattributes true)\
`;
  pcb += `      (creategerberjobfile true)\
`;
  pcb += `      (svguseinch false)\
`;
  pcb += `      (svgprecision 4)\
`;
  pcb += `      (excludeedgelayer true)\
`;
  pcb += `      (plotframeref false)\
`;
  pcb += `      (viasonmask false)\
`;
  pcb += `      (mode 1)\
`;
  pcb += `      (useauxorigin false)\
`;
  pcb += `      (hpglpennumber 1)\
`;
  pcb += `      (hpglpenspeed 20)\
`;
  pcb += `      (hpglpendiameter 15.000000)\
`;
  pcb += `      (dxfpolygonmode true)\
`;
  pcb += `      (dxfimperialunits true)\
`;
  pcb += `      (dxfusepcbnewfont true)\
`;
  pcb += `      (psnegative false)\
`;
  pcb += `      (psa4output false)\
`;
  pcb += `      (plotreference true)\
`;
  pcb += `      (plotvalue true)\
`;
  pcb += `      (plotinvisibletext false)\
`;
  pcb += `      (sketchpadsonfab false)\
`;
  pcb += `      (subtractmaskfromsilk false)\
`;
  pcb += `      (outputformat 1)\
`;
  pcb += `      (mirror false)\
`;
  pcb += `      (drillshape 0)\
`;
  pcb += `      (scaleselection 1)\
`;
  pcb += `      (outputdirectory "")\
`;
  pcb += `    )\
`;
  pcb += `  )\
\
`;
  
  // Net classes
  for (const netClass of eda.netClasses) {
    pcb += `  (net_class "${netClass.name}" ""\
`;
    pcb += `    (clearance ${netClass.clearance_mm})\
`;
    pcb += `    (trace_width ${netClass.track_mm})\
`;
    pcb += `    (via_dia ${netClass.via_diam_mm || 0.8})\
`;
    pcb += `    (via_drill ${netClass.via_drill_mm || 0.4})\
`;
    pcb += `    (uvia_dia 0.3)\
`;
    pcb += `    (uvia_drill 0.1)\
`;
    pcb += `  )\
\
`;
  }
  
  // Board outline
  const width = eda.board.outline_mm.width;
  const height = eda.board.outline_mm.height;
  const radius = eda.board.outline_mm.corner_radius || 0;
  
  if (radius > 0) {
    // Rounded rectangle outline (simplified)
    pcb += `  (gr_rect (start 0 0) (end ${width} ${height}) (stroke (width 0.15) (type solid)) (layer "Edge.Cuts") (tstamp ${generateTimestamp()}))\
\
`;
  } else {
    // Simple rectangle
    pcb += `  (gr_rect (start 0 0) (end ${width} ${height}) (stroke (width 0.15) (type solid)) (layer "Edge.Cuts") (tstamp ${generateTimestamp()}))\
\
`;
  }
  
  // Add footprints
  for (const placement of eda.placement) {
    const comp = eda.components.find(c => c.ref === placement.ref);
    if (!comp || !comp.footprint || comp.footprint === "TBD") continue;
    
    pcb += `  (footprint "${comp.footprint}" (at ${placement.x_mm} ${placement.y_mm} ${placement.rot_deg || 0}) (layer "F.Cu")\
`;
    pcb += `    (tstamp ${generateTimestamp()})\
`;
    pcb += `    (at ${placement.x_mm} ${placement.y_mm} ${placement.rot_deg || 0})\
`;
    pcb += `    (property "Reference" "${comp.ref}" (at 0 0 ${placement.rot_deg || 0}) (layer "F.SilkS") (tstamp ${generateTimestamp()})\
`;
    pcb += `      (effects (font (size 1 1) (thickness 0.15)))\
`;
    pcb += `    )\
`;
    pcb += `    (property "Value" "${comp.value || comp.mpn || 'TBD'}" (at 0 0 ${placement.rot_deg || 0}) (layer "F.Fab") (tstamp ${generateTimestamp()})\
`;
    pcb += `      (effects (font (size 1 1) (thickness 0.15)))\
`;
    pcb += `    )\
`;
    pcb += `    (property "Footprint" "${comp.footprint}" (at 0 0 ${placement.rot_deg || 0}) (layer "F.Fab") hide (tstamp ${generateTimestamp()})\
`;
    pcb += `      (effects (font (size 1.27 1.27) (thickness 0.15)))\
`;
    pcb += `    )\
`;
    pcb += `  )\
\
`;
  }
  
  // Add ground zones
  if (eda.board.zones) {
    for (const zone of eda.board.zones) {
      pcb += `  (zone (net 0) (net_name "${zone.net}") (layer "${zone.layer}") (tstamp ${generateTimestamp()})\
`;
      pcb += `    (hatch edge 0.5)\
`;
      pcb += `    (priority 0)\
`;
      pcb += `    (connect_pads (clearance ${zone.clearance_mm || 0.2}))\
`;
      pcb += `    (min_thickness 0.25)\
`;
      pcb += `    (filled_areas_thickness no)\
`;
      pcb += `    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))\
`;
      pcb += `    (polygon\
`;
      pcb += `      (pts\
`;
      pcb += `        (xy 1 1)\
`;
      pcb += `        (xy ${width - 1} 1)\
`;
      pcb += `        (xy ${width - 1} ${height - 1})\
`;
      pcb += `        (xy 1 ${height - 1})\
`;
      pcb += `      )\
`;
      pcb += `    )\
`;
      pcb += `  )\
\
`;
    }
  }
  
  pcb += `)\
`; // Close kicad_pcb
  
  return pcb;
}

function generateBOM(eda: EdaSpecV1): string {
  let bom = "Reference,Value,MPN,Footprint,Role,Description\
";
  
  for (const comp of eda.components) {
    const ref = comp.ref || "";
    const value = comp.value || "";
    const mpn = comp.mpn || "";
    const footprint = comp.footprint || "TBD";
    const role = comp.role || "";
    const description = comp.attributes?.description || "";
    
    bom += `"${ref}","${value}","${mpn}","${footprint}","${role}","${description}"\
`;
  }
  
  return bom;
}

function generateReadme(projectTitle: string, schematic: SchematicSpec, eda: EdaSpecV1): string {
  let readme = `# ${projectTitle}\
\
`;
  readme += `${schematic.project.description}\
\
`;
  readme += `## Project Details\
`;
  readme += `- **Author**: ${schematic.project.author}\
`;
  readme += `- **Revision**: ${schematic.project.revision}\
`;
  readme += `- **Date**: ${schematic.project.date}\
`;
  readme += `- **Generated**: ${new Date().toISOString()}\
\
`;
  
  readme += `## Board Specifications\
`;
  readme += `- **Dimensions**: ${eda.board.outline_mm.width} x ${eda.board.outline_mm.height} mm\
`;
  readme += `- **Layers**: ${eda.board.layers}\
`;
  readme += `- **Target**: KiCad ${eda.target.version}\
`;
  readme += `- **Components**: ${eda.components.length}\
\
`;
  
  if (eda.manufacturing) {
    readme += `## Manufacturing\
`;
    readme += `- **Fab**: ${eda.manufacturing.fab}\
`;
    readme += `- **Thickness**: ${eda.manufacturing.thickness_mm} mm\
`;
    readme += `- **Min Track**: ${eda.manufacturing.min_track_mm} mm\
`;
    readme += `- **Min Clearance**: ${eda.manufacturing.min_clearance_mm} mm\
`;
    readme += `- **Finish**: ${eda.manufacturing.finish}\
\
`;
  }
  
  if (eda.netClasses.length > 0) {
    readme += `## Net Classes\
`;
    for (const nc of eda.netClasses) {
      readme += `- **${nc.name}**: ${nc.track_mm}mm track, ${nc.clearance_mm}mm clearance\
`;
    }
    readme += "\
";
  }
  
  readme += `## File Structure\
`;
  readme += `- \`${projectTitle}.kicad_pro\` - KiCad project file
`;
  readme += `- \`${projectTitle}.kicad_sch\` - Schematic file
`;
  readme += `- \`${projectTitle}.kicad_pcb\` - PCB layout file
`;
  readme += `- \`bom/bom.csv\` - Bill of Materials
`;
  readme += `- \`doc/\` - Documentation and warnings

`;
  
  readme += `## Next Steps\
`;
  readme += `1. Open the project in KiCad ${eda.target.version}\
`;
  readme += `2. Review and assign any missing footprints (marked as "TBD")\
`;
  readme += `3. Complete the schematic routing\
`;
  readme += `4. Route the PCB traces\
`;
  readme += `5. Run DRC and generate manufacturing files\
\
`;
  
  readme += `## Notes\
`;
  readme += `This project was generated by Tyton EDA from schematic specification v${schematic.version}.\
`;
  readme += `Please review all component assignments and placement before manufacturing.\
`;
  
  return readme;
}

function generateWarnings(eda: EdaSpecV1): string {
  let warnings = `# Warnings and Open Questions\
\
`;
  
  const tbdFootprints = eda.components.filter(c => !c.footprint || c.footprint === "TBD");
  const tbdSymbols = eda.components.filter(c => !c.symbol || c.symbol === "TBD");
  
  if (tbdFootprints.length > 0) {
    warnings += `## Missing Footprints\
`;
    warnings += `The following components need footprint assignment:\
`;
    for (const comp of tbdFootprints.slice(0, 20)) {
      warnings += `- ${comp.ref}: ${comp.value || comp.mpn || 'Unknown'}\
`;
    }
    if (tbdFootprints.length > 20) {
      warnings += `... and ${tbdFootprints.length - 20} more\
`;
    }
    warnings += "\
";
  }
  
  if (tbdSymbols.length > 0) {
    warnings += `## Missing Symbols\
`;
    warnings += `The following components need symbol assignment:\
`;
    for (const comp of tbdSymbols.slice(0, 20)) {
      warnings += `- ${comp.ref}: ${comp.value || comp.mpn || 'Unknown'}\
`;
    }
    if (tbdSymbols.length > 20) {
      warnings += `... and ${tbdSymbols.length - 20} more\
`;
    }
    warnings += "\
";
  }
  
  if (eda.openQuestions && eda.openQuestions.length > 0) {
    warnings += `## Open Questions\
`;
    for (const question of eda.openQuestions) {
      warnings += `- ${question}\
`;
    }
    warnings += "\
";
  }
  
  if (eda.constraints?.antenna_keepouts) {
    warnings += `## Antenna Keepouts\
`;
    warnings += `The following components have antenna keepout requirements:\
`;
    for (const keepout of eda.constraints.antenna_keepouts) {
      warnings += `- ${keepout.ref}: ${keepout.radius_mm}mm radius\
`;
    }
    warnings += "\
";
  }
  
  warnings += `## Verification Checklist\
`;
  warnings += `Before manufacturing:\
`;
  warnings += `- [ ] All footprints assigned and verified\
`;
  warnings += `- [ ] All symbols assigned and verified\
`;
  warnings += `- [ ] Component placement reviewed\
`;
  warnings += `- [ ] High-current traces checked\
`;
  warnings += `- [ ] Differential pairs routed correctly\
`;
  warnings += `- [ ] Ground zones properly connected\
`;
  warnings += `- [ ] DRC passed without errors\
`;
  warnings += `- [ ] ERC passed without errors\
`;
  warnings += `- [ ] 3D view checked for mechanical conflicts\
`;
  
  return warnings;
}

// Utility functions
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString(16);
}