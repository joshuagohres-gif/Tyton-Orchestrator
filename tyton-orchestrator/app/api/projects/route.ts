
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { NextResponse } from 'next/server';

const createProjectSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Verify the user exists in the database
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    if (!user) {
      return new NextResponse('User not found', { status: 404 });
    }

    const json = await request.json();
    const {
      title,
      description
    } = createProjectSchema.parse(json);

    const project = await prisma.project.create({
      data: {
        title,
        description,
        userId,
      },
    });

    return new NextResponse(JSON.stringify(project), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(JSON.stringify(error.issues), {
        status: 422,
      });
    }

    return new NextResponse(null, { status: 500 });
  }
}

export async function GET() {
  try {
    const projects = await prisma.project.findMany();
    return new NextResponse(JSON.stringify(projects), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}
