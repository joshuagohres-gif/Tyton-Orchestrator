import { PrismaClient } from "@prisma/client";
import pino from "pino";

const logger = pino().child({ service: 'libraryService' });

let _prisma: PrismaClient | undefined;

export function prisma() {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error']
    });
  }
  return _prisma;
}

export interface ComponentLibraryEntry {
  id: string;
  mpn: string;
  category?: string | null;
  value?: string | null;
  symbol?: string | null;
  footprint?: string | null;
  meta?: any;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Batch lookup components by MPN
 * Returns a Map for O(1) lookup by calling code
 */
export async function getLibraryByMpns(mpns: string[]): Promise<Map<string, ComponentLibraryEntry>> {
  const unique = Array.from(new Set(mpns.filter(Boolean)));
  if (!unique.length) return new Map();
  
  logger.debug({ mpnsCount: unique.length }, 'Looking up components by MPN');
  
  try {
    const rows = await prisma().componentLibrary.findMany({
      where: {
        mpn: {
          in: unique
        }
      }
    });
    
    const map = new Map<string, ComponentLibraryEntry>();
    for (const row of rows) {
      map.set(row.mpn, row);
    }
    
    logger.info({ 
      requested: unique.length, 
      found: map.size, 
      hitRate: (map.size / unique.length * 100).toFixed(1) + '%' 
    }, 'MPN lookup completed');
    
    return map;
  } catch (error) {
    logger.error({ error, mpnsCount: unique.length }, 'Failed to lookup components by MPN');
    return new Map(); // Graceful fallback
  }
}

/**
 * Add or update a component in the library
 */
export async function upsertComponentLibrary(data: {
  mpn: string;
  category?: string;
  value?: string;
  symbol?: string;
  footprint?: string;
  meta?: any;
}): Promise<ComponentLibraryEntry> {
  logger.debug({ mpn: data.mpn }, 'Upserting component library entry');
  
  return await prisma().componentLibrary.upsert({
    where: { mpn: data.mpn },
    update: {
      category: data.category,
      value: data.value,
      symbol: data.symbol,
      footprint: data.footprint,
      meta: data.meta,
      updatedAt: new Date()
    },
    create: {
      mpn: data.mpn,
      category: data.category,
      value: data.value,
      symbol: data.symbol,
      footprint: data.footprint,
      meta: data.meta
    }
  });
}

/**
 * Batch insert multiple components
 */
export async function batchUpsertComponents(
  components: Array<{
    mpn: string;
    category?: string;
    value?: string;
    symbol?: string;
    footprint?: string;
    meta?: any;
  }>
): Promise<number> {
  if (!components.length) return 0;
  
  logger.info({ count: components.length }, 'Batch upserting components');
  
  let upserted = 0;
  for (const component of components) {
    try {
      await upsertComponentLibrary(component);
      upserted++;
    } catch (error) {
      logger.warn({ error, mpn: component.mpn }, 'Failed to upsert component');
    }
  }
  
  logger.info({ upserted, total: components.length }, 'Batch upsert completed');
  return upserted;
}

/**
 * Search components by category
 */
export async function getComponentsByCategory(category: string): Promise<ComponentLibraryEntry[]> {
  return await prisma().componentLibrary.findMany({
    where: {
      category: {
        equals: category,
        mode: 'insensitive'
      }
    },
    orderBy: { mpn: 'asc' }
  });
}

/**
 * Get library statistics
 */
export async function getLibraryStats(): Promise<{
  totalComponents: number;
  categoryCounts: Record<string, number>;
  completeness: {
    withSymbol: number;
    withFootprint: number;
    withBoth: number;
  };
}> {
  const [totalComponents, categoryCounts, withSymbol, withFootprint, withBoth] = await Promise.all([
    prisma().componentLibrary.count(),
    prisma().componentLibrary.groupBy({
      by: ['category'],
      _count: { category: true }
    }),
    prisma().componentLibrary.count({
      where: { symbol: { not: null } }
    }),
    prisma().componentLibrary.count({
      where: { footprint: { not: null } }
    }),
    prisma().componentLibrary.count({
      where: { 
        AND: [
          { symbol: { not: null } },
          { footprint: { not: null } }
        ]
      }
    })
  ]);
  
  const categoryMap: Record<string, number> = {};
  for (const item of categoryCounts) {
    if (item.category) {
      categoryMap[item.category] = item._count.category;
    }
  }
  
  return {
    totalComponents,
    categoryCounts: categoryMap,
    completeness: {
      withSymbol,
      withFootprint,
      withBoth
    }
  };
}

/**
 * Close the Prisma connection (for testing/cleanup)
 */
export async function closePrismaConnection(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = undefined;
  }
}