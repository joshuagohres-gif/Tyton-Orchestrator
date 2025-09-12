import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const bomItems = await prisma.bomItem.findMany({
      where: { projectId: params.id },
      orderBy: { category: 'asc' }
    });
    
    // Calculate totals
    const subtotal = bomItems.reduce((sum, item) => 
      sum + (item.extendedCost || 0), 0
    );
    const contingency = subtotal * 0.15; // 15% contingency
    const total = subtotal + contingency;
    
    return NextResponse.json({
      items: bomItems,
      subtotal,
      contingency,
      total
    });
  } catch (error) {
    console.error('Failed to fetch BOM:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BOM' },
      { status: 500 }
    );
  }
}