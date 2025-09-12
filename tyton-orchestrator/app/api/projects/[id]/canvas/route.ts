import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for canvas update
const canvasSchema = z.object({
  canvasJson: z.object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
    viewport: z.any().optional()
  })
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    
    // Validate input
    const validated = canvasSchema.parse(body);
    
    // Update project canvas
    const project = await prisma.project.update({
      where: { id: params.id },
      data: {
        canvasJson: JSON.stringify(validated.canvasJson)
      }
    });
    
    // Add audit log
    await prisma.auditLog.create({
      data: {
        projectId: project.id,
        action: 'canvas_updated',
        detail: 'Canvas layout saved'
      }
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    
    console.error('Failed to update canvas:', error);
    return NextResponse.json(
      { error: 'Failed to update canvas' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { canvasJson: true }
    });
    
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }
    
    const canvas = project.canvasJson ? JSON.parse(project.canvasJson) : null;
    
    return NextResponse.json({ canvas });
  } catch (error) {
    console.error('Failed to fetch canvas:', error);
    return NextResponse.json(
      { error: 'Failed to fetch canvas' },
      { status: 500 }
    );
  }
}