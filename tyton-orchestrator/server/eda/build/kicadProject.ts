import JSZip from "jszip";
import type { SchematicSpec } from "@/server/validation/schematicSpecValidator";
import type { EdaSpecV1 } from "../specs/edaSpecV10";
import { buildNeutralNetlist, writeKiCadNetlist, validateNetlist, getNetlistStats } from "./netlist";

export interface KiCadProjectOptions {
  title: string;
  includeDocumentation?: boolean;
  includeBom?: boolean;
  force?: boolean;  // Bypass DRC errors
}

/**
 * Generate complete KiCad project as ZIP buffer
 */
export async function makeKiCadZip(
  options: KiCadProjectOptions,
  schematicSpec: SchematicSpec,
  edaSpec: EdaSpecV1
): Promise<Buffer> {
  const { title } = options;
  const zip = new JSZip();

  try {
    // Generate netlist and validate
    const netlist = buildNeutralNetlist(schematicSpec, `${title} Project`);
    const validation = validateNetlist(netlist);

    if (!validation.ok && !options.force) {
      throw new Error(`Netlist validation failed: ${validation.errors.join(", ")}`);
    }

    // 1. Project file (.kicad_pro)
    const projectContent = generateKiCadProject(title, edaSpec);
    zip.file(`${title}.kicad_pro`, projectContent);

    // 2. Schematic file (.kicad_sch)
    const schematicContent = generateKiCadSchematic(title, schematicSpec, edaSpec, netlist);
    zip.file(`${title}.kicad_sch`, schematicContent);

    // 3. PCB file (.kicad_pcb)
    const pcbContent = generateKiCadPcb(title, edaSpec, netlist);
    zip.file(`${title}.kicad_pcb`, pcbContent);

    // 4. Netlist file (.net)
    const netlistContent = writeKiCadNetlist(netlist);
    zip.file(`${title}.net`, netlistContent);

    // 5. BOM files
    if (options.includeBom !== false) {
      const bomCsv = generateBomCsv(edaSpec);
      const bomJson = generateBomJson(edaSpec);
      zip.folder("bom")?.file("bom.csv", bomCsv);
      zip.folder("bom")?.file("bom.json", bomJson);
    }

    // 6. Documentation
    if (options.includeDocumentation !== false) {
      const readme = generateProjectReadme(title, schematicSpec, edaSpec, validation);
      const netlistStats = getNetlistStats(netlist);
      zip.folder("doc")?.file("README.md", readme);
      zip.folder("doc")?.file("netlist_report.json", JSON.stringify(netlistStats, null, 2));
      
      if (validation.warnings.length > 0 || validation.errors.length > 0) {
        const issues = generateIssuesReport(validation);
        zip.folder("doc")?.file("design_issues.txt", issues);
      }
    }

    // 7. Generate ZIP
    return await zip.generateAsync({ 
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

  } catch (error) {
    throw new Error(`KiCad project generation failed: ${(error as Error).message}`);
  }
}

/**
 * Generate KiCad project file (.kicad_pro)
 */
function generateKiCadProject(title: string, edaSpec: EdaSpecV1): string {
  const project = {
    board: {
      design_settings: {
        defaults: {
          board_outline_line_width: 0.1,
          copper_line_width: 0.2,
          copper_text_italic: false,
          copper_text_size_h: 1.5,
          copper_text_size_v: 1.5,
          copper_text_thickness: 0.3,
          copper_text_upright: true,
          courtyard_line_width: 0.05,
          dimension_precision: 4,
          dimension_units: 3,
          dimensions: {
            arrow_length: 1270000,
            extension_offset: 500000,
            keep_text_aligned: true,
            suppress_zeroes: false,
            text_position: 0,
            units_format: 1
          },
          fab_line_width: 0.1,
          fab_text_italic: false,
          fab_text_size_h: 1.0,
          fab_text_size_v: 1.0,
          fab_text_thickness: 0.15,
          fab_text_upright: true,
          other_line_width: 0.15,
          other_text_italic: false,
          other_text_size_h: 1.0,
          other_text_size_v: 1.0,
          other_text_thickness: 0.15,
          other_text_upright: true,
          pads: {
            drill: 0.762,
            height: 1.524,
            width: 1.524
          },
          pcb_color: "rgba(0, 0, 0, 0.000)",
          schematic_color: "rgba(0, 0, 0, 0.000)",
          silk_line_width: 0.15,
          silk_text_italic: false,
          silk_text_size_h: 1.0,
          silk_text_size_v: 1.0,
          silk_text_thickness: 0.15,
          silk_text_upright: true,
          zones: {
            min_clearance: 0.2
          }
        },
        diff_pair_dimensions: [],
        drc_exclusions: [],
        meta: {
          version: 2
        },
        rule_severities: {
          annular_width: "error",
          clearance: "error",
          connection_width: "warning",
          copper_edge_clearance: "error",
          courtyards_overlap: "error",
          diff_pair_gap_out_of_range: "error",
          diff_pair_uncoupled_length_too_long: "error",
          drill_out_of_range: "error",
          duplicate_footprints: "warning",
          extra_footprint: "warning",
          footprint: "error",
          footprint_type_mismatch: "ignore",
          hole_clearance: "error",
          hole_near_hole: "error",
          invalid_outline: "error",
          isolated_copper: "warning",
          item_on_disabled_layer: "error",
          items_not_allowed: "error",
          length_out_of_range: "error",
          lib_footprint_issues: "warning",
          lib_footprint_mismatch: "warning",
          malformed_courtyard: "error",
          microvia_not_allowed: "error",
          missing_courtyard: "ignore",
          missing_footprint: "warning",
          net_conflict: "warning",
          npth_inside_courtyard: "ignore",
          padstack: "warning",
          pth_inside_courtyard: "ignore",
          shorting_items: "error",
          silk_edge_clearance: "warning",
          silk_over_copper: "warning",
          silk_overlap: "warning",
          skew_out_of_range: "error",
          solder_mask_bridge: "error",
          starved_thermal: "error",
          text_height: "warning",
          text_thickness: "warning",
          through_hole_pad_without_hole: "error",
          too_many_vias: "error",
          track_dangling: "warning",
          track_width: "error",
          tracks_crossing: "error",
          unconnected_items: "error",
          unresolved_variable: "error",
          via_dangling: "warning",
          zones_intersect: "error"
        },
        rules: {
          max_error: 0.005,
          min_clearance: 0.127,
          min_connection_width: 0.0,
          min_copper_edge_clearance: 0.025,
          min_hole_clearance: 0.25,
          min_hole_to_hole: 0.25,
          min_microvia_diameter: 0.2,
          min_microvia_drill: 0.1,
          min_resolved_spokes: 2,
          min_silk_clearance: 0.0,
          min_text_height: 0.8,
          min_text_thickness: 0.08,
          min_through_hole_diameter: 0.3,
          min_track_width: 0.127,
          min_via_annular_width: 0.05,
          min_via_diameter: 0.5,
          use_height_for_length_calcs: true
        },
        teardrop_options: [
          {
            td_allow_use_two_tracks: true,
            td_curve_segcount: 5,
            td_on_pad_in_zone: false,
            td_onpadsmd: true,
            td_onroundshapesonly: false,
            td_ontrackend: false,
            td_onviapad: true
          }
        ],
        teardrop_parameters: [
          {
            td_curve_segcount: 0,
            td_height_ratio: 1.0,
            td_length_ratio: 0.5,
            td_maxheight: 2.0,
            td_maxlen: 1.0,
            td_target_name: "td_round_shape",
            td_width_to_size_filter_ratio: 0.9
          },
          {
            td_curve_segcount: 0,
            td_height_ratio: 1.0,
            td_length_ratio: 0.5,
            td_maxheight: 2.0,
            td_maxlen: 1.0,
            td_target_name: "td_rect_shape",
            td_width_to_size_filter_ratio: 0.9
          },
          {
            td_curve_segcount: 0,
            td_height_ratio: 1.0,
            td_length_ratio: 0.5,
            td_maxheight: 2.0,
            td_maxlen: 1.0,
            td_target_name: "td_track_end",
            td_width_to_size_filter_ratio: 0.9
          }
        ],
        track_widths: edaSpec.netClasses.map(nc => nc.track_mm).filter((v, i, arr) => arr.indexOf(v) === i),
        via_dimensions: [
          {
            diameter: 0.8,
            drill: 0.4
          }
        ],
        zones_allow_external_fillets: false
      },
      layer_presets: [],
      viewports: []
    },
    boards: [],
    cvpcb: {
      equivalence_files: []
    },
    erc: {
      erc_exclusions: [],
      meta: {
        version: 0
      },
      pin_map: [
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2],
        [0, 2, 0, 1, 0, 0, 1, 0, 2, 0, 1, 2],
        [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 2],
        [0, 1, 0, 0, 0, 0, 1, 1, 2, 1, 1, 2],
        [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
        [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 2],
        [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 2],
        [0, 2, 1, 2, 0, 0, 1, 0, 2, 0, 0, 2],
        [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 2],
        [0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 2],
        [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
      ],
      rule_severities: {
        bus_definition_conflict: "error",
        bus_entry_needed: "error",
        bus_to_bus_conflict: "error",
        bus_to_net_conflict: "error",
        conflicting_netclasses: "error",
        different_unit_footprint: "error",
        different_unit_net: "error",
        duplicate_reference: "error",
        duplicate_sheet_names: "error",
        endpoint_off_grid: "warning",
        extra_units: "error",
        global_label_dangling: "warning",
        hier_label_mismatch: "error",
        label_dangling: "error",
        lib_symbol_issues: "warning",
        missing_bidi_pin: "warning",
        missing_input_pin: "warning",
        missing_power_pin: "error",
        missing_unit: "warning",
        multiple_net_names: "warning",
        net_not_bus_member: "warning",
        no_connect_connected: "warning",
        no_connect_dangling: "warning",
        pin_not_connected: "error",
        pin_not_driven: "error",
        power_pin_not_driven: "error",
        similar_labels: "warning",
        simulation_model_issue: "ignore",
        unannotated: "error",
        unit_value_mismatch: "error",
        unresolved_variable: "error",
        wire_dangling: "error"
      }
    },
    libraries: {
      pinned_footprint_libs: [],
      pinned_symbol_libs: []
    },
    meta: {
      filename: `${title}.kicad_pro`,
      version: 1
    },
    net_settings: {
      classes: edaSpec.netClasses.map(nc => ({
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
      net_colors: null,
      netclass_assignments: {},
      netclass_patterns: []
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
        operating_point_overlay_i_precision: 3,
        operating_point_overlay_i_range: "~A",
        operating_point_overlay_v_precision: 3,
        operating_point_overlay_v_range: "~V",
        overbar_offset_ratio: 1.23,
        pin_symbol_size: 25.0,
        text_offset_ratio: 0.15
      },
      legacy_lib_dir: "",
      legacy_lib_list: [],
      meta: {
        version: 1
      },
      net_format_name: "",
      page_layout_descr_file: "",
      plot_directory: "",
      spice_current_sheet_as_root: false,
      spice_external_command: "spice \"%I\"",
      spice_model_current_sheet_as_root: true,
      spice_save_all_currents: false,
      spice_save_all_voltages: false,
      subpart_first_id: 65,
      subpart_id_separator: 0
    },
    sheets: [
      [
        "e63e39d7-6ac0-4ffd-8aa3-1841a4541b55",
        ""
      ]
    ],
    text_variables: {}
  };

  return JSON.stringify(project, null, 2);
}

/**
 * Generate KiCad schematic file (.kicad_sch)
 */
function generateKiCadSchematic(
  title: string, 
  schematicSpec: SchematicSpec, 
  edaSpec: EdaSpecV1,
  netlist: any
): string {
  const lines: string[] = [];

  // Header
  lines.push(`(kicad_sch (version 20230121) (generator ${edaSpec.target.tool})`);
  lines.push("");
  lines.push("  (uuid e63e39d7-6ac0-4ffd-8aa3-1841a4541b55)");
  lines.push("");
  lines.push("  (paper \"A4\")");
  lines.push("");

  // Title block
  lines.push("  (title_block");
  lines.push(`    (title "${title}")`, 
  `    (date "${new Date().toISOString().split('T')[0]}")`,
  `    (rev "1")`,
  `    (company "Tyton EDA")`,
  `    (comment 1 "Generated from Tyton Orchestrator")`,
  "  )");
  lines.push("");

  // Libraries and symbols would go here
  // For now, include basic symbol definitions
  lines.push("  (lib_symbols");
  
  // Add symbol definitions for each unique symbol
  const uniqueSymbols = new Set<string>();
  for (const component of edaSpec.components) {
    if (component.symbol && component.symbol !== "TBD") {
      uniqueSymbols.add(component.symbol);
    }
  }

  for (const symbolRef of uniqueSymbols) {
    lines.push(`    (symbol "${symbolRef}" (pin_numbers hide) (pin_names (offset 1.016))`);
    lines.push("      (in_bom yes) (on_board yes)");
    // Simplified symbol definition
    lines.push("      (property \"Reference\" \"U\" (at 0 0 0) (effects (font (size 1.27 1.27))))");
    lines.push("      (property \"Value\" \"\" (at 0 -2.54 0) (effects (font (size 1.27 1.27))))");
    lines.push("      (property \"Footprint\" \"\" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))");
    lines.push("      (symbol \"${symbolRef}_1_1\"");
    lines.push("        (rectangle (start -5.08 5.08) (end 5.08 -5.08)");
    lines.push("          (stroke (width 0.254) (type default))");
    lines.push("          (fill (type background))");
    lines.push("        )");
    lines.push("      )");
    lines.push("    )");
  }

  lines.push("  )");
  lines.push("");

  // Components
  let x = 50, y = 50;
  for (const component of edaSpec.components) {
    const uuid = generateUuid();
    lines.push(`  (symbol (lib_id "${component.symbol || "Device:R"}") (at ${x} ${y} 0) (unit 1)`);
    lines.push(`    (in_bom yes) (on_board yes) (dnp no) (fields_autoplaced)`);
    lines.push(`    (uuid ${uuid})`);
    lines.push(`    (property "Reference" "${component.ref}" (at ${x} ${y + 2.54} 0)`);
    lines.push("      (effects (font (size 1.27 1.27)))");
    lines.push("    )");
    lines.push(`    (property "Value" "${component.value || ""}" (at ${x} ${y - 2.54} 0)`);
    lines.push("      (effects (font (size 1.27 1.27)))");
    lines.push("    )");
    lines.push(`    (property "Footprint" "${component.footprint || ""}" (at ${x} ${y} 0)`);
    lines.push("      (effects (font (size 1.27 1.27)) hide)");
    lines.push("    )");
    if (component.attributes) {
      for (const [key, value] of Object.entries(component.attributes)) {
        lines.push(`    (property "${key}" "${value}" (at ${x} ${y} 0)`);
        lines.push("      (effects (font (size 1.27 1.27)) hide)");
        lines.push("    )");
      }
    }
    lines.push("  )");
    
    x += 25.4;
    if (x > 200) {
      x = 50;
      y += 25.4;
    }
  }

  lines.push(")");
  return lines.join("\n");
}

/**
 * Generate KiCad PCB file (.kicad_pcb)
 */
function generateKiCadPcb(title: string, edaSpec: EdaSpecV1, netlist: any): string {
  const lines: string[] = [];

  // Header
  lines.push(`(kicad_pcb (version 20221018) (generator ${edaSpec.target.tool})`);
  lines.push("");

  // General settings
  lines.push("  (general");
  lines.push(`    (thickness ${edaSpec.board.thickness_mm})`);
  lines.push("  )");
  lines.push("");

  // Paper and layers
  lines.push("  (paper \"A4\")");
  lines.push("  (layers");
  lines.push("    (0 \"F.Cu\" signal)");
  lines.push("    (31 \"B.Cu\" signal)");
  lines.push("    (32 \"B.Adhes\" user \"B.Adhesive\")");
  lines.push("    (33 \"F.Adhes\" user \"F.Adhesive\")");
  lines.push("    (34 \"B.Paste\" user)");
  lines.push("    (35 \"F.Paste\" user)");
  lines.push("    (36 \"B.SilkS\" user \"B.Silkscreen\")");
  lines.push("    (37 \"F.SilkS\" user \"F.Silkscreen\")");
  lines.push("    (38 \"B.Mask\" user)");
  lines.push("    (39 \"F.Mask\" user)");
  lines.push("    (40 \"Dwgs.User\" user \"User.Drawings\")");
  lines.push("    (41 \"Cmts.User\" user \"User.Comments\")");
  lines.push("    (42 \"Eco1.User\" user \"User.Eco1\")");
  lines.push("    (43 \"Eco2.User\" user \"User.Eco2\")");
  lines.push("    (44 \"Edge.Cuts\" user)");
  lines.push("    (45 \"Margin\" user)");
  lines.push("    (46 \"B.CrtYd\" user \"B.Courtyard\")");
  lines.push("    (47 \"F.CrtYd\" user \"F.Courtyard\")");
  lines.push("    (48 \"B.Fab\" user)");
  lines.push("    (49 \"F.Fab\" user)");
  lines.push("  )");
  lines.push("");

  // Setup
  lines.push("  (setup");
  lines.push("    (pad_to_mask_clearance 0)");
  lines.push("    (solder_mask_min_width 0)");
  lines.push("    (grid_origin 0 0)");
  lines.push("  )");
  lines.push("");

  // Net classes
  lines.push("  (net 0 \"\")");
  for (let i = 0; i < netlist.nets.length; i++) {
    lines.push(`  (net ${i + 1} "${netlist.nets[i].name}")`);
  }
  lines.push("");

  // Board outline
  const { width, height } = edaSpec.board.outline_mm;
  lines.push("  (gr_rect (start 0 0) (end " + width + " " + height + ")");
  lines.push("    (stroke (width 0.1) (type solid)) (layer \"Edge.Cuts\") (tstamp " + generateUuid() + "))");
  lines.push("");

  // Footprints
  for (const placement of edaSpec.placement) {
    const component = edaSpec.components.find(c => c.ref === placement.ref);
    if (component && component.footprint && component.footprint !== "TBD") {
      lines.push(`  (footprint "${component.footprint}" (layer "${placement.side === "bottom" ? "B" : "F"}.Cu")`);
      lines.push(`    (tstamp ${generateUuid()})`);
      lines.push(`    (at ${placement.x_mm} ${placement.y_mm} ${placement.rotation_deg})`);
      lines.push(`    (property "Reference" "${component.ref}" (at 0 -3 ${placement.rotation_deg}) (layer "${placement.side === "bottom" ? "B" : "F"}.SilkS")`);
      lines.push("      (effects (font (size 1 1) (thickness 0.15)))");
      lines.push("    )");
      lines.push(`    (property "Value" "${component.value || ""}" (at 0 3 ${placement.rotation_deg}) (layer "${placement.side === "bottom" ? "B" : "F"}.Fab")`);
      lines.push("      (effects (font (size 1 1) (thickness 0.15)))");
      lines.push("    )");
      lines.push(`    (property "Footprint" "${component.footprint}" (at 0 0 ${placement.rotation_deg}) (layer "F.Fab")`);
      lines.push("      (effects (font (size 1.27 1.27) (thickness 0.15)) hide)");
      lines.push("    )");
      lines.push("  )");
    }
  }

  // GND zones (placeholder)
  const gndNets = netlist.nets.filter((n: any) => n.name.toLowerCase().includes("gnd"));
  if (gndNets.length > 0) {
    lines.push("  (zone (net " + (netlist.nets.indexOf(gndNets[0]) + 1) + ") (net_name \"" + gndNets[0].name + "\") (layer \"F.Cu\") (tstamp " + generateUuid() + ")");
    lines.push("    (hatch edge 0.5)");
    lines.push("    (priority 0)");
    lines.push("    (connect_pads (clearance 0.5))");
    lines.push("    (min_thickness 0.25) (filled_areas_thickness no)");
    lines.push("    (keepout (tracks not_allowed) (vias not_allowed) (pads not_allowed) (copperpour not_allowed) (footprints not_allowed))");
    lines.push("    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))");
    lines.push("    (polygon");
    lines.push("      (pts");
    lines.push("        (xy 1 1) (xy " + (width - 1) + " 1) (xy " + (width - 1) + " " + (height - 1) + ") (xy 1 " + (height - 1) + ")");
    lines.push("      )");
    lines.push("    )");
    lines.push("  )");
  }

  lines.push(")");
  return lines.join("\n");
}

/**
 * Generate BOM CSV
 */
function generateBomCsv(edaSpec: EdaSpecV1): string {
  const lines = ["Reference,Value,Footprint,MPN,Role,Notes"];
  
  for (const component of edaSpec.components) {
    const notes = component.symbol === "TBD" || component.footprint === "TBD" 
      ? "Requires manual assignment" 
      : "";
    
    lines.push([
      component.ref,
      component.value || "",
      component.footprint || "",
      component.mpn || "",
      component.role || "",
      notes
    ].map(field => `"${field}"`).join(","));
  }
  
  return lines.join("\n");
}

/**
 * Generate BOM JSON
 */
function generateBomJson(edaSpec: EdaSpecV1): string {
  const bom = {
    metadata: {
      title: "Bill of Materials",
      generator: "tyton-orchestrator",
      version: "1.0",
      timestamp: new Date().toISOString()
    },
    components: edaSpec.components.map(component => ({
      reference: component.ref,
      value: component.value,
      footprint: component.footprint,
      mpn: component.mpn,
      role: component.role,
      attributes: component.attributes,
      status: (component.symbol === "TBD" || component.footprint === "TBD") ? "incomplete" : "ready"
    })),
    summary: {
      total_components: edaSpec.components.length,
      incomplete_assignments: edaSpec.components.filter(c => c.symbol === "TBD" || c.footprint === "TBD").length,
      unique_footprints: new Set(edaSpec.components.map(c => c.footprint).filter(Boolean)).size
    }
  };
  
  return JSON.stringify(bom, null, 2);
}

/**
 * Generate project README
 */
function generateProjectReadme(
  title: string,
  schematicSpec: SchematicSpec,
  edaSpec: EdaSpecV1,
  validation: any
): string {
  const lines = [
    `# ${title}`,
    "",
    "Generated by Tyton EDA Orchestrator",
    "",
    "## Project Overview",
    "",
    `- **Components**: ${edaSpec.components.length}`,
    `- **Nets**: ${validation.stats.nets}`,
    `- **Board Size**: ${edaSpec.board.outline_mm.width}×${edaSpec.board.outline_mm.height}mm`,
    `- **Layers**: ${edaSpec.board.layers}`,
    `- **Target**: ${edaSpec.target.tool} ${edaSpec.target.version}`,
    "",
    "## Files Included",
    "",
    "- `*.kicad_pro` - KiCad project file",
    "- `*.kicad_sch` - Schematic file",
    "- `*.kicad_pcb` - PCB layout file",
    "- `*.net` - Netlist file",
    "- `bom/` - Bill of materials",
    "- `doc/` - Documentation and reports",
    "",
    "## Design Status",
    ""
  ];

  if (validation.ok) {
    lines.push("✅ **Validation**: Passed");
  } else {
    lines.push("❌ **Validation**: Failed");
    lines.push("", "### Errors", "");
    validation.errors.forEach((error: string) => lines.push(`- ${error}`));
  }

  if (validation.warnings.length > 0) {
    lines.push("", "### Warnings", "");
    validation.warnings.forEach((warning: string) => lines.push(`- ${warning}`));
  }

  const tbdComponents = edaSpec.components.filter(c => c.symbol === "TBD" || c.footprint === "TBD");
  if (tbdComponents.length > 0) {
    lines.push("", "### Components Requiring Assignment", "");
    tbdComponents.forEach(comp => {
      lines.push(`- **${comp.ref}**: ${comp.value || "Unknown"} - ${comp.symbol === "TBD" ? "Symbol TBD" : ""} ${comp.footprint === "TBD" ? "Footprint TBD" : ""}`);
    });
  }

  if (edaSpec.openQuestions && edaSpec.openQuestions.length > 0) {
    lines.push("", "### Open Questions", "");
    edaSpec.openQuestions.forEach(question => lines.push(`- ${question}`));
  }

  lines.push("", "## Manufacturing", "");
  if (edaSpec.manufacturing) {
    const mfg = edaSpec.manufacturing;
    lines.push(`- **Thickness**: ${mfg.thickness_mm || edaSpec.board.thickness_mm}mm`);
    lines.push(`- **Min Track**: ${mfg.min_track_mm}mm`);
    lines.push(`- **Min Via**: ${mfg.min_via_mm}mm`);
    lines.push(`- **Finish**: ${mfg.finish}`);
  }

  lines.push("", `Generated on ${new Date().toISOString()}`);

  return lines.join("\n");
}

/**
 * Generate design issues report
 */
function generateIssuesReport(validation: any): string {
  const lines = [
    "DESIGN ISSUES REPORT",
    "===================",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Status: ${validation.ok ? "PASSED" : "FAILED"}`,
    "",
    "ERRORS:",
    "-------"
  ];

  if (validation.errors.length === 0) {
    lines.push("No errors found.");
  } else {
    validation.errors.forEach((error: string, i: number) => {
      lines.push(`${i + 1}. ${error}`);
    });
  }

  lines.push("", "WARNINGS:", "--------");

  if (validation.warnings.length === 0) {
    lines.push("No warnings found.");
  } else {
    validation.warnings.forEach((warning: string, i: number) => {
      lines.push(`${i + 1}. ${warning}`);
    });
  }

  lines.push("", "STATISTICS:", "-----------");
  lines.push(`Components: ${validation.stats.components}`);
  lines.push(`Nets: ${validation.stats.nets}`);
  lines.push(`Connections: ${validation.stats.connections}`);
  lines.push(`Unconnected pins: ${validation.stats.unconnected}`);

  return lines.join("\n");
}

/**
 * Generate a simple UUID
 */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}