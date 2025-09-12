import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Store active machine actors (shared with start route)
const activeMachines = new Map<string, any>();

const ReviewActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewId: z.string(),
  stageId: z.string(),
  notes: z.string().optional()
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const body = await request.json();
    
    // Validate request body
    const validation = ReviewActionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.errors },
        { status: 400 }
      );
    }

    const { action, reviewId, stageId, notes } = validation.data;

    // Verify review exists and is open
    const review = await prisma.reviewGate.findUnique({
      where: { id: reviewId },
      include: { orchestrator: true }
    });

    if (!review) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    if (review.status !== "open") {
      return NextResponse.json(
        { error: `Review is already ${review.status}` },
        { status: 409 }
      );
    }

    if (review.orchestrator.projectId !== projectId) {
      return NextResponse.json(
        { error: "Review does not belong to this project" },
        { status: 403 }
      );
    }

    // Update review status
    await prisma.reviewGate.update({
      where: { id: reviewId },
      data: {
        status: action === "approve" ? "approved" : "rejected",
        notes,
        updatedAt: new Date()
      }
    });

    // Get the machine actor for this orchestrator
    const actor = activeMachines.get(review.orchestratorId);
    if (!actor) {
      return NextResponse.json(
        { error: "Orchestrator machine not found - may need to restart" },
        { status: 404 }
      );
    }

    // Send appropriate event to machine
    if (action === "approve") {
      actor.send({
        type: "APPROVE",
        stageId,
        reviewId,
        notes
      });
    } else {
      actor.send({
        type: "REJECT",
        stageId,
        reviewId,
        notes
      });
    }

    // Update orchestrator status
    const newStatus = action === "approve" ? "running" : "error";
    await prisma.orchestratorRun.update({
      where: { id: review.orchestratorId },
      data: { status: newStatus }
    });

    return NextResponse.json({
      success: true,
      action,
      reviewId,
      stageId,
      notes,
      message: `Review ${action}d successfully`
    });

  } catch (error: any) {
    console.error("Failed to process review action:", error);
    return NextResponse.json(
      { error: "Failed to process review action", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    // Get current orchestrator run
    const run = await prisma.orchestratorRun.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        reviewGates: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!run) {
      return NextResponse.json({
        reviews: [],
        pendingReview: null
      });
    }

    // Parse review payloads
    const reviews = run.reviewGates.map(review => ({
      id: review.id,
      stageId: review.stageId,
      status: review.status,
      notes: review.notes,
      payload: review.payloadJson ? JSON.parse(review.payloadJson) : null,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt
    }));

    const pendingReview = reviews.find(r => r.status === "open") || null;

    return NextResponse.json({
      reviews,
      pendingReview,
      orchestratorId: run.id,
      orchestratorStatus: run.status
    });

  } catch (error: any) {
    console.error("Failed to get reviews:", error);
    return NextResponse.json(
      { error: "Failed to get reviews", details: error.message },
      { status: 500 }
    );
  }
}