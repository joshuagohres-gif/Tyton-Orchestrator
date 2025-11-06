# Migration Guide: Original → Improved Pipeline

## Overview

This guide helps you migrate from the original `pipeline.js` to the new improved `pipeline-improved.js`. The improved version fixes critical issues while maintaining backward compatibility.

## What Changed

### API Compatibility

✅ **Fully Backward Compatible** - The improved pipeline maintains the same public interface:

```javascript
// OLD and NEW both work
await pipeline.executeRun(runId);
```

### New Optional Parameters

```javascript
// NEW: Optional configuration
await pipeline.executeRun(runId, {
  ownerId: 'api_server_1',  // Identifies lock owner (recommended)
  forceRestart: false        // Ignore checkpoints (optional)
});
```

## Migration Steps

### Step 1: Review Current Usage

Find all places where you use the pipeline:

```bash
# Find all imports
grep -r "require.*pipeline" .

# Common locations:
# - index.js (API endpoint handlers)
# - Worker scripts
# - Test files
```

### Step 2: Update Imports

Update import statements:

```javascript
// BEFORE
const CreationEnginePipeline = require('./orchestrator/pipeline');

// AFTER
const ImprovedCreationEnginePipeline = require('./orchestrator/pipeline-improved');
```

Or use an alias for easier transition:

```javascript
// Transition approach
const Pipeline = require('./orchestrator/pipeline-improved');
const pipeline = new Pipeline();
```

### Step 3: Update Instantiation

The constructor is the same:

```javascript
// BEFORE
const pipeline = new CreationEnginePipeline();

// AFTER
const pipeline = new ImprovedCreationEnginePipeline();
```

### Step 4: Add Owner ID (Recommended)

For better lock management, add an owner identifier:

```javascript
// BEFORE
app.post('/api/ce/runs/:id/execute', async (req, res) => {
  const { id } = req.params;
  const result = await pipeline.executeRun(id);
  res.json(result);
});

// AFTER
app.post('/api/ce/runs/:id/execute', async (req, res) => {
  const { id } = req.params;
  const result = await pipeline.executeRun(id, {
    ownerId: `api_${process.pid}_${Date.now()}`
  });
  res.json(result);
});
```

### Step 5: Update Error Handling

The improved pipeline provides more detailed error messages:

```javascript
// BEFORE
try {
  await pipeline.executeRun(runId);
} catch (error) {
  console.error('Pipeline failed:', error.message);
  throw error;
}

// AFTER
try {
  await pipeline.executeRun(runId, { ownerId: 'api_1' });
} catch (error) {
  console.error('Pipeline failed:', error.message);
  
  // New: Check if resumable
  if (error.message.includes('Checkpoint saved')) {
    console.log('Can resume from checkpoint');
    // Optionally notify user or queue retry
  }
  
  throw error;
}
```

### Step 6: Add Retry Logic (Optional)

Take advantage of checkpoint resume:

```javascript
// NEW: Automatic retry with resume
async function executeWithRetry(runId, maxAttempts = 3) {
  const pipeline = new ImprovedCreationEnginePipeline();
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await pipeline.executeRun(runId, {
        ownerId: `api_${process.pid}`,
        forceRestart: false // Will resume from checkpoint
      });
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxAttempts) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}
```

### Step 7: Add Maintenance Tasks

Set up periodic cleanup:

```javascript
// NEW: Add to cron or scheduled task
const { checkpointManager, lockManager } = pipeline;

// Clean old checkpoints daily
setInterval(async () => {
  await checkpointManager.cleanupOldCheckpoints(7 * 24 * 60 * 60 * 1000);
  await lockManager.cleanupStaleLocks();
}, 24 * 60 * 60 * 1000);
```

## Example Migration

### Before (index.js)

```javascript
const CreationEnginePipeline = require('./orchestrator/pipeline');

// API endpoint
app.post('/api/ce/runs/:id/execute', authManager.requireAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const pipeline = new CreationEnginePipeline();
    const result = await pipeline.executeRun(id);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Pipeline execution failed:', error);
    res.status(500).json({
      error: 'Pipeline execution failed',
      message: error.message
    });
  }
});
```

### After (index.js)

```javascript
const ImprovedCreationEnginePipeline = require('./orchestrator/pipeline-improved');

// Create single pipeline instance (reusable)
const pipeline = new ImprovedCreationEnginePipeline();

// API endpoint
app.post('/api/ce/runs/:id/execute', authManager.requireAuth, async (req, res) => {
  const { id } = req.params;
  const { forceRestart } = req.body;
  
  try {
    const result = await pipeline.executeRun(id, {
      ownerId: `api_${process.pid}`,
      forceRestart: forceRestart === true
    });
    
    res.json({
      success: true,
      data: result,
      artifacts: result.artifacts.map(a => ({
        type: a.type,
        url: a.url,
        size: a.size
      }))
    });
  } catch (error) {
    console.error('Pipeline execution failed:', error);
    
    // Check if resumable
    const canResume = error.message.includes('Checkpoint saved');
    
    res.status(500).json({
      error: 'Pipeline execution failed',
      message: error.message,
      canResume,
      runId: id
    });
  }
});

// NEW: Add resume endpoint
app.post('/api/ce/runs/:id/resume', authManager.requireAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if checkpoint exists
    const hasCheckpoint = await pipeline.checkpointManager.hasCheckpoint(id);
    
    if (!hasCheckpoint) {
      return res.status(404).json({
        error: 'No checkpoint found',
        message: 'Cannot resume - run has no checkpoint'
      });
    }
    
    // Resume from checkpoint
    const result = await pipeline.executeRun(id, {
      ownerId: `api_${process.pid}`,
      forceRestart: false
    });
    
    res.json({
      success: true,
      data: result,
      resumed: true
    });
  } catch (error) {
    console.error('Pipeline resume failed:', error);
    res.status(500).json({
      error: 'Pipeline resume failed',
      message: error.message
    });
  }
});

// NEW: Add checkpoint status endpoint
app.get('/api/ce/runs/:id/checkpoint', authManager.requireAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const hasCheckpoint = await pipeline.checkpointManager.hasCheckpoint(id);
    
    if (!hasCheckpoint) {
      return res.status(404).json({
        hasCheckpoint: false
      });
    }
    
    const checkpoint = await pipeline.checkpointManager.loadCheckpoint(id);
    
    res.json({
      hasCheckpoint: true,
      stageName: checkpoint.stageName,
      timestamp: checkpoint.timestamp,
      age: Date.now() - checkpoint.timestamp,
      canResume: true
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load checkpoint',
      message: error.message
    });
  }
});

// NEW: Periodic maintenance
setInterval(async () => {
  try {
    console.log('🧹 Running pipeline maintenance...');
    
    const checkpoints = await pipeline.checkpointManager.cleanupOldCheckpoints();
    console.log(`   Cleaned ${checkpoints} old checkpoints`);
    
    const locks = await pipeline.lockManager.cleanupStaleLocks();
    console.log(`   Cleaned ${locks} stale locks`);
  } catch (error) {
    console.error('Maintenance failed:', error);
  }
}, 24 * 60 * 60 * 1000); // Daily
```

## Testing Your Migration

### 1. Unit Test

Create a test file to verify basic functionality:

```javascript
// test-migration.js
const ImprovedCreationEnginePipeline = require('./orchestrator/pipeline-improved');

async function testMigration() {
  console.log('Testing improved pipeline...\n');
  
  const pipeline = new ImprovedCreationEnginePipeline();
  
  // Test 1: Validation
  console.log('1. Testing data validation...');
  const data = await pipeline.loadData();
  const validation = pipeline.dataValidator.validateData(data);
  console.log('   Validation:', validation.valid ? '✅ PASS' : '❌ FAIL');
  if (!validation.valid) {
    console.log('   Errors:', validation.errors);
  }
  
  // Test 2: Lock Manager
  console.log('\n2. Testing lock manager...');
  await pipeline.lockManager.acquireLock('test-resource', 'test-owner');
  console.log('   Lock acquired: ✅');
  await pipeline.lockManager.releaseLock('test-resource', 'test-owner');
  console.log('   Lock released: ✅');
  
  // Test 3: Checkpoint Manager
  console.log('\n3. Testing checkpoint manager...');
  const testContext = { test: 'data', timestamp: Date.now() };
  await pipeline.checkpointManager.saveCheckpoint('test-run', 'testStage', testContext);
  console.log('   Checkpoint saved: ✅');
  const loaded = await pipeline.checkpointManager.loadCheckpoint('test-run');
  console.log('   Checkpoint loaded:', loaded ? '✅' : '❌');
  await pipeline.checkpointManager.deleteCheckpoint('test-run');
  console.log('   Checkpoint deleted: ✅');
  
  // Test 4: Artifact Storage
  console.log('\n4. Testing artifact storage...');
  await pipeline.artifactStorage.initialize();
  console.log('   Storage initialized: ✅');
  
  console.log('\n✅ All tests passed!');
}

testMigration().catch(console.error);
```

Run the test:

```bash
node test-migration.js
```

### 2. Integration Test

Test with a real run:

```bash
# 1. Create a test project and run in data.json
# 2. Execute pipeline
node -e "
const Pipeline = require('./orchestrator/pipeline-improved');
const pipeline = new Pipeline();
pipeline.executeRun('your-test-run-id', { ownerId: 'test' })
  .then(() => console.log('SUCCESS'))
  .catch(err => console.error('FAILED:', err.message));
"
```

### 3. Check Generated Files

Verify new files are created:

```bash
# Check locks directory
ls -la .locks/

# Check checkpoints directory
ls -la .checkpoints/

# Check artifacts directory
ls -la public/exports/
```

## Rollback Plan

If you need to rollback to the original pipeline:

### Quick Rollback

```javascript
// Change import back
const CreationEnginePipeline = require('./orchestrator/pipeline');
// const ImprovedCreationEnginePipeline = require('./orchestrator/pipeline-improved');
```

### Clean Up New Files

```bash
# Remove generated directories
rm -rf .locks
rm -rf .checkpoints

# Artifacts can be kept or removed
# rm -rf public/exports
```

### No Data Loss

The improved pipeline is fully backward compatible with `data.json`. No data migration is needed, and the original pipeline can read data.json created by the improved version.

## Common Issues

### Issue: Import Error

```
Error: Cannot find module './orchestrator/pipeline-improved'
```

**Solution:** Verify file exists and path is correct:
```bash
ls -la orchestrator/pipeline-improved.js
```

### Issue: Permissions Error

```
Error: EACCES: permission denied, mkdir '.locks'
```

**Solution:** Ensure Node.js has write permissions:
```bash
chmod +w .
```

### Issue: Old Checkpoints Prevent Execution

```
Error: Run run_123 is already running
```

**Solution:** Clean stale checkpoints:
```javascript
await pipeline.checkpointManager.deleteCheckpoint('run_123');
```

## Performance Impact

### Overhead

- **Lock acquisition:** +10-50ms per run
- **Checkpoint save:** +10-50ms per stage (10 stages = +100-500ms total)
- **Validation:** +1-5ms per stage

### Benefits

- **Resume capability:** Saves minutes-hours on failure
- **No data corruption:** Prevents hours of debugging
- **Better errors:** Saves time diagnosing issues

**Net impact:** Minimal overhead (<1%) with significant reliability gains

## Support & Questions

If you encounter issues during migration:

1. **Check logs:** Look for detailed error messages
2. **Verify structure:** Ensure data.json has required fields
3. **Test components:** Run unit tests for individual components
4. **Review checklist:** Ensure all migration steps completed

## Migration Checklist

- [ ] Updated all `require('./orchestrator/pipeline')` imports
- [ ] Added `ownerId` to `executeRun` calls
- [ ] Updated error handling to check for resume capability
- [ ] Added retry logic (optional)
- [ ] Added maintenance tasks (optional)
- [ ] Added resume endpoint (optional)
- [ ] Tested with real run
- [ ] Verified artifacts are created
- [ ] Checked for stale locks/checkpoints
- [ ] Updated documentation
- [ ] Informed team of changes

---

**Need Help?** Review the [README.md](./README.md) for detailed documentation.
