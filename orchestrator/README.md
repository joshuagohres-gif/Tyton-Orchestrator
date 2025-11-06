# Improved Creation Engine Pipeline

## Overview

This directory contains the **improved** Creation Engine pipeline implementation that fixes critical issues in the original pipeline.

## Critical Issues Fixed

### 1. ✅ Race Conditions & Data Corruption
**Problem:** Multiple concurrent pipeline runs could corrupt `data.json`  
**Solution:** Implemented `LockManager` with file-based locking
- Exclusive locks prevent concurrent writes
- Automatic stale lock detection and cleanup
- Graceful lock acquisition with timeout

### 2. ✅ No Resume/Retry Capability
**Problem:** Pipeline failures required complete restart from scratch  
**Solution:** Implemented `CheckpointManager` with stage-level checkpointing
- Automatic checkpoint after each successful stage
- Resume from last completed stage
- Integrity validation with checksums
- Automatic cleanup after successful completion

### 3. ✅ Missing Data Structure Validation
**Problem:** Undefined/malformed data caused runtime crashes  
**Solution:** Implemented `DataValidator` with comprehensive validation
- Pre-flight data structure validation
- Stage prerequisite validation
- Stage output validation
- Automatic data structure initialization

### 4. ✅ Context Not Persisted
**Problem:** Context lost on crash, no recovery possible  
**Solution:** Context saved in checkpoints after each stage
- Full context serialization
- Circular reference handling
- Restoration on resume

### 5. ✅ Artifacts Created But Files Don't Exist
**Problem:** Artifact URLs created but files never written to disk  
**Solution:** Implemented `ArtifactStorage` for actual file management
- Organized directory structure (`public/exports/{projectId}/`)
- Saves all artifacts (compatibility reports, firmware, wiring, CAD, simulation, docs)
- File size tracking and metadata
- Cleanup utilities

## Additional Improvements

### 🔧 Better Error Handling
- Enhanced error messages with context
- Failed stage tracking
- Graceful degradation
- Detailed error logs

### 🔧 Stage Timeouts
- Each stage has 5-minute timeout
- Prevents hung processes
- Clear timeout error messages

### 🔧 Atomic Operations
- Atomic data file writes using temp files
- UUID-based IDs (no collision risk)
- Checksum validation for data integrity

### 🔧 Resource Management
- Automatic cleanup of old checkpoints
- Stale lock removal
- Project artifact deletion

## Architecture

### Core Components

```
orchestrator/
├── pipeline-improved.js      # Main improved pipeline
├── lockManager.js           # File locking for concurrency
├── checkpointManager.js     # Stage checkpointing for resume
├── dataValidator.js         # Data structure validation
├── artifactStorage.js       # Physical file storage
└── pipeline.js              # Original (legacy, kept for reference)
```

### Data Flow

```
1. Lock Acquisition
   ↓
2. Data Validation
   ↓
3. Checkpoint Check (resume if exists)
   ↓
4. Stage Execution Loop
   ├─ Stage Prerequisites Validation
   ├─ Stage Execution (with timeout)
   ├─ Output Validation
   ├─ Context Update
   ├─ Checkpoint Save
   └─ Data Save (atomic)
   ↓
5. Run Completion
   ↓
6. Checkpoint Cleanup
   ↓
7. Lock Release
```

## Usage

### Basic Usage

```javascript
const ImprovedPipeline = require('./orchestrator/pipeline-improved');

const pipeline = new ImprovedPipeline();

// Execute a run
try {
  const result = await pipeline.executeRun('run_12345', {
    ownerId: 'api_server_1',
    forceRestart: false // Set true to ignore checkpoints
  });
  
  console.log('Pipeline completed:', result);
} catch (error) {
  console.error('Pipeline failed:', error.message);
  // Can retry with same runId to resume from checkpoint
}
```

### Resume After Failure

```javascript
// First attempt (fails at stage 5)
try {
  await pipeline.executeRun('run_abc', { ownerId: 'worker_1' });
} catch (error) {
  console.log('Failed at:', error.message);
}

// Second attempt (resumes from stage 5)
try {
  await pipeline.executeRun('run_abc', { ownerId: 'worker_1' });
  console.log('Successfully resumed and completed!');
} catch (error) {
  console.log('Still failed:', error.message);
}
```

### Force Restart

```javascript
// Ignore existing checkpoint and start from beginning
await pipeline.executeRun('run_xyz', {
  ownerId: 'worker_2',
  forceRestart: true
});
```

### Checkpoint Management

```javascript
const { checkpointManager } = pipeline;

// List all checkpoints
const checkpoints = await checkpointManager.listCheckpoints();
console.log('Active checkpoints:', checkpoints);

// Clean up old checkpoints (older than 7 days)
const cleaned = await checkpointManager.cleanupOldCheckpoints();
console.log(`Cleaned ${cleaned} old checkpoints`);

// Manually delete checkpoint
await checkpointManager.deleteCheckpoint('run_123');

// Export checkpoint for analysis
await checkpointManager.exportCheckpoint('run_123', '/tmp/checkpoint-debug.json');
```

### Lock Management

```javascript
const { lockManager } = pipeline;

// Check if data is locked
const isLocked = await lockManager.isLocked('data.json');

// Clean stale locks (older than 5 minutes)
const cleaned = await lockManager.cleanupStaleLocks();

// Manual lock/unlock (advanced)
await lockManager.acquireLock('my-resource', 'my-owner');
try {
  // ... protected operations ...
} finally {
  await lockManager.releaseLock('my-resource', 'my-owner');
}
```

### Artifact Management

```javascript
const { artifactStorage } = pipeline;

// List project artifacts
const artifacts = await artifactStorage.listProjectArtifacts('proj_123');
artifacts.forEach(a => {
  console.log(`${a.name}: ${a.size} bytes at ${a.url}`);
});

// Delete project artifacts
await artifactStorage.deleteProjectArtifacts('proj_123');
```

## File Locations

### Generated Files

```
project-root/
├── .locks/                          # Lock files
│   └── data.json.lock              # Active lock during pipeline run
├── .checkpoints/                    # Checkpoint files
│   ├── run_123.json                # Checkpoint for run_123
│   └── run_456.json                # Checkpoint for run_456
└── public/
    └── exports/                     # Artifact storage
        ├── proj_abc/
        │   ├── compatibility-report.json
        │   ├── firmware.txt
        │   ├── firmware/            # Firmware files directory
        │   ├── wiring.svg
        │   ├── netlist.json
        │   ├── enclosure.stl
        │   ├── enclosure-metadata.json
        │   ├── simulation-report.html
        │   ├── simulation-report.json
        │   ├── README.md
        │   ├── docs-metadata.json
        │   └── project.json         # Complete project summary
        └── proj_xyz/
            └── ...
```

### Temporary Files

- `.locks/*.lock` - Cleaned up automatically after 5 minutes
- `data.json.tmp` - Temporary file during atomic writes
- `.checkpoints/*.json` - Cleaned up after successful completion or after 7 days

## Error Handling

### Error Types

1. **Validation Errors**
   - Data structure missing required fields
   - Stage prerequisites not met
   - Invalid stage output
   - *Action*: Fix data structure or stage logic

2. **Lock Timeout**
   - Cannot acquire lock within 30 seconds
   - *Action*: Check for hung processes, clean stale locks

3. **Stage Timeout**
   - Stage doesn't complete within 5 minutes
   - *Action*: Investigate stage performance, increase timeout if needed

4. **Stage Execution Error**
   - Service module throws error
   - *Action*: Check service logs, fix service logic

### Recovery Strategies

```javascript
async function robustPipelineExecution(runId) {
  const MAX_RETRIES = 3;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${MAX_RETRIES}`);
      
      const result = await pipeline.executeRun(runId, {
        ownerId: `worker_${process.pid}`,
        forceRestart: attempt === MAX_RETRIES // Last attempt: force restart
      });
      
      console.log('Success!');
      return result;
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === MAX_RETRIES) {
        throw new Error(`Failed after ${MAX_RETRIES} attempts: ${error.message}`);
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
}
```

## Testing

### Unit Tests

```bash
# Test individual components
node orchestrator/test-lock-manager.js
node orchestrator/test-checkpoint-manager.js
node orchestrator/test-data-validator.js
node orchestrator/test-artifact-storage.js
```

### Integration Tests

```bash
# Test complete pipeline
node orchestrator/test-pipeline.js

# Test resume capability
node orchestrator/test-resume.js

# Test concurrent execution
node orchestrator/test-concurrency.js
```

## Performance Considerations

### Lock Contention
- Lock acquisition timeout: 30 seconds
- Stale lock timeout: 5 minutes
- Lock check interval: 100ms
- **Recommendation**: Run pipelines serially or use separate data files for parallel projects

### Checkpoint Overhead
- Checkpoint save: ~10-50ms per stage
- Checkpoint size: ~5-50KB depending on project complexity
- **Benefit**: Saves minutes-hours of recomputation on failure

### File I/O
- Data file read/write: ~10-100ms
- Artifact file write: ~1-100ms depending on size
- **Optimization**: Artifacts saved in parallel with data updates

## Migration from Original Pipeline

### 1. Update Imports

```javascript
// OLD
const CreationEnginePipeline = require('./orchestrator/pipeline');

// NEW
const ImprovedCreationEnginePipeline = require('./orchestrator/pipeline-improved');
```

### 2. Update Usage

```javascript
// OLD
const pipeline = new CreationEnginePipeline();
await pipeline.executeRun(runId);

// NEW
const pipeline = new ImprovedCreationEnginePipeline();
await pipeline.executeRun(runId, { 
  ownerId: 'api_server_1' 
});
```

### 3. Handle New Errors

```javascript
// OLD: Generic error
catch (error) {
  console.error('Pipeline failed:', error);
}

// NEW: Specific error types
catch (error) {
  if (error.message.includes('timeout')) {
    // Handle timeout
  } else if (error.message.includes('lock')) {
    // Handle lock error
  } else if (error.message.includes('validation')) {
    // Handle validation error
  } else {
    // Handle stage error (can resume)
  }
}
```

## Maintenance

### Regular Cleanup

```javascript
// Run periodically (e.g., daily cron job)
async function dailyMaintenance() {
  const pipeline = new ImprovedCreationEnginePipeline();
  
  // Clean old checkpoints
  const checkpoints = await pipeline.checkpointManager.cleanupOldCheckpoints(
    7 * 24 * 60 * 60 * 1000 // 7 days
  );
  console.log(`Cleaned ${checkpoints} old checkpoints`);
  
  // Clean stale locks
  const locks = await pipeline.lockManager.cleanupStaleLocks();
  console.log(`Cleaned ${locks} stale locks`);
}
```

### Monitoring

```javascript
async function monitorPipeline() {
  const pipeline = new ImprovedCreationEnginePipeline();
  
  // Check for stuck runs
  const data = await pipeline.loadData();
  const stuckRuns = data.creation_engine.runs.filter(run => {
    return run.status === 'running' && 
           Date.now() - run.startedAt > 30 * 60 * 1000; // 30 minutes
  });
  
  if (stuckRuns.length > 0) {
    console.warn(`Found ${stuckRuns.length} stuck runs:`, stuckRuns.map(r => r.id));
  }
  
  // Check checkpoint age
  const checkpoints = await pipeline.checkpointManager.listCheckpoints();
  const oldCheckpoints = checkpoints.filter(c => c.age > 24 * 60 * 60 * 1000);
  
  if (oldCheckpoints.length > 0) {
    console.warn(`Found ${oldCheckpoints.length} old checkpoints (>24h)`);
  }
}
```

## Troubleshooting

### Issue: Lock acquisition timeout

**Symptoms:** `Failed to acquire lock for data.json within 30000ms`

**Causes:**
1. Another process is running a pipeline
2. Previous process crashed while holding lock
3. High lock contention

**Solutions:**
```javascript
// 1. Check for stale locks
await pipeline.lockManager.cleanupStaleLocks();

// 2. Check for stuck runs
const data = await pipeline.loadData();
const runningRuns = data.creation_engine.runs.filter(r => r.status === 'running');
console.log('Running runs:', runningRuns);

// 3. Manually remove lock (if safe)
const fs = require('fs').promises;
await fs.unlink('.locks/data.json.lock');
```

### Issue: Checkpoint corruption

**Symptoms:** `Checkpoint run_123 failed integrity check`

**Causes:**
1. File system error during checkpoint save
2. Manual editing of checkpoint file
3. Disk full during save

**Solutions:**
```javascript
// Delete corrupted checkpoint and restart
await pipeline.checkpointManager.deleteCheckpoint('run_123');
await pipeline.executeRun('run_123', { forceRestart: true });
```

### Issue: Stage timeout

**Symptoms:** `Stage timeout after 300000ms`

**Causes:**
1. Stage is computationally expensive
2. External API call is slow
3. Service is hung

**Solutions:**
```javascript
// 1. Increase timeout (modify pipeline-improved.js)
async executeStage(stage, context, data) {
  const timeout = 600000; // 10 minutes instead of 5
  // ...
}

// 2. Check service performance
// Add logging to slow service

// 3. Resume from checkpoint after fixing service
await pipeline.executeRun('run_123'); // Will resume from last checkpoint
```

## Best Practices

1. **Always use ownerId**: Helps track which process holds locks
   ```javascript
   await pipeline.executeRun(runId, { ownerId: `api_${process.pid}` });
   ```

2. **Implement retry logic**: Network/service issues can be transient
   ```javascript
   // Use exponential backoff for retries
   ```

3. **Monitor checkpoint age**: Old checkpoints indicate stuck runs
   ```javascript
   // Alert if checkpoints >24h old
   ```

4. **Clean up periodically**: Prevent disk space issues
   ```javascript
   // Run daily maintenance script
   ```

5. **Validate before execution**: Check prerequisites before starting run
   ```javascript
   // Ensure project and run exist before calling executeRun
   ```

6. **Handle errors gracefully**: Don't lose user context
   ```javascript
   // Return checkpoint info in error response
   ```

## Future Improvements

- [ ] Parallel stage execution for independent stages
- [ ] Distributed locking for multi-server deployments (Redis)
- [ ] Database storage instead of JSON file
- [ ] Webhook notifications on stage completion
- [ ] Stage execution metrics and profiling
- [ ] Automatic rollback on failure
- [ ] Stage output caching (avoid recomputation)
- [ ] Priority queue for multiple concurrent runs
- [ ] Resource limits (CPU, memory) per stage

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review logs in console output
3. Export checkpoint for analysis
4. Check data.json structure

---

**Version:** 1.0.0  
**Last Updated:** 2025-11-05  
**Maintainer:** Tyton Engineering Team
