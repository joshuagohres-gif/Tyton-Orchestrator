import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { generateGlbBoard, generateSimpleGlb } from '@/server/eda/build/glbBoard';
import { EdaSpecV1Z } from '@/server/eda/specs/edaSpecV10';

const ExportGlbRequestZ = z.object({
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
    includeParts: z.boolean().default(true),
    includeTraces: z.boolean().default(false),
    boardColor: z.string().default('#2d4a2b'),
    silkscreenColor: z.string().default('#ffffff'),
    copperColor: z.string().default('#b87333'),
    solderMaskColor: z.string().default('#2d4a2b'),
    quality: z.enum(['low', 'medium', 'high']).default('medium'),
    scale: z.number().default(1.0),
    simple: z.boolean().default(false)
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ExportGlbRequestZ.parse(body);
    const { eda, layout, options } = parsed;

    let glbBuffer: Buffer;
    
    if (options?.simple) {
      // Generate simplified GLB for quick preview
      glbBuffer = generateSimpleGlb(eda);
    } else {
      // Generate full GLB with all options
      glbBuffer = generateGlbBoard(eda, options);
    }

    // Return GLB file
    return new NextResponse(glbBuffer, {
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': 'attachment; filename="board_3d.glb"',
        'Content-Length': glbBuffer.length.toString(),
        'X-GLB-Components': eda.components.length.toString(),
        'X-GLB-Quality': options?.quality || 'medium',
        'Access-Control-Expose-Headers': 'X-GLB-Components, X-GLB-Quality'
      }
    });

  } catch (error) {
    console.error('GLB export error:', error);
    
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to export GLB', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/eda/export/glb',
    method: 'POST',
    description: 'Export EDA specification as GLB (3D) file for visualization',
    parameters: {
      eda: 'EdaSpecV1 - The EDA specification to export',
      layout: 'Optional layout data for component positioning',
      options: {
        includeParts: 'boolean - Include 3D component models (default: true)',
        includeTraces: 'boolean - Include copper traces (default: false)',
        boardColor: 'string - PCB substrate color hex (default: #2d4a2b)',
        silkscreenColor: 'string - Silkscreen color hex (default: #ffffff)',
        copperColor: 'string - Copper trace color hex (default: #b87333)',
        solderMaskColor: 'string - Solder mask color hex (default: #2d4a2b)',
        quality: 'string - Rendering quality: low, medium, high (default: medium)',
        scale: 'number - Scale factor (default: 1.0)',
        simple: 'boolean - Generate simplified model (default: false)'
      }
    },
    use_cases: {
      visualization: 'View 3D board in web browsers or 3D viewers',
      presentation: 'Include in presentations and documentation',
      validation: 'Visual inspection of component placement',
      collaboration: 'Share 3D view with team members'
    },
    viewers: {
      web: 'three.js, model-viewer, babylon.js',
      desktop: 'Blender, MeshLab, Windows 3D Viewer',
      mobile: 'iOS Quick Look, Android AR Core'
    },
    response: 'model/gltf-binary - GLB 3D model file'
  });
}