import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for updating a module
const updateModuleSchema = z.object({
  label: z.string().min(1).optional(),
  kind: z.enum(['electronics', 'mechanical', 'bom', 'sourcing']).optional(),
  meta: z.record(z.any()).optional()
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; moduleId: string } }
) {
  try {
    const module = await prisma.module.findUnique({
      where: { 
        id: params.moduleId,
        projectId: params.id
      }
    });
    
    if (!module) {
      return NextResponse.json(
        { error: 'Module not found' },
        { status: 404 }
      );
    }
    
    // Transform to expected structure
    const transformedModule = {
      id: module.id,
      kind: module.kind,
      title: module.label,
      status: 'draft' as const,
      tags: [],
      meta: module.metadata ? JSON.parse(module.metadata) : {},
      nets: [],
      dependsOn: [],
      updatedAt: new Date().toISOString()
    };
    
    return NextResponse.json(transformedModule);
  } catch (error) {
    console.error('Failed to fetch module:', error);
    return NextResponse.json(
      { error: 'Failed to fetch module' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; moduleId: string } }
) {
  try {
    const body = await request.json();
    
    // Validate input
    const validated = updateModuleSchema.parse(body);
    
    // Prepare update data
    const updateData: any = {};
    if (validated.label) updateData.label = validated.label;
    if (validated.kind) updateData.kind = validated.kind;
    if (validated.meta) updateData.metadata = JSON.stringify(validated.meta);
    
    // Update module
    const module = await prisma.module.update({
      where: { 
        id: params.moduleId,
        projectId: params.id
      },
      data: updateData
    });
    
    // Add audit log
    await prisma.auditLog.create({
      data: {
        projectId: params.id,
        action: 'module_updated',
        detail: `Module updated: ${module.label} (${module.kind})`
      }
    });
    
    // Transform to expected structure
    const transformedModule = {
      id: module.id,
      kind: module.kind,
      title: module.label,
      status: 'draft' as const,
      tags: [],
      meta: module.metadata ? JSON.parse(module.metadata) : {},
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
    
    console.error('Failed to update module:', error);
    return NextResponse.json(
      { error: 'Failed to update module' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; moduleId: string } }
) {
  try {
    // Get module info for audit log before deletion
    const module = await prisma.module.findUnique({
      where: { 
        id: params.moduleId,
        projectId: params.id
      }
    });
    
    if (!module) {
      return NextResponse.json(
        { error: 'Module not found' },
        { status: 404 }
      );
    }
    
    // Delete the module (cascading will handle connections)
    await prisma.module.delete({
      where: { 
        id: params.moduleId,
        projectId: params.id
      }
    });
    
    // Add audit log
    await prisma.auditLog.create({
      data: {
        projectId: params.id,
        action: 'module_deleted',
        detail: `Module deleted: ${module.label} (${module.kind})`
      }
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete module:', error);
    return NextResponse.json(
      { error: 'Failed to delete module' },
      { status: 500 }
    );
  }
}