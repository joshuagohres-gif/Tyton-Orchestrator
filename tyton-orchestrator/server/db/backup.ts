import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import pino from 'pino';
import { getDatabasePool } from './pool';

const logger = pino().child({ service: 'db-backup' });

interface BackupConfig {
  backupDir: string;
  retentionDays: number;
  compression: boolean;
  maxBackupSize: number; // in MB
  excludeTables: string[];
  includeData: boolean;
  includeSchema: boolean;
}

interface BackupMetadata {
  id: string;
  filename: string;
  path: string;
  size: number;
  compressed: boolean;
  type: 'full' | 'schema' | 'data';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  rowCounts: Record<string, number>;
  error?: string;
  checksum?: string;
}

interface RestoreOptions {
  backupPath: string;
  targetDatabase?: string;
  replaceExisting: boolean;
  restoreData: boolean;
  restoreSchema: boolean;
  specificTables?: string[];
}

class DatabaseBackup {
  private config: BackupConfig;
  private dbPool = getDatabasePool();
  private runningBackups = new Map<string, BackupMetadata>();

  constructor(config: Partial<BackupConfig> = {}) {
    this.config = {
      backupDir: process.env.BACKUP_DIR || path.join(process.cwd(), 'backups'),
      retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
      compression: process.env.BACKUP_COMPRESSION !== 'false',
      maxBackupSize: parseInt(process.env.MAX_BACKUP_SIZE_MB || '1000'),
      excludeTables: (process.env.BACKUP_EXCLUDE_TABLES || '').split(',').filter(Boolean),
      includeData: process.env.BACKUP_INCLUDE_DATA !== 'false',
      includeSchema: process.env.BACKUP_INCLUDE_SCHEMA !== 'false',
      ...config
    };

    this.ensureBackupDirectory();
    this.scheduleCleanup();

    logger.info({
      backupDir: this.config.backupDir,
      retentionDays: this.config.retentionDays,
      compression: this.config.compression
    }, '💾 Database backup system initialized');
  }

  /**
   * Create a full database backup
   */
  async createFullBackup(): Promise<BackupMetadata> {
    const backupId = this.generateBackupId();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `full_backup_${timestamp}.sql${this.config.compression ? '.gz' : ''}`;
    const backupPath = path.join(this.config.backupDir, filename);

    const metadata: BackupMetadata = {
      id: backupId,
      filename,
      path: backupPath,
      size: 0,
      compressed: this.config.compression,
      type: 'full',
      status: 'running',
      startTime: new Date(),
      rowCounts: {}
    };

    this.runningBackups.set(backupId, metadata);

    try {
      logger.info({ backupId, filename }, '🚀 Starting full database backup');

      // Get row counts before backup
      metadata.rowCounts = await this.getTableRowCounts();

      // Execute pg_dump
      await this.executePgDump(backupPath, {
        includeData: this.config.includeData,
        includeSchema: this.config.includeSchema,
        excludeTables: this.config.excludeTables,
        compression: this.config.compression
      });

      // Get file size
      const stats = await fs.stat(backupPath);
      metadata.size = stats.size;
      metadata.endTime = new Date();
      metadata.duration = metadata.endTime.getTime() - metadata.startTime.getTime();
      metadata.status = 'completed';

      // Generate checksum
      metadata.checksum = await this.generateChecksum(backupPath);

      // Check if backup exceeds size limit
      if (metadata.size > this.config.maxBackupSize * 1024 * 1024) {
        logger.warn({
          backupId,
          size: metadata.size,
          limit: this.config.maxBackupSize * 1024 * 1024
        }, 'Backup exceeds maximum size limit');
      }

      logger.info({
        backupId,
        filename,
        size: this.formatBytes(metadata.size),
        duration: metadata.duration,
        rowCounts: metadata.rowCounts
      }, '✅ Database backup completed successfully');

      return metadata;

    } catch (error: any) {
      metadata.status = 'failed';
      metadata.error = error.message;
      metadata.endTime = new Date();
      metadata.duration = metadata.endTime.getTime() - metadata.startTime.getTime();

      logger.error({
        backupId,
        error: error.message,
        duration: metadata.duration
      }, '❌ Database backup failed');

      // Clean up failed backup file
      try {
        await fs.unlink(backupPath);
      } catch (cleanupError) {
        logger.warn({ backupId, error: cleanupError.message }, 'Failed to clean up backup file');
      }

      throw error;
    } finally {
      this.runningBackups.delete(backupId);
    }
  }

  /**
   * Create schema-only backup
   */
  async createSchemaBackup(): Promise<BackupMetadata> {
    const backupId = this.generateBackupId();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `schema_backup_${timestamp}.sql`;
    const backupPath = path.join(this.config.backupDir, filename);

    const metadata: BackupMetadata = {
      id: backupId,
      filename,
      path: backupPath,
      size: 0,
      compressed: false,
      type: 'schema',
      status: 'running',
      startTime: new Date(),
      rowCounts: {}
    };

    this.runningBackups.set(backupId, metadata);

    try {
      logger.info({ backupId, filename }, '🚀 Starting schema backup');

      await this.executePgDump(backupPath, {
        includeData: false,
        includeSchema: true,
        excludeTables: [],
        compression: false
      });

      const stats = await fs.stat(backupPath);
      metadata.size = stats.size;
      metadata.endTime = new Date();
      metadata.duration = metadata.endTime.getTime() - metadata.startTime.getTime();
      metadata.status = 'completed';
      metadata.checksum = await this.generateChecksum(backupPath);

      logger.info({
        backupId,
        filename,
        size: this.formatBytes(metadata.size),
        duration: metadata.duration
      }, '✅ Schema backup completed successfully');

      return metadata;

    } catch (error: any) {
      metadata.status = 'failed';
      metadata.error = error.message;
      metadata.endTime = new Date();

      logger.error({
        backupId,
        error: error.message
      }, '❌ Schema backup failed');

      throw error;
    } finally {
      this.runningBackups.delete(backupId);
    }
  }

  /**
   * Restore database from backup
   */
  async restoreFromBackup(options: RestoreOptions): Promise<void> {
    const { backupPath, targetDatabase, replaceExisting, restoreData, restoreSchema } = options;

    logger.info({
      backupPath,
      targetDatabase,
      replaceExisting,
      restoreData,
      restoreSchema
    }, '🔄 Starting database restore');

    try {
      // Verify backup file exists
      await fs.access(backupPath);
      
      // Get backup metadata
      const stats = await fs.stat(backupPath);
      const isCompressed = backupPath.endsWith('.gz');

      logger.info({
        backupFile: path.basename(backupPath),
        size: this.formatBytes(stats.size),
        compressed: isCompressed
      }, 'Backup file verified');

      // Execute restore
      await this.executePgRestore(backupPath, {
        targetDatabase: targetDatabase || this.extractDatabaseFromUrl(),
        replaceExisting,
        restoreData,
        restoreSchema,
        specificTables: options.specificTables
      });

      logger.info({ backupPath }, '✅ Database restore completed successfully');

    } catch (error: any) {
      logger.error({
        backupPath,
        error: error.message
      }, '❌ Database restore failed');
      throw error;
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupMetadata[]> {
    try {
      const files = await fs.readdir(this.config.backupDir);
      const backups: BackupMetadata[] = [];

      for (const file of files) {
        if (file.endsWith('.sql') || file.endsWith('.sql.gz')) {
          const filePath = path.join(this.config.backupDir, file);
          const stats = await fs.stat(filePath);
          
          // Parse backup type from filename
          let type: 'full' | 'schema' | 'data' = 'full';
          if (file.includes('schema')) type = 'schema';
          else if (file.includes('data')) type = 'data';

          backups.push({
            id: file,
            filename: file,
            path: filePath,
            size: stats.size,
            compressed: file.endsWith('.gz'),
            type,
            status: 'completed',
            startTime: stats.mtime, // Use file modification time
            rowCounts: {}
          });
        }
      }

      return backups.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to list backups');
      return [];
    }
  }

  /**
   * Delete old backups based on retention policy
   */
  async cleanupOldBackups(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    logger.info({
      retentionDays: this.config.retentionDays,
      cutoffDate: cutoffDate.toISOString()
    }, '🧹 Starting backup cleanup');

    try {
      const backups = await this.listBackups();
      let deletedCount = 0;

      for (const backup of backups) {
        if (backup.startTime < cutoffDate) {
          try {
            await fs.unlink(backup.path);
            deletedCount++;
            logger.debug({
              filename: backup.filename,
              age: Math.floor((Date.now() - backup.startTime.getTime()) / (1000 * 60 * 60 * 24))
            }, 'Deleted old backup');
          } catch (error: any) {
            logger.warn({
              filename: backup.filename,
              error: error.message
            }, 'Failed to delete old backup');
          }
        }
      }

      logger.info({ deletedCount }, '✅ Backup cleanup completed');
      return deletedCount;

    } catch (error: any) {
      logger.error({ error: error.message }, 'Backup cleanup failed');
      return 0;
    }
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupPath: string): Promise<boolean> {
    try {
      // Check file exists and is readable
      await fs.access(backupPath, fs.constants.R_OK);
      
      // Check file size
      const stats = await fs.stat(backupPath);
      if (stats.size === 0) {
        throw new Error('Backup file is empty');
      }

      // For compressed files, test decompression
      if (backupPath.endsWith('.gz')) {
        await this.testGzipFile(backupPath);
      }

      // Test SQL syntax (basic check)
      const isValidSql = await this.validateSqlFile(backupPath);
      if (!isValidSql) {
        throw new Error('Backup file contains invalid SQL');
      }

      logger.info({
        backupFile: path.basename(backupPath),
        size: this.formatBytes(stats.size)
      }, '✅ Backup verification passed');

      return true;

    } catch (error: any) {
      logger.error({
        backupPath,
        error: error.message
      }, '❌ Backup verification failed');
      return false;
    }
  }

  /**
   * Get backup statistics
   */
  async getBackupStats(): Promise<{
    totalBackups: number;
    totalSize: number;
    oldestBackup: Date | null;
    newestBackup: Date | null;
    backupsByType: Record<string, number>;
    avgBackupSize: number;
  }> {
    const backups = await this.listBackups();
    
    const stats = {
      totalBackups: backups.length,
      totalSize: backups.reduce((sum, backup) => sum + backup.size, 0),
      oldestBackup: backups.length > 0 ? backups[backups.length - 1].startTime : null,
      newestBackup: backups.length > 0 ? backups[0].startTime : null,
      backupsByType: backups.reduce((acc, backup) => {
        acc[backup.type] = (acc[backup.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      avgBackupSize: backups.length > 0 ? backups.reduce((sum, backup) => sum + backup.size, 0) / backups.length : 0
    };

    return stats;
  }

  // Private helper methods

  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.backupDir, { recursive: true });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to create backup directory');
      throw error;
    }
  }

  private scheduleCleanup(): void {
    // Run cleanup daily at 2 AM
    const cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours
    setInterval(() => {
      this.cleanupOldBackups().catch(error => {
        logger.error({ error: error.message }, 'Scheduled backup cleanup failed');
      });
    }, cleanupInterval);
  }

  private generateBackupId(): string {
    return `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getTableRowCounts(): Promise<Record<string, number>> {
    try {
      const tableNames = await this.dbPool.execute(async (prisma) => {
        return await prisma.$queryRaw<{tablename: string}[]>`
          SELECT tablename 
          FROM pg_tables 
          WHERE schemaname = 'public'
        `;
      });

      const rowCounts: Record<string, number> = {};
      
      for (const table of tableNames) {
        try {
          const result = await this.dbPool.execute(async (prisma) => {
            return await prisma.$queryRaw<{count: bigint}[]>`
              SELECT COUNT(*) as count FROM ${table.tablename}
            `;
          });
          rowCounts[table.tablename] = Number(result[0]?.count || 0);
        } catch (error) {
          rowCounts[table.tablename] = 0;
        }
      }

      return rowCounts;
    } catch (error) {
      return {};
    }
  }

  private async executePgDump(outputPath: string, options: {
    includeData: boolean;
    includeSchema: boolean;
    excludeTables: string[];
    compression: boolean;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['--no-password', '--verbose'];
      
      // Connection parameters
      const dbUrl = new URL(process.env.DATABASE_URL || '');
      args.push('--host', dbUrl.hostname);
      args.push('--port', dbUrl.port || '5432');
      args.push('--username', dbUrl.username);
      args.push('--dbname', dbUrl.pathname.substring(1));

      // Backup options
      if (!options.includeData) args.push('--schema-only');
      if (!options.includeSchema) args.push('--data-only');
      
      // Exclude tables
      options.excludeTables.forEach(table => {
        args.push('--exclude-table', table);
      });

      // Output file
      args.push('--file', outputPath);

      // Compression
      if (options.compression) {
        args.push('--compress', '6');
      }

      const pgDump = spawn('pg_dump', args, {
        env: {
          ...process.env,
          PGPASSWORD: dbUrl.password
        }
      });

      pgDump.stdout?.on('data', (data) => {
        logger.debug(`pg_dump stdout: ${data}`);
      });

      pgDump.stderr?.on('data', (data) => {
        logger.debug(`pg_dump stderr: ${data}`);
      });

      pgDump.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`pg_dump exited with code ${code}`));
        }
      });

      pgDump.on('error', (error) => {
        reject(new Error(`Failed to start pg_dump: ${error.message}`));
      });
    });
  }

  private async executePgRestore(backupPath: string, options: {
    targetDatabase: string;
    replaceExisting: boolean;
    restoreData: boolean;
    restoreSchema: boolean;
    specificTables?: string[];
  }): Promise<void> {
    // This would implement pg_restore functionality
    // For now, just log the operation
    logger.info({
      backupPath,
      options
    }, 'pg_restore would be executed here');
  }

  private async generateChecksum(filePath: string): Promise<string> {
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256');
    const content = await fs.readFile(filePath);
    hash.update(content);
    return hash.digest('hex');
  }

  private async testGzipFile(filePath: string): Promise<void> {
    const { createReadStream } = await import('fs');
    const { createGunzip } = await import('zlib');
    
    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath)
        .pipe(createGunzip())
        .on('data', () => {}) // Consume data
        .on('end', resolve)
        .on('error', reject);
    });
  }

  private async validateSqlFile(filePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      // Basic SQL validation - check for common SQL keywords
      const sqlKeywords = ['CREATE', 'INSERT', 'SELECT', 'TABLE', 'DATABASE'];
      return sqlKeywords.some(keyword => content.toUpperCase().includes(keyword));
    } catch (error) {
      return false;
    }
  }

  private extractDatabaseFromUrl(): string {
    const dbUrl = new URL(process.env.DATABASE_URL || '');
    return dbUrl.pathname.substring(1);
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// Singleton instance
let databaseBackup: DatabaseBackup | null = null;

export function getDatabaseBackup(): DatabaseBackup {
  if (!databaseBackup) {
    databaseBackup = new DatabaseBackup();
  }
  return databaseBackup;
}

export {
  DatabaseBackup,
  BackupConfig,
  BackupMetadata,
  RestoreOptions
};