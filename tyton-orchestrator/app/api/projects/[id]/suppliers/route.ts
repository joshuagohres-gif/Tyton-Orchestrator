import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const suppliers = await prisma.supplierLink.findMany({
      where: { projectId: params.id },
      orderBy: { partNumber: 'asc' }
    });
    
    // Group by part number
    const grouped = suppliers.reduce((acc, supplier) => {
      if (!acc[supplier.partNumber]) {
        acc[supplier.partNumber] = [];
      }
      acc[supplier.partNumber].push(supplier);
      return acc;
    }, {} as Record<string, any[]>);
    
    return NextResponse.json({
      suppliers,
      grouped
    });
  } catch (error) {
    console.error('Failed to fetch suppliers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch suppliers' },
      { status: 500 }
    );
  }
}