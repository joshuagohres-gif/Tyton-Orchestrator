import { PrismaClient } from '@prisma/client';
import { getDatabasePool } from './pool';
import pino from 'pino';
import fs from 'fs/promises';
import path from 'path';

const logger = pino().child({ service: 'db-seeding' });

interface SeedData {
  table: string;
  data: any[];
  dependencies?: string[];
  validate?: (item: any) => boolean;
  transform?: (item: any) => any;
}

interface SeedResult {
  table: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  duration: number;
}

interface SeedConfig {
  truncateFirst: boolean;
  batchSize: number;
  continueOnError: boolean;
  validateData: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

class DataSeeder {
  private dbPool = getDatabasePool();
  private config: SeedConfig;

  constructor(config: Partial<SeedConfig> = {}) {
    this.config = {
      truncateFirst: false,
      batchSize: 1000,
      continueOnError: true,
      validateData: true,
      logLevel: 'info',
      ...config
    };
  }

  /**
   * Seed database with provided data
   */
  async seedDatabase(seedData: SeedData[]): Promise<SeedResult[]> {
    logger.info({
      tables: seedData.length,
      config: this.config
    }, '🌱 Starting database seeding');

    // Sort by dependencies
    const sortedSeedData = this.sortByDependencies(seedData);
    const results: SeedResult[] = [];

    for (const seed of sortedSeedData) {
      try {
        const result = await this.seedTable(seed);
        results.push(result);

        if (this.config.logLevel === 'info') {
          logger.info({
            table: result.table,
            inserted: result.inserted,
            updated: result.updated,
            skipped: result.skipped,
            duration: result.duration
          }, `✅ Seeded table: ${result.table}`);
        }

      } catch (error: any) {
        const failedResult: SeedResult = {
          table: seed.table,
          inserted: 0,
          updated: 0,
          skipped: 0,
          errors: [error.message],
          duration: 0
        };

        results.push(failedResult);

        if (this.config.continueOnError) {
          logger.error({
            table: seed.table,
            error: error.message
          }, `❌ Failed to seed table: ${seed.table}, continuing...`);
        } else {
          logger.error({
            table: seed.table,
            error: error.message
          }, `❌ Failed to seed table: ${seed.table}, stopping`);
          break;
        }
      }
    }

    // Print summary
    const summary = {
      totalTables: results.length,
      successful: results.filter(r => r.errors.length === 0).length,
      failed: results.filter(r => r.errors.length > 0).length,
      totalInserted: results.reduce((sum, r) => sum + r.inserted, 0),
      totalUpdated: results.reduce((sum, r) => sum + r.updated, 0),
      totalSkipped: results.reduce((sum, r) => sum + r.skipped, 0),
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
    };

    logger.info(summary, '🌱 Database seeding completed');
    return results;
  }

  /**
   * Seed a single table
   */
  async seedTable(seedData: SeedData): Promise<SeedResult> {
    const startTime = Date.now();
    const result: SeedResult = {
      table: seedData.table,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      duration: 0
    };

    try {
      // Validate data if required
      if (this.config.validateData && seedData.validate) {
        seedData.data = seedData.data.filter(item => {
          const isValid = seedData.validate!(item);
          if (!isValid) result.skipped++;
          return isValid;
        });
      }

      // Transform data if transformer provided
      if (seedData.transform) {
        seedData.data = seedData.data.map(seedData.transform);
      }

      // Truncate table if required
      if (this.config.truncateFirst) {
        await this.truncateTable(seedData.table);
      }

      // Process data in batches
      const batches = this.chunkArray(seedData.data, this.config.batchSize);
      
      for (const batch of batches) {
        const batchResult = await this.processBatch(seedData.table, batch);
        result.inserted += batchResult.inserted;
        result.updated += batchResult.updated;
        result.skipped += batchResult.skipped;
        result.errors.push(...batchResult.errors);
      }

    } catch (error: any) {
      result.errors.push(error.message);
      throw error;
    } finally {
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Load seed data from JSON files
   */
  async loadSeedDataFromFiles(seedDir: string): Promise<SeedData[]> {
    const seedData: SeedData[] = [];
    
    try {
      const files = await fs.readdir(seedDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(seedDir, file);
        const tableName = path.basename(file, '.json');
        
        try {
          const fileContent = await fs.readFile(filePath, 'utf8');
          const data = JSON.parse(fileContent);
          
          seedData.push({
            table: tableName,
            data: Array.isArray(data) ? data : [data]
          });

          logger.debug({
            table: tableName,
            records: Array.isArray(data) ? data.length : 1
          }, `Loaded seed data from ${file}`);

        } catch (error: any) {
          logger.warn({
            file,
            error: error.message
          }, `Failed to load seed data from ${file}`);
        }
      }

    } catch (error: any) {
      logger.error({
        seedDir,
        error: error.message
      }, 'Failed to load seed data from directory');
    }

    return seedData;
  }

  /**
   * Generate sample data for testing
   */
  generateSampleData(): SeedData[] {
    const now = new Date();
    
    return [
      {
        table: 'User',
        data: [
          {
            id: 'user_001',
            email: 'admin@tyton.dev',
            passwordHash: '$2b$10$example.hash.for.password123',
            roles: '["admin", "user"]',
            createdAt: now,
            updatedAt: now
          },
          {
            id: 'user_002', 
            email: 'developer@tyton.dev',
            passwordHash: '$2b$10$example.hash.for.password456',
            roles: '["user"]',
            createdAt: now,
            updatedAt: now
          }
        ]
      },
      {
        table: 'Project',
        dependencies: ['User'],
        data: [
          {
            id: 'proj_001',
            title: 'IoT Sensor Array',
            description: 'Multi-sensor environmental monitoring system with wireless connectivity',
            status: 'active',
            llmBudget: 50.0,
            createdAt: now,
            updatedAt: now
          },
          {
            id: 'proj_002',
            title: 'Smart Home Controller',
            description: 'Central hub for home automation with voice control',
            status: 'draft',
            llmBudget: 25.0,
            createdAt: now,
            updatedAt: now
          }
        ]
      },
      {
        table: 'ComponentLibrary',
        data: [
          {
            id: 'comp_001',
            mpn: 'ESP32-WROOM-32',
            category: 'Microcontroller',
            symbol: 'RF_Module:ESP32-WROOM-32',
            footprint: 'RF_Module:ESP32-WROOM-32',
            meta: {
              manufacturer: 'Espressif',
              description: '2.4 GHz Wi-Fi and Bluetooth combo chip',
              voltage: '3.3V',
              pins: 38
            },
            createdAt: now,
            updatedAt: now
          },
          {
            id: 'comp_002',
            mpn: 'R0603-10K',
            category: 'Resistor',
            value: '10K',
            symbol: 'Device:R_Small',
            footprint: 'Resistor_SMD:R_0603_1608Metric',
            meta: {
              tolerance: '1%',
              power: '0.1W',
              package: '0603'
            },
            createdAt: now,
            updatedAt: now
          },
          {
            id: 'comp_003',
            mpn: 'C0603-100N',
            category: 'Capacitor',
            value: '100nF',
            symbol: 'Device:C_Small',
            footprint: 'Capacitor_SMD:C_0603_1608Metric',
            meta: {
              voltage: '50V',
              dielectric: 'X7R',
              package: '0603'
            },
            createdAt: now,
            updatedAt: now
          }
        ]
      },
      {
        table: 'Module',
        dependencies: ['Project'],
        data: [
          {
            id: 'mod_001',
            projectId: 'proj_001',
            kind: 'microcontroller',
            label: 'Main Controller',
            componentRef: 'ESP32-WROOM-32',
            detailsMd: 'Main processing unit for sensor data collection and wireless communication',
            metadata: JSON.stringify({
              power: '3.3V',
              interfaces: ['I2C', 'SPI', 'UART', 'WiFi', 'Bluetooth']
            })
          },
          {
            id: 'mod_002',
            projectId: 'proj_001',
            kind: 'sensor',
            label: 'Temperature Sensor',
            componentRef: 'DHT22',
            detailsMd: 'Digital temperature and humidity sensor',
            metadata: JSON.stringify({
              accuracy: '±0.5°C',
              range: '-40 to 125°C',
              interface: 'Single Wire'
            })
          }
        ]
      }
    ];
  }

  /**
   * Export current database data to seed files
   */
  async exportToSeedFiles(outputDir: string, tables?: string[]): Promise<void> {
    logger.info({ outputDir, tables }, '📤 Exporting database to seed files');

    try {
      await fs.mkdir(outputDir, { recursive: true });

      const tablesToExport = tables || await this.getAllTableNames();

      for (const table of tablesToExport) {
        try {
          const data = await this.exportTableData(table);
          const filePath = path.join(outputDir, `${table}.json`);
          
          await fs.writeFile(
            filePath, 
            JSON.stringify(data, null, 2),
            'utf8'
          );

          logger.info({
            table,
            records: data.length,
            file: filePath
          }, `Exported ${table} data`);

        } catch (error: any) {
          logger.error({
            table,
            error: error.message
          }, `Failed to export ${table} data`);
        }
      }

    } catch (error: any) {
      logger.error({
        outputDir,
        error: error.message
      }, 'Failed to export seed data');
      throw error;
    }
  }

  /**
   * Validate seed data integrity
   */
  async validateSeedData(seedData: SeedData[]): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(seedData);
    if (circularDeps.length > 0) {
      errors.push(`Circular dependencies detected: ${circularDeps.join(' -> ')}`);
    }

    // Validate each table's data
    for (const seed of seedData) {
      // Check for required fields
      if (!seed.table || !seed.data) {
        errors.push(`Missing required fields for seed data: ${seed.table}`);
        continue;
      }

      // Check data format
      if (!Array.isArray(seed.data)) {
        errors.push(`Data for ${seed.table} must be an array`);
        continue;
      }

      // Check for empty data
      if (seed.data.length === 0) {
        warnings.push(`No data provided for table ${seed.table}`);
      }

      // Validate data consistency
      if (seed.data.length > 0) {
        const firstItem = seed.data[0];
        const expectedKeys = Object.keys(firstItem);

        for (let i = 1; i < seed.data.length; i++) {
          const currentKeys = Object.keys(seed.data[i]);
          const missingKeys = expectedKeys.filter(key => !currentKeys.includes(key));
          const extraKeys = currentKeys.filter(key => !expectedKeys.includes(key));

          if (missingKeys.length > 0 || extraKeys.length > 0) {
            warnings.push(`Inconsistent data structure in ${seed.table} at index ${i}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Private helper methods

  private async processBatch(table: string, batch: any[]): Promise<{
    inserted: number;
    updated: number; 
    skipped: number;
    errors: string[];
  }> {
    const result = {
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      await this.dbPool.transaction(async (prisma) => {
        for (const item of batch) {
          try {
            // Use upsert to handle conflicts
            const model = (prisma as any)[table];
            if (model?.upsert) {
              await model.upsert({
                where: { id: item.id },
                update: item,
                create: item
              });
              result.inserted++;
            } else {
              // Fallback to create
              await model.create({ data: item });
              result.inserted++;
            }
          } catch (error: any) {
            result.errors.push(`${table}[${item.id || 'unknown'}]: ${error.message}`);
            result.skipped++;
          }
        }
      });

    } catch (error: any) {
      result.errors.push(`Batch processing failed: ${error.message}`);
    }

    return result;
  }

  private async truncateTable(table: string): Promise<void> {
    await this.dbPool.execute(async (prisma) => {
      return await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
    });
  }

  private async getAllTableNames(): Promise<string[]> {
    const result = await this.dbPool.execute(async (prisma) => {
      return await prisma.$queryRaw<{tablename: string}[]>`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
      `;
    });

    return result.map(r => r.tablename);
  }

  private async exportTableData(table: string): Promise<any[]> {
    return await this.dbPool.execute(async (prisma) => {
      return await prisma.$queryRawUnsafe(`SELECT * FROM "${table}" ORDER BY "createdAt" DESC`);
    });
  }

  private sortByDependencies(seedData: SeedData[]): SeedData[] {
    const sorted: SeedData[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (table: string, seed: SeedData) => {
      if (visited.has(table)) return;
      if (visiting.has(table)) {
        throw new Error(`Circular dependency detected: ${table}`);
      }

      visiting.add(table);

      // Visit dependencies first
      if (seed.dependencies) {
        for (const dep of seed.dependencies) {
          const depSeed = seedData.find(s => s.table === dep);
          if (depSeed) {
            visit(dep, depSeed);
          }
        }
      }

      visiting.delete(table);
      visited.add(table);
      sorted.push(seed);
    };

    for (const seed of seedData) {
      visit(seed.table, seed);
    }

    return sorted;
  }

  private detectCircularDependencies(seedData: SeedData[]): string[] {
    const visiting = new Set<string>();
    const path: string[] = [];

    const visit = (table: string, seed: SeedData): string[] | null => {
      if (visiting.has(table)) {
        const cycleStart = path.indexOf(table);
        return path.slice(cycleStart);
      }

      visiting.add(table);
      path.push(table);

      if (seed.dependencies) {
        for (const dep of seed.dependencies) {
          const depSeed = seedData.find(s => s.table === dep);
          if (depSeed) {
            const cycle = visit(dep, depSeed);
            if (cycle) return cycle;
          }
        }
      }

      visiting.delete(table);
      path.pop();
      return null;
    };

    for (const seed of seedData) {
      if (!visiting.has(seed.table)) {
        const cycle = visit(seed.table, seed);
        if (cycle) return cycle;
      }
    }

    return [];
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Factory functions
export function createDataSeeder(config?: Partial<SeedConfig>): DataSeeder {
  return new DataSeeder(config);
}

export {
  DataSeeder,
  SeedData,
  SeedResult,
  SeedConfig
};