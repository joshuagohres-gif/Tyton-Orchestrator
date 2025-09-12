import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { generateDsn, generateSimpleDsn, validateDsn } from '@/server/eda/build/dsn';
import { EdaSpecV1Z } from '@/server/eda/specs/edaSpecV10';

const ExportDsnRequestZ = z.object({
  eda: EdaSpecV1Z,
  layout: z.object({
    components: z.array(z.object({
      ref: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      ports: z.array(z.object({
        id: z.string(),
        x: z.number(),
        y: z.number()
      }))
    })),
    width: z.number(),
    height: z.number()
  }).optional(),
  options: z.object({
    units: z.enum(['mm', 'mil']).default('mm'),
    resolution: z.number().default(2540),
    minTraceWidth: z.number().default(0.15),
    minViaSize: z.number().default(0.2),
    layerCount: z.number().default(2),
    boardThickness: z.number().default(1.6),
    simple: z.boolean().default(false),
    validate: z.boolean().default(true)
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ExportDsnRequestZ.parse(body);
    const { eda, layout, options } = parsed;

    // Use default values from zod schema
    const opts = options || {
      units: 'mm',
      resolution: 2540,
      minTraceWidth: 0.15,
      minViaSize: 0.2,
      layerCount: 2,
      boardThickness: 1.6,
      simple: false,
      validate: true
    };

    let dsnContent: string;
    
    if (opts.simple) {
      // Generate simplified DSN for basic routing
      dsnContent = generateSimpleDsn(eda);
    } else {
      // Generate full DSN with all options
      dsnContent = generateDsn(eda, opts);
    }

    // Validate DSN if requested
    let validation = null;
    if (opts.validate) {
      validation = validateDsn(dsnContent);
      
      if (!validation.ok) {
        return NextResponse.json({
          error: 'DSN validation failed',
          validation,
          content: dsnContent
        }, { status: 400 });
      }
    }

    // Return DSN file
    return new NextResponse(dsnContent, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': 'attachment; filename="board.dsn"',
        'Content-Length': dsnContent.length.toString(),
        'X-DSN-Stats': JSON.stringify({
          nets: validation?.stats.nets || 0,
          components: validation?.stats.components || 0,
          pins: validation?.stats.pins || 0
        }),
        'X-DSN-Format': 'Specctra Design Exchange'
      }
    });

  } catch (error) {
    console.error('DSN export error:', error);
    
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to export DSN', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/eda/export/dsn',
    method: 'POST',
    description: 'Export EDA specification as Specctra DSN file for freerouting',
    parameters: {
      eda: 'EdaSpecV1 - The EDA specification to export',
      layout: 'Optional layout data for component positioning',
      options: {
        units: 'string - Units: mm or mil (default: mm)',
        resolution: 'number - Design resolution in 1/254000 inch (default: 2540)',
        minTraceWidth: 'number - Minimum trace width (default: 0.15mm)',
        minViaSize: 'number - Minimum via size (default: 0.2mm)',
        layerCount: 'number - Number of copper layers (default: 2)',
        boardThickness: 'number - Board thickness (default: 1.6mm)',
        simple: 'boolean - Generate simplified DSN (default: false)',
        validate: 'boolean - Validate DSN output (default: true)'
      }
    },
    use_cases: {
      freerouting: 'Use with freerouting.org autorouter',
      kicad: 'Import DSN into KiCad for routing',
      analysis: 'Analyze routing complexity and constraints'
    },
    response: 'text/plain - Specctra DSN file content'
  });
}