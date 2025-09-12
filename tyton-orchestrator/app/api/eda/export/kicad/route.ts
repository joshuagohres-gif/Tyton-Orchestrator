import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { makeKiCadZip } from '@/server/eda/build/kicadProject';
import { EdaSpecV1Z } from '@/server/eda/specs/edaSpecV10';

const ExportKiCadRequestZ = z.object({
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
    includeSymbols: z.boolean().default(true),
    includeFootprints: z.boolean().default(true),
    include3D: z.boolean().default(false),
    generateBOM: z.boolean().default(true),
    generateGerbers: z.boolean().default(false)
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ExportKiCadRequestZ.parse(body);
    const { eda, layout, options } = parsed;

    // Generate KiCad project ZIP
    const zipBuffer = await makeKiCadZip({
      title: `tyton_project_${Date.now()}`,
      ...options
    }, eda, layout);

    // Return ZIP file
    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="kicad_project.zip"',
        'Content-Length': zipBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('KiCad export error:', error);
    
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to export KiCad project', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/eda/export/kicad',
    method: 'POST',
    description: 'Export EDA specification as KiCad project ZIP file',
    parameters: {
      eda: 'EdaSpecV1 - The EDA specification to export',
      layout: 'Optional layout data for component positioning',
      options: {
        includeSymbols: 'boolean - Include symbol libraries (default: true)',
        includeFootprints: 'boolean - Include footprint libraries (default: true)',  
        include3D: 'boolean - Include 3D models (default: false)',
        generateBOM: 'boolean - Generate bill of materials (default: true)',
        generateGerbers: 'boolean - Generate Gerber files (default: false)'
      }
    },
    response: 'application/zip - KiCad project files'
  });
}