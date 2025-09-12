// Test route to verify path structure
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  return NextResponse.json({ 
    message: "Test route working", 
    projectId: ctx.params.id,
    timestamp: new Date().toISOString()
  });
}