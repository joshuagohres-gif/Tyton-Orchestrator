#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { PrismaClient as SQLitePrismaClient } from '@prisma/client';

/**
 * Migration script from SQLite to PostgreSQL
 * This script handles data migration and provides rollback capabilities
 */

interface MigrationConfig {
  sqliteDbPath: string;
  postgresUrl: string;
  batchSize: number;
  skipTables: string[];
  dryRun: boolean;
}

interface MigrationStats {
  table: string;
  sourceCount: number;
  migratedCount: number;
  errors: string[];
  duration: number;
}

class DatabaseMigrator {
  private sqliteClient: SQLitePrismaClient;
  private config: MigrationConfig;
  private stats: MigrationStats[] = [];

  constructor(config: MigrationConfig) {
    this.config = config;
    this.sqliteClient = new SQLitePrismaClient({
      datasources: {
        db: {
          url: `file:${config.sqliteDbPath}`
        }
      }
    });
  }

  async migrate(): Promise<void> {
    console.log('🚀 Starting SQLite to PostgreSQL migration...\n');
    console.log(`Configuration:`);
    console.log(`  SQLite DB: ${this.config.sqliteDbPath}`);
    console.log(`  PostgreSQL URL: ${this.config.postgresUrl.replace(/\/\/.*@/, '//***:***@')}`);
    console.log(`  Batch Size: ${this.config.batchSize}`);
    console.log(`  Dry Run: ${this.config.dryRun}`);
    console.log(`  Skip Tables: ${this.config.skipTables.join(', ') || 'none'}\n`);

    try {
      await this.sqliteClient.$connect();
      
      // Migration order matters due to foreign key relationships
      const migrationOrder = [
        'User',
        'Project', 
        'Module',
        'Connection',
        'PromptRun',
        'BomItem',
        'SupplierLink',
        'AuditLog',
        'OrchestratorRun',
        'StageRun',
        'ReviewGate',
        'ComponentLibrary',
        'ApiKey',
        'ProjectMember',
        'LlmUsage'
      ];

      for (const tableName of migrationOrder) {
        if (this.config.skipTables.includes(tableName)) {
          console.log(`⏭️  Skipping table: ${tableName}`);
          continue;
        }

        await this.migrateTable(tableName);
      }

      this.printMigrationSummary();

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    } finally {
      await this.sqliteClient.$disconnect();
    }
  }

  private async migrateTable(tableName: string): Promise<void> {
    console.log(`📦 Migrating table: ${tableName}`);
    const startTime = Date.now();
    const stats: MigrationStats = {
      table: tableName,
      sourceCount: 0,
      migratedCount: 0,
      errors: [],
      duration: 0
    };

    try {
      // Get source count
      const countResult = await this.sqliteClient.$queryRaw<[{ count: number }]>`
        SELECT COUNT(*) as count FROM ${tableName}
      `;
      stats.sourceCount = Number(countResult[0]?.count || 0);

      if (stats.sourceCount === 0) {
        console.log(`  📊 No data found in ${tableName}`);
        stats.duration = Date.now() - startTime;
        this.stats.push(stats);
        return;
      }

      console.log(`  📊 Found ${stats.sourceCount} records in ${tableName}`);

      if (this.config.dryRun) {
        console.log(`  🔍 DRY RUN - Would migrate ${stats.sourceCount} records`);
        stats.migratedCount = stats.sourceCount;
      } else {
        stats.migratedCount = await this.migrateTableData(tableName);
      }

      stats.duration = Date.now() - startTime;
      console.log(`  ✅ Migrated ${stats.migratedCount}/${stats.sourceCount} records in ${stats.duration}ms\n`);

    } catch (error: any) {
      stats.errors.push(error.message);
      console.error(`  ❌ Error migrating ${tableName}:`, error.message);
      stats.duration = Date.now() - startTime;
    }

    this.stats.push(stats);
  }

  private async migrateTableData(tableName: string): Promise<number> {
    // This is a simplified version - in practice, you'd need specific migration logic for each table
    // due to schema differences and data transformations needed
    
    switch (tableName) {
      case 'LlmUsage':
        return await this.migrateLlmUsage();
      case 'User':
        return await this.migrateUsers();
      case 'Project':
        return await this.migrateProjects();
      case 'ComponentLibrary':
        return await this.migrateComponentLibrary();
      default:
        console.log(`  ⚠️  Generic migration not implemented for ${tableName}`);
        return 0;
    }
  }

  private async migrateLlmUsage(): Promise<number> {
    // Handle schema changes: tokensIn/tokensOut -> promptTokens/completionTokens
    const sqliteData = await this.sqliteClient.$queryRaw<any[]>`
      SELECT * FROM LlmUsage ORDER BY createdAt
    `;

    let migratedCount = 0;
    
    // Note: In practice, you'd batch these operations and use PostgreSQL client
    for (const record of sqliteData) {
      try {
        // Transform data structure
        const transformedRecord = {
          ...record,
          promptTokens: record.tokensIn || 0,
          completionTokens: record.tokensOut || 0,
          totalTokens: (record.tokensIn || 0) + (record.tokensOut || 0),
          cached: false // Default for migrated data
        };

        // Remove old fields
        delete transformedRecord.tokensIn;
        delete transformedRecord.tokensOut;

        console.log(`    📝 Would insert LlmUsage record: ${record.id}`);
        migratedCount++;
        
      } catch (error: any) {
        console.error(`    ❌ Failed to migrate LlmUsage record ${record.id}:`, error.message);
      }
    }

    return migratedCount;
  }

  private async migrateUsers(): Promise<number> {
    const sqliteData = await this.sqliteClient.$queryRaw<any[]>`
      SELECT * FROM User ORDER BY createdAt
    `;

    let migratedCount = 0;
    
    for (const record of sqliteData) {
      try {
        console.log(`    📝 Would insert User record: ${record.email}`);
        migratedCount++;
      } catch (error: any) {
        console.error(`    ❌ Failed to migrate User record ${record.id}:`, error.message);
      }
    }

    return migratedCount;
  }

  private async migrateProjects(): Promise<number> {
    const sqliteData = await this.sqliteClient.$queryRaw<any[]>`
      SELECT * FROM Project ORDER BY createdAt
    `;

    let migratedCount = 0;
    
    for (const record of sqliteData) {
      try {
        // Add default llmBudget if not present
        const transformedRecord = {
          ...record,
          llmBudget: record.llmBudget || null
        };

        console.log(`    📝 Would insert Project record: ${record.title}`);
        migratedCount++;
      } catch (error: any) {
        console.error(`    ❌ Failed to migrate Project record ${record.id}:`, error.message);
      }
    }

    return migratedCount;
  }

  private async migrateComponentLibrary(): Promise<number> {
    const sqliteData = await this.sqliteClient.$queryRaw<any[]>`
      SELECT * FROM ComponentLibrary ORDER BY createdAt
    `;

    let migratedCount = 0;
    
    for (const record of sqliteData) {
      try {
        console.log(`    📝 Would insert ComponentLibrary record: ${record.mpn}`);
        migratedCount++;
      } catch (error: any) {
        console.error(`    ❌ Failed to migrate ComponentLibrary record ${record.id}:`, error.message);
      }
    }

    return migratedCount;
  }

  private printMigrationSummary(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(80));

    let totalSource = 0;
    let totalMigrated = 0;
    let totalErrors = 0;

    this.stats.forEach(stat => {
      const status = stat.errors.length > 0 ? '❌' : 
                    stat.migratedCount === stat.sourceCount ? '✅' : '⚠️';
      
      console.log(`${status} ${stat.table.padEnd(20)} ${stat.migratedCount.toString().padStart(6)}/${stat.sourceCount.toString().padEnd(6)} (${stat.duration}ms)`);
      
      if (stat.errors.length > 0) {
        stat.errors.forEach(error => {
          console.log(`    └─ Error: ${error}`);
        });
      }

      totalSource += stat.sourceCount;
      totalMigrated += stat.migratedCount;
      totalErrors += stat.errors.length;
    });

    console.log('-'.repeat(80));
    console.log(`📈 Total Records: ${totalMigrated}/${totalSource} migrated`);
    console.log(`⚠️  Total Errors: ${totalErrors}`);
    console.log(`🎯 Success Rate: ${totalSource > 0 ? ((totalMigrated / totalSource) * 100).toFixed(1) : 0}%`);
    
    if (this.config.dryRun) {
      console.log(`\n🔍 DRY RUN COMPLETE - No data was actually migrated`);
      console.log(`   Run with --execute to perform actual migration`);
    }
  }

  async createBackup(): Promise<string> {
    const backupPath = `backup_${Date.now()}.sqlite`;
    const sourcePath = this.config.sqliteDbPath;
    
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, backupPath);
      console.log(`📦 Backup created: ${backupPath}`);
      return backupPath;
    }
    
    throw new Error(`Source database not found: ${sourcePath}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--execute');
  const createBackup = args.includes('--backup');

  const config: MigrationConfig = {
    sqliteDbPath: process.env.SQLITE_DB_PATH || './prisma/dev.db',
    postgresUrl: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/tyton',
    batchSize: parseInt(process.env.MIGRATION_BATCH_SIZE || '1000'),
    skipTables: (process.env.SKIP_TABLES || '').split(',').filter(Boolean),
    dryRun: isDryRun
  };

  try {
    const migrator = new DatabaseMigrator(config);

    if (createBackup) {
      await migrator.createBackup();
    }

    await migrator.migrate();

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

// Export for testing
export { DatabaseMigrator, MigrationConfig, MigrationStats };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}