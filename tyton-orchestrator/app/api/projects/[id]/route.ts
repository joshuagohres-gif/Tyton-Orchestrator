
import { prisma } from '@/server/db/client';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const project = await prisma.project.findUnique({
      where: { id: params.id },
    });

    if (!project) {
      return new NextResponse('Not Found', { status: 404 });
    }

    if (project.userId !== userId) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    return new NextResponse(JSON.stringify(project), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}
