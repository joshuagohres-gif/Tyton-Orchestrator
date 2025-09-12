import { PrismaClient } from '@prisma/client';
import { prisma } from './client';

export interface BomItemBulkCreate {
  projectId: string;
  category: string;
  partNumber: string;
  description: string;
  quantity: number;
  unitCost?: number;
  extendedCost?: number;
  notes?: string;
}

export interface SupplierLinkBulkCreate {
  projectId: string;
  partNumber: string;
  supplier: string;
  availability?: string;
  datasheetUrl?: string;
  purchaseUrl?: string;
  altPartsJson?: string;
}

export interface ModuleBulkCreate {
  projectId: string;
  kind: string;
  label: string;
  componentRef?: string;
  detailsMd?: string;
  firmwareCode?: string;
  testingMd?: string;
  metadata?: string;
}

export interface ConnectionBulkCreate {
  projectId: string;
  fromModuleId: string;
  toModuleId: string;
  type: string;
  label?: string;
  metadata?: string;
}

/**
 * Bulk operations for orchestrator pipeline optimization
 */
export class BulkOperations {
  /**
   * Replace N+1 BOM items creation with single transaction
   */
  static async replaceBomItems(projectId: string, items: Omit<BomItemBulkCreate, 'projectId'>[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Delete existing items
      await tx.bomItem.deleteMany({
        where: { projectId }
      });

      // Bulk insert new items
      if (items.length > 0) {
        await tx.bomItem.createMany({
          data: items.map(item => ({
            ...item,
            projectId
          }))
        });
      }
    });
  }

  /**
   * Replace N+1 supplier links creation with single transaction
   */
  static async replaceSupplierLinks(projectId: string, links: Omit<SupplierLinkBulkCreate, 'projectId'>[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Delete existing links
      await tx.supplierLink.deleteMany({
        where: { projectId }
      });

      // Bulk insert new links
      if (links.length > 0) {
        await tx.supplierLink.createMany({
          data: links.map(link => ({
            ...link,
            projectId
          }))
        });
      }
    });
  }

  /**
   * Bulk create modules with optimized transaction
   */
  static async createModules(modules: ModuleBulkCreate[]): Promise<string[]> {
    if (modules.length === 0) return [];

    const results = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const module of modules) {
        const result = await tx.module.create({
          data: module,
          select: { id: true }
        });
        created.push(result.id);
      }
      return created;
    });

    return results;
  }

  /**
   * Bulk create connections with optimized transaction
   */
  static async createConnections(connections: ConnectionBulkCreate[]): Promise<string[]> {
    if (connections.length === 0) return [];

    const results = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const connection of connections) {
        const result = await tx.connection.create({
          data: connection,
          select: { id: true }
        });
        created.push(result.id);
      }
      return created;
    });

    return results;
  }

  /**
   * Bulk update firmware for modules
   */
  static async updateModuleFirmware(updates: { id: string; firmwareCode: string }[]): Promise<void> {
    if (updates.length === 0) return;

    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.module.update({
          where: { id: update.id },
          data: { firmwareCode: update.firmwareCode }
        });
      }
    });
  }

  /**
   * Get project with all related data in single query
   */
  static async getProjectWithFullContext(projectId: string) {
    return await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        modules: true,
        connections: true,
        bomItems: true,
        supplierLinks: true,
        promptRuns: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        audit: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });
  }

  /**
   * Get modules by project with firmware filtering
   */
  static async getModulesWithFirmware(projectId: string, kinds: string[] = []) {
    const where: any = {
      projectId,
      firmwareCode: { not: null }
    };

    if (kinds.length > 0) {
      where.kind = { in: kinds };
    }

    return await prisma.module.findMany({
      where,
      orderBy: { label: 'asc' }
    });
  }
}

export default BulkOperations;