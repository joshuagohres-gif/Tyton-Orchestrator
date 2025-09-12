import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface ReviewPayload {
  summary?: string;
  details?: any;
  recommendations?: string[];
  warningFlags?: string[];
}

/**
 * Open a new review gate
 */
export async function openReview(
  orchestratorId: string,
  stageId: string,
  payload: ReviewPayload
) {
  return prisma.reviewGate.create({
    data: {
      orchestratorId,
      stageId,
      status: "open",
      payloadJson: JSON.stringify(payload),
    }
  });
}

/**
 * Approve a review gate
 */
export async function approveReview(id: string, notes?: string) {
  return prisma.reviewGate.update({
    where: { id },
    data: {
      status: "approved",
      notes,
      updatedAt: new Date(),
    }
  });
}

/**
 * Reject a review gate
 */
export async function rejectReview(id: string, notes?: string) {
  return prisma.reviewGate.update({
    where: { id },
    data: {
      status: "rejected",
      notes,
      updatedAt: new Date(),
    }
  });
}

/**
 * Get pending review for an orchestrator run
 */
export async function getPendingReview(orchestratorId: string) {
  return prisma.reviewGate.findFirst({
    where: {
      orchestratorId,
      status: "open"
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

/**
 * Get all reviews for an orchestrator run
 */
export async function getReviews(orchestratorId: string) {
  return prisma.reviewGate.findMany({
    where: { orchestratorId },
    orderBy: { createdAt: "asc" }
  });
}

/**
 * Parse review payload safely
 */
export function parseReviewPayload(payloadJson: string | null): ReviewPayload {
  if (!payloadJson) return {};
  
  try {
    return JSON.parse(payloadJson);
  } catch (e) {
    console.warn("Failed to parse review payload:", e);
    return {};
  }
}