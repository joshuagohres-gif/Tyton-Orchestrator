import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { generateSchematicLayout, applyLayoutToEda, getLayoutStats } from '@/server/eda/layout/elk';
import { EdaSpecV1Z } from '@/server/eda/specs/edaSpecV10';

const LayoutRequestZ = z.object({
  eda: EdaSpecV1Z,
  options: z.object({
    algorithm: z.enum(['layered', 'force', 'stress', 'mrtree', 'rectpacking']).default('layered'),
    direction: z.enum(['RIGHT', 'LEFT', 'UP', 'DOWN']).default('RIGHT'),
    nodeSpacing: z.number().default(50),
    edgeSpacing: z.number().default(20),
    layerSpacing: z.number().default(80),
    portConstraints: z.enum(['FIXED_ORDER', 'FIXED_SIDE', 'FIXED_POS', 'FREE']).default('FIXED_SIDE'),
    separateConnectedComponents: z.boolean().default(true),
    interactive: z.boolean().default(false),
    hierarchyHandling: z.enum(['INCLUDE_CHILDREN', 'SEPARATE_CHILDREN']).default('INCLUDE_CHILDREN'),
    applyToEda: z.boolean().default(true)
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = LayoutRequestZ.parse(body);
    const { eda, options } = parsed;

    // Generate layout using ELK algorithm
    const layoutResult = generateSchematicLayout(eda, options);
    
    // Get layout statistics
    const layoutStats = getLayoutStats(layoutResult);

    let updatedEda = eda;
    
    // Apply layout back to EDA spec if requested
    if (options?.applyToEda) {
      updatedEda = applyLayoutToEda(eda, layoutResult);
    }

    const response = {
      success: true,
      layout: layoutResult,
      stats: layoutStats,
      algorithm: options?.algorithm,
      ...(options?.applyToEda && { eda: updatedEda })
    };

    return NextResponse.json(response, {
      headers: {
        'X-Layout-Algorithm': options?.algorithm || 'layered',
        'X-Layout-Components': layoutStats.componentCount.toString(),
        'X-Layout-Edges': layoutStats.edgeCount.toString(),
        'X-Layout-Area': layoutStats.totalArea.toString(),
        'X-Layout-Aspect-Ratio': layoutStats.aspectRatio.toFixed(2)
      }
    });

  } catch (error) {
    console.error('Layout generation error:', error);
    
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate layout', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/eda/layout/generate',
    method: 'POST',
    description: 'Generate automatic schematic layout using ELK algorithms',
    parameters: {
      eda: 'EdaSpecV1 - The EDA specification to layout',
      options: {
        algorithm: 'string - Layout algorithm: layered, force, stress, mrtree, rectpacking (default: layered)',
        direction: 'string - Layout direction: RIGHT, LEFT, UP, DOWN (default: RIGHT)',
        nodeSpacing: 'number - Spacing between components (default: 50)',
        edgeSpacing: 'number - Spacing between connections (default: 20)',
        layerSpacing: 'number - Spacing between layers (default: 80)',
        portConstraints: 'string - Port positioning: FIXED_ORDER, FIXED_SIDE, FIXED_POS, FREE (default: FIXED_SIDE)',
        separateConnectedComponents: 'boolean - Separate disconnected components (default: true)',
        interactive: 'boolean - Interactive layout mode (default: false)',
        hierarchyHandling: 'string - Handle hierarchies: INCLUDE_CHILDREN, SEPARATE_CHILDREN (default: INCLUDE_CHILDREN)',
        applyToEda: 'boolean - Apply layout back to EDA spec (default: true)'
      }
    },
    algorithms: {
      layered: 'Hierarchical Sugiyama-style layout, good for flow diagrams',
      force: 'Force-directed layout, good for general graphs',
      stress: 'Stress minimization, good for symmetric layouts',
      mrtree: 'Minimum spanning tree based layout',
      rectpacking: 'Rectangle packing, good for dense layouts'
    },
    directions: {
      RIGHT: 'Left-to-right signal flow (traditional schematic)',
      DOWN: 'Top-to-bottom signal flow', 
      LEFT: 'Right-to-left signal flow',
      UP: 'Bottom-to-top signal flow'
    },
    response: {
      success: 'boolean - Whether layout generation succeeded',
      layout: 'object - Generated layout with component positions and connections',
      stats: {
        componentCount: 'number - Number of components laid out',
        edgeCount: 'number - Number of connections',
        totalArea: 'number - Total layout area',
        averageEdgeLength: 'number - Average connection length',
        crossingCount: 'number - Number of crossing connections',
        aspectRatio: 'number - Width to height ratio'
      },
      algorithm: 'string - Algorithm used for layout',
      eda: 'object - Updated EDA spec with layout applied (if applyToEda=true)'
    }
  });
}