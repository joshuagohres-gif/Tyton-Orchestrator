const fs = require('fs').promises;
const path = require('path');

/**
 * File Locking Manager
 * Prevents race conditions when multiple pipeline runs access data.json simultaneously
 * Uses a simple lock file approach with timeout and stale lock detection
 */
class LockManager {
  constructor(lockDir = '.locks') {
    this.lockDir = path.join(__dirname, '..', lockDir);
    this.maxLockAge = 300000; // 5 minutes - locks older than this are considered stale
    this.lockCheckInterval = 100; // Check every 100ms
    this.maxWaitTime = 30000; // Wait up to 30 seconds for lock
  }

  /**
   * Initialize lock directory
   */
  async initialize() {
    try {
      await fs.mkdir(this.lockDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create lock directory:', error);
      throw error;
    }
  }

  /**
   * Acquire lock for a resource
   * @param {string} resourceId - Unique identifier for the resource
   * @param {string} ownerId - ID of the process acquiring the lock
   * @returns {Promise<boolean>} - true if lock acquired
   */
  async acquireLock(resourceId, ownerId) {
    await this.initialize();
    
    const lockFile = path.join(this.lockDir, `${resourceId}.lock`);
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.maxWaitTime) {
      try {
        // Try to read existing lock
        const existingLock = await this.readLock(lockFile);
        
        if (existingLock) {
          // Check if lock is stale
          if (Date.now() - existingLock.acquiredAt > this.maxLockAge) {
            console.warn(`Removing stale lock for ${resourceId} from ${existingLock.ownerId}`);
            await this.releaseLock(resourceId, existingLock.ownerId);
          } else {
            // Lock is valid, wait and retry
            await this.sleep(this.lockCheckInterval);
            continue;
          }
        }
        
        // Try to acquire lock
        const lockData = {
          resourceId,
          ownerId,
          acquiredAt: Date.now(),
          pid: process.pid
        };
        
        // Use exclusive flag to prevent race conditions
        await fs.writeFile(
          lockFile, 
          JSON.stringify(lockData, null, 2),
          { flag: 'wx' } // Write exclusive - fails if file exists
        );
        
        console.log(`🔒 Lock acquired for ${resourceId} by ${ownerId}`);
        return true;
        
      } catch (error) {
        if (error.code === 'EEXIST') {
          // Lock file was created by another process, wait and retry
          await this.sleep(this.lockCheckInterval);
          continue;
        }
        throw error;
      }
    }
    
    throw new Error(
      `Failed to acquire lock for ${resourceId} within ${this.maxWaitTime}ms. ` +
      `Resource may be locked by another process.`
    );
  }

  /**
   * Release lock for a resource
   * @param {string} resourceId - Resource identifier
   * @param {string} ownerId - Owner who acquired the lock
   */
  async releaseLock(resourceId, ownerId) {
    const lockFile = path.join(this.lockDir, `${resourceId}.lock`);
    
    try {
      // Verify ownership before releasing
      const existingLock = await this.readLock(lockFile);
      
      if (existingLock && existingLock.ownerId !== ownerId) {
        console.warn(
          `Cannot release lock for ${resourceId}: owned by ${existingLock.ownerId}, ` +
          `not ${ownerId}`
        );
        return false;
      }
      
      await fs.unlink(lockFile);
      console.log(`🔓 Lock released for ${resourceId} by ${ownerId}`);
      return true;
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Lock file doesn't exist, already released
        return true;
      }
      console.error(`Error releasing lock for ${resourceId}:`, error);
      throw error;
    }
  }

  /**
   * Execute a function with a lock
   * Automatically acquires and releases lock
   */
  async withLock(resourceId, ownerId, fn) {
    let lockAcquired = false;
    
    try {
      lockAcquired = await this.acquireLock(resourceId, ownerId);
      return await fn();
    } finally {
      if (lockAcquired) {
        await this.releaseLock(resourceId, ownerId);
      }
    }
  }

  /**
   * Read lock data from file
   */
  async readLock(lockFile) {
    try {
      const content = await fs.readFile(lockFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if resource is locked
   */
  async isLocked(resourceId) {
    const lockFile = path.join(this.lockDir, `${resourceId}.lock`);
    const lock = await this.readLock(lockFile);
    
    if (!lock) return false;
    
    // Check if lock is stale
    if (Date.now() - lock.acquiredAt > this.maxLockAge) {
      return false;
    }
    
    return true;
  }

  /**
   * Clean up stale locks
   */
  async cleanupStaleLocks() {
    await this.initialize();
    
    try {
      const files = await fs.readdir(this.lockDir);
      let cleaned = 0;
      
      for (const file of files) {
        if (!file.endsWith('.lock')) continue;
        
        const lockFile = path.join(this.lockDir, file);
        const lock = await this.readLock(lockFile);
        
        if (lock && Date.now() - lock.acquiredAt > this.maxLockAge) {
          await fs.unlink(lockFile);
          console.log(`Cleaned stale lock: ${file}`);
          cleaned++;
        }
      }
      
      return cleaned;
    } catch (error) {
      console.error('Error cleaning stale locks:', error);
      return 0;
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = LockManager;
