import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { BaseModuleZ } from '../../../../../components/nodes/types';

const prisma = new PrismaClient();

// Schema for creating a new module
const createModuleSchema = z.object({
  kind: z.enum(['electronics', 'mechanical', 'bom', 'sourcing']),
  label: z.string().min(1),
  meta: z.record(z.any()).optional()
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const modules = await prisma.module.findMany({
      where: { projectId: params.id },
      orderBy: { id: 'asc' }
    });
    
    // Transform database modules to expected frontend structure
    const transformedModules = modules.map(module => ({
      id: module.id,
      kind: module.kind,
      title: module.label,
      status: 'draft' as const,
      tags: [],
      meta: module.metadata ? JSON.parse(module.metadata) : {},
      nets: [],
      dependsOn: [],
      updatedAt: new Date().toISOString()
    }));
    
    return NextResponse.json(transformedModules);
  } catch (error) {
    console.error('Failed to fetch modules:', error);
    return NextResponse.json(
      { error: 'Failed to fetch modules' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    
    // Validate input
    const validated = createModuleSchema.parse(body);
    
    // Create module
    const module = await prisma.module.create({
      data: {
        projectId: params.id,
        kind: validated.kind,
        label: validated.label,
        metadata: validated.meta ? JSON.stringify(validated.meta) : null
      }
    });
    
    // Add audit log
    await prisma.auditLog.create({
      data: {
        projectId: params.id,
        action: 'module_created',
        detail: `Module created: ${validated.label} (${validated.kind})`
      }
    });
    
    // Transform to expected structure
    const transformedModule = {
      id: module.id,
      kind: module.kind,
      title: module.label,
      status: 'draft' as const,
      tags: [],
      meta: validated.meta || {},
      nets: [],
      dependsOn: [],
      updatedAt: new Date().toISOString()
    };
    
    return NextResponse.json(transformedModule);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    
    console.error('Failed to create module:', error);
    return NextResponse.json(
      { error: 'Failed to create module' },
      { status: 500 }
    );
  }
}