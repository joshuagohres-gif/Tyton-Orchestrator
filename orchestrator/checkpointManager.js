const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Checkpoint Manager
 * Enables pipeline resume from last successful stage
 * Persists stage outputs and context to enable retry without recomputation
 */
class CheckpointManager {
  constructor(checkpointDir = '.checkpoints') {
    this.checkpointDir = path.join(__dirname, '..', checkpointDir);
  }

  /**
   * Initialize checkpoint directory
   */
  async initialize() {
    await fs.mkdir(this.checkpointDir, { recursive: true });
  }

  /**
   * Save checkpoint after successful stage completion
   * @param {string} runId - Pipeline run ID
   * @param {string} stageName - Stage that was completed
   * @param {object} context - Complete pipeline context
   * @param {object} stageOutput - Output from this specific stage
   */
  async saveCheckpoint(runId, stageName, context, stageOutput = {}) {
    await this.initialize();
    
    const checkpoint = {
      runId,
      stageName,
      timestamp: Date.now(),
      context: this.sanitizeContext(context),
      stageOutput,
      checksum: this.generateChecksum(context)
    };
    
    const checkpointFile = this.getCheckpointPath(runId);
    
    try {
      // Save checkpoint with atomic write
      const tempFile = `${checkpointFile}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(checkpoint, null, 2));
      await fs.rename(tempFile, checkpointFile);
      
      console.log(`💾 Checkpoint saved: ${runId} at stage ${stageName}`);
      return checkpoint;
    } catch (error) {
      console.error(`Failed to save checkpoint for ${runId}:`, error);
      throw error;
    }
  }

  /**
   * Load checkpoint for a run
   * @param {string} runId - Pipeline run ID
   * @returns {object|null} - Checkpoint data or null if not found
   */
  async loadCheckpoint(runId) {
    const checkpointFile = this.getCheckpointPath(runId);
    
    try {
      const content = await fs.readFile(checkpointFile, 'utf8');
      const checkpoint = JSON.parse(content);
      
      // Validate checkpoint integrity
      const currentChecksum = this.generateChecksum(checkpoint.context);
      if (checkpoint.checksum !== currentChecksum) {
        console.warn(`Checkpoint ${runId} failed integrity check`);
        return null;
      }
      
      console.log(`📂 Loaded checkpoint: ${runId} from stage ${checkpoint.stageName}`);
      return checkpoint;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // Checkpoint doesn't exist
      }
      console.error(`Error loading checkpoint for ${runId}:`, error);
      throw error;
    }
  }

  /**
   * Check if checkpoint exists for a run
   */
  async hasCheckpoint(runId) {
    const checkpointFile = this.getCheckpointPath(runId);
    try {
      await fs.access(checkpointFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the stage index from checkpoint
   * Returns the index of the last completed stage
   */
  getLastCompletedStageIndex(checkpoint, stages) {
    if (!checkpoint) return -1;
    
    const index = stages.findIndex(s => s.name === checkpoint.stageName);
    return index;
  }

  /**
   * Delete checkpoint (after successful completion or manual cleanup)
   */
  async deleteCheckpoint(runId) {
    const checkpointFile = this.getCheckpointPath(runId);
    
    try {
      await fs.unlink(checkpointFile);
      console.log(`🗑️  Checkpoint deleted: ${runId}`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return true; // Already deleted
      }
      console.error(`Error deleting checkpoint for ${runId}:`, error);
      return false;
    }
  }

  /**
   * List all checkpoints
   */
  async listCheckpoints() {
    await this.initialize();
    
    try {
      const files = await fs.readdir(this.checkpointDir);
      const checkpoints = [];
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const checkpointFile = path.join(this.checkpointDir, file);
        try {
          const content = await fs.readFile(checkpointFile, 'utf8');
          const checkpoint = JSON.parse(content);
          checkpoints.push({
            runId: checkpoint.runId,
            stageName: checkpoint.stageName,
            timestamp: checkpoint.timestamp,
            age: Date.now() - checkpoint.timestamp
          });
        } catch (error) {
          console.warn(`Failed to read checkpoint ${file}:`, error.message);
        }
      }
      
      return checkpoints;
    } catch (error) {
      console.error('Error listing checkpoints:', error);
      return [];
    }
  }

  /**
   * Clean up old checkpoints
   * @param {number} maxAge - Maximum age in milliseconds
   */
  async cleanupOldCheckpoints(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
    const checkpoints = await this.listCheckpoints();
    let cleaned = 0;
    
    for (const checkpoint of checkpoints) {
      if (checkpoint.age > maxAge) {
        await this.deleteCheckpoint(checkpoint.runId);
        cleaned++;
      }
    }
    
    console.log(`🧹 Cleaned ${cleaned} old checkpoints`);
    return cleaned;
  }

  /**
   * Get checkpoint file path
   */
  getCheckpointPath(runId) {
    return path.join(this.checkpointDir, `${runId}.json`);
  }

  /**
   * Sanitize context to remove circular references
   */
  sanitizeContext(context) {
    // Create a deep copy and remove problematic fields
    const sanitized = JSON.parse(JSON.stringify(context, (key, value) => {
      // Remove circular references and functions
      if (typeof value === 'function') return undefined;
      if (key === 'run' && value && typeof value === 'object') {
        // Store only essential run data
        return {
          id: value.id,
          projectId: value.projectId,
          status: value.status
        };
      }
      return value;
    }));
    
    return sanitized;
  }

  /**
   * Generate checksum for integrity verification
   */
  generateChecksum(data) {
    const content = JSON.stringify(data);
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Export checkpoint for debugging/analysis
   */
  async exportCheckpoint(runId, exportPath) {
    const checkpoint = await this.loadCheckpoint(runId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for run ${runId}`);
    }
    
    await fs.writeFile(exportPath, JSON.stringify(checkpoint, null, 2));
    console.log(`📤 Checkpoint exported to ${exportPath}`);
  }
}

module.exports = CheckpointManager;
