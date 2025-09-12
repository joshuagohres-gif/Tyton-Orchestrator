import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { buildNeutralNetlist, writeKiCadNetlist, writeNeutralNetlistJson, validateNetlist } from '@/server/eda/build/netlist';
import { EdaSpecV1Z } from '@/server/eda/specs/edaSpecV10';

const ExportNetlistRequestZ = z.object({
  eda: EdaSpecV1Z,
  format: z.enum(['kicad', 'spice', 'json', 'neutral']).default('kicad'),
  options: z.object({
    validate: z.boolean().default(true),
    includeMetadata: z.boolean().default(true),
    includeUnconnected: z.boolean().default(false)
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ExportNetlistRequestZ.parse(body);
    const { eda, format = 'kicad', options } = parsed;

    // Map EDA components to netlist component format
    const netlistComponents = eda.components.map((comp: any) => ({
      refDes: comp.ref || comp.refDes || 'U?',
      mpn: comp.mpn || comp.value || 'UNKNOWN',
      package: comp.footprint || comp.package || 'UNKNOWN',
      value: comp.value || '',
      description: comp.description || '',
      pins: comp.pins || {}
    }));

    // Build neutral netlist from EDA spec
    const neutralNetlist = buildNeutralNetlist({
      version: "1.2",
      components: netlistComponents,
      nets: []
    }, `tyton-export-${Date.now()}`);

    let content: string;
    let contentType: string;
    let filename: string;

    // Validate netlist if requested
    let validation = null;
    if (options?.validate) {
      validation = validateNetlist(neutralNetlist);
    }

    // Generate output in requested format
    switch (format) {
      case 'kicad':
        content = writeKiCadNetlist(neutralNetlist);
        contentType = 'text/plain';
        filename = 'netlist.net';
        break;
        
      case 'spice':
        content = writeSpiceNetlist(neutralNetlist);
        contentType = 'text/plain';
        filename = 'netlist.cir';
        break;
        
      case 'json':
      case 'neutral':
        const output = {
          netlist: neutralNetlist,
          ...(validation && { validation }),
          ...(options?.includeMetadata && {
            metadata: {
              generator: 'tyton-orchestrator',
              version: '1.0',
              exportedAt: new Date().toISOString(),
              source: eda
            }
          })
        };
        content = JSON.stringify(output, null, 2);
        contentType = 'application/json';
        filename = 'netlist.json';
        break;
        
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    // Return validation errors if found and validation enabled
    if (validation && !validation.ok) {
      return NextResponse.json({
        error: 'Netlist validation failed',
        validation,
        content: options?.includeUnconnected ? content : undefined
      }, { status: 400 });
    }

    // Return netlist file
    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': content.length.toString(),
        'X-Netlist-Stats': JSON.stringify({
          components: neutralNetlist.components.length,
          nets: neutralNetlist.nets.length,
          connections: neutralNetlist.nets.reduce((sum, net) => sum + net.members.length, 0)
        })
      }
    });

  } catch (error) {
    console.error('Netlist export error:', error);
    
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to export netlist', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/eda/export/netlist',
    method: 'POST',
    description: 'Export EDA specification as netlist in various formats',
    parameters: {
      eda: 'EdaSpecV1 - The EDA specification to export',
      format: 'string - Output format: kicad, spice, json, neutral (default: kicad)',
      options: {
        validate: 'boolean - Validate netlist before export (default: true)',
        includeMetadata: 'boolean - Include export metadata (default: true)',
        includeUnconnected: 'boolean - Include unconnected nets (default: false)'
      }
    },
    supportedFormats: {
      kicad: 'KiCad compatible netlist format (.net)',
      spice: 'SPICE circuit simulator format (.cir)',
      json: 'JSON format with full netlist data',
      neutral: 'Neutral netlist format (same as json)'
    },
    response: 'text/plain or application/json - Netlist file content'
  });
}

/**
 * Generate SPICE netlist format
 */
function writeSpiceNetlist(netlist: any): string {
  const lines: string[] = [];
  
  // SPICE header
  lines.push('* SPICE Netlist Generated by Tyton Orchestrator');
  lines.push(`* Generated: ${new Date().toISOString()}`);
  lines.push(`* Components: ${netlist.components.length}`);
  lines.push(`* Nets: ${netlist.nets.length}`);
  lines.push('');
  
  // Component instances
  for (const component of netlist.components) {
    const ref = component.ref;
    const value = component.value || '1';
    
    // Get connected nets for this component
    const connectedNets: string[] = [];
    for (const pin of component.pins) {
      connectedNets.push(pin.net === 'NC' ? '0' : pin.net);
    }
    
    // Generate SPICE line based on component type
    const refPrefix = ref.charAt(0).toUpperCase();
    switch (refPrefix) {
      case 'R': // Resistor
        if (connectedNets.length >= 2) {
          lines.push(`${ref} ${connectedNets[0]} ${connectedNets[1]} ${value}`);
        }
        break;
      case 'C': // Capacitor
        if (connectedNets.length >= 2) {
          lines.push(`${ref} ${connectedNets[0]} ${connectedNets[1]} ${value}`);
        }
        break;
      case 'L': // Inductor
        if (connectedNets.length >= 2) {
          lines.push(`${ref} ${connectedNets[0]} ${connectedNets[1]} ${value}`);
        }
        break;
      case 'D': // Diode
        if (connectedNets.length >= 2) {
          lines.push(`${ref} ${connectedNets[0]} ${connectedNets[1]} DIODE`);
        }
        break;
      case 'Q': // Transistor (BJT)
        if (connectedNets.length >= 3) {
          lines.push(`${ref} ${connectedNets[0]} ${connectedNets[1]} ${connectedNets[2]} TRANSISTOR`);
        }
        break;
      case 'M': // MOSFET
        if (connectedNets.length >= 4) {
          lines.push(`${ref} ${connectedNets[0]} ${connectedNets[1]} ${connectedNets[2]} ${connectedNets[3]} MOSFET`);
        }
        break;
      case 'V': // Voltage source
        if (connectedNets.length >= 2) {
          lines.push(`${ref} ${connectedNets[0]} ${connectedNets[1]} ${value}`);
        }
        break;
      case 'I': // Current source
        if (connectedNets.length >= 2) {
          lines.push(`${ref} ${connectedNets[0]} ${connectedNets[1]} ${value}`);
        }
        break;
      default:
        // Generic subcircuit call
        const netList = connectedNets.join(' ');
        lines.push(`X${ref} ${netList} ${component.footprint || 'GENERIC'}`);
        break;
    }
  }
  
  // Add models if needed
  lines.push('');
  lines.push('* Models');
  lines.push('.model DIODE D');
  lines.push('.model TRANSISTOR NPN');
  lines.push('.model MOSFET NMOS');
  
  // Analysis commands
  lines.push('');
  lines.push('* Analysis');
  lines.push('.op');
  lines.push('.end');
  
  return lines.join('\n');
}