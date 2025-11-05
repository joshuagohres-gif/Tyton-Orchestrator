#!/usr/bin/env node

/**
 * Test script for improved pipeline
 * Tests all critical fixes and improvements
 */

const ImprovedPipeline = require('./pipeline-improved');
const fs = require('fs').promises;
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

async function testLockManager() {
  section('TEST 1: Lock Manager');
  
  const pipeline = new ImprovedPipeline();
  const { lockManager } = pipeline;
  
  try {
    // Test lock acquisition
    log('→ Testing lock acquisition...', 'blue');
    const acquired = await lockManager.acquireLock('test-resource', 'test-owner-1');
    if (acquired) {
      log('  ✅ Lock acquired', 'green');
    } else {
      throw new Error('Failed to acquire lock');
    }
    
    // Test lock contention
    log('→ Testing lock contention...', 'blue');
    let contentionFailed = false;
    try {
      await lockManager.acquireLock('test-resource', 'test-owner-2');
    } catch (error) {
      if (error.message.includes('Failed to acquire lock')) {
        contentionFailed = true;
        log('  ✅ Lock contention detected correctly', 'green');
      }
    }
    if (!contentionFailed) {
      throw new Error('Lock contention not detected');
    }
    
    // Test lock release
    log('→ Testing lock release...', 'blue');
    await lockManager.releaseLock('test-resource', 'test-owner-1');
    log('  ✅ Lock released', 'green');
    
    // Test re-acquisition after release
    log('→ Testing re-acquisition...', 'blue');
    await lockManager.acquireLock('test-resource', 'test-owner-2');
    log('  ✅ Re-acquired after release', 'green');
    await lockManager.releaseLock('test-resource', 'test-owner-2');
    
    // Test stale lock cleanup
    log('→ Testing stale lock cleanup...', 'blue');
    const cleaned = await lockManager.cleanupStaleLocks();
    log(`  ✅ Cleaned ${cleaned} stale locks`, 'green');
    
    log('\n✅ Lock Manager: ALL TESTS PASSED', 'green');
    return true;
    
  } catch (error) {
    log(`\n❌ Lock Manager: TEST FAILED - ${error.message}`, 'red');
    return false;
  }
}

async function testCheckpointManager() {
  section('TEST 2: Checkpoint Manager');
  
  const pipeline = new ImprovedPipeline();
  const { checkpointManager } = pipeline;
  
  try {
    const testRunId = 'test-run-' + Date.now();
    const testContext = {
      project: { id: 'test-proj', summary: 'Test project' },
      run: { id: testRunId, status: 'running' },
      spec: { purpose: 'Testing', features: ['test'] },
      components: []
    };
    
    // Test checkpoint save
    log('→ Testing checkpoint save...', 'blue');
    await checkpointManager.saveCheckpoint(testRunId, 'testStage', testContext);
    log('  ✅ Checkpoint saved', 'green');
    
    // Test checkpoint load
    log('→ Testing checkpoint load...', 'blue');
    const loaded = await checkpointManager.loadCheckpoint(testRunId);
    if (!loaded) {
      throw new Error('Failed to load checkpoint');
    }
    if (loaded.stageName !== 'testStage') {
      throw new Error('Checkpoint data mismatch');
    }
    log('  ✅ Checkpoint loaded correctly', 'green');
    
    // Test checkpoint existence check
    log('→ Testing checkpoint existence check...', 'blue');
    const exists = await checkpointManager.hasCheckpoint(testRunId);
    if (!exists) {
      throw new Error('Checkpoint existence check failed');
    }
    log('  ✅ Checkpoint existence confirmed', 'green');
    
    // Test checkpoint listing
    log('→ Testing checkpoint listing...', 'blue');
    const checkpoints = await checkpointManager.listCheckpoints();
    if (!checkpoints.some(c => c.runId === testRunId)) {
      throw new Error('Checkpoint not in list');
    }
    log(`  ✅ Listed ${checkpoints.length} checkpoints`, 'green');
    
    // Test checkpoint deletion
    log('→ Testing checkpoint deletion...', 'blue');
    await checkpointManager.deleteCheckpoint(testRunId);
    const existsAfterDelete = await checkpointManager.hasCheckpoint(testRunId);
    if (existsAfterDelete) {
      throw new Error('Checkpoint not deleted');
    }
    log('  ✅ Checkpoint deleted', 'green');
    
    log('\n✅ Checkpoint Manager: ALL TESTS PASSED', 'green');
    return true;
    
  } catch (error) {
    log(`\n❌ Checkpoint Manager: TEST FAILED - ${error.message}`, 'red');
    return false;
  }
}

async function testDataValidator() {
  section('TEST 3: Data Validator');
  
  const pipeline = new ImprovedPipeline();
  const { dataValidator } = pipeline;
  
  try {
    // Test valid data
    log('→ Testing valid data structure...', 'blue');
    const validData = {
      creation_engine: {
        projects: [],
        runs: [],
        tasks: [],
        bom: [],
        artifacts: []
      },
      component_cache: []
    };
    const validResult = dataValidator.validateData(validData);
    if (!validResult.valid) {
      throw new Error('Valid data marked as invalid');
    }
    log('  ✅ Valid data accepted', 'green');
    
    // Test invalid data
    log('→ Testing invalid data structure...', 'blue');
    const invalidData = {};
    const invalidResult = dataValidator.validateData(invalidData);
    if (invalidResult.valid) {
      throw new Error('Invalid data marked as valid');
    }
    log(`  ✅ Invalid data rejected (${invalidResult.errors.length} errors)`, 'green');
    
    // Test data initialization
    log('→ Testing data structure initialization...', 'blue');
    const emptyData = {};
    const initialized = dataValidator.initializeDataStructure(emptyData);
    if (!initialized.creation_engine || !initialized.component_cache) {
      throw new Error('Data initialization failed');
    }
    log('  ✅ Data structure initialized', 'green');
    
    // Test run validation
    log('→ Testing run validation...', 'blue');
    const validRun = { id: 'run_1', projectId: 'proj_1', status: 'pending' };
    const runResult = dataValidator.validateRun(validRun, 'run_1');
    if (!runResult.valid) {
      throw new Error('Valid run marked as invalid');
    }
    log('  ✅ Run validation passed', 'green');
    
    // Test project validation
    log('→ Testing project validation...', 'blue');
    const validProject = { id: 'proj_1', userId: 'user_1', summary: 'Test' };
    const projectResult = dataValidator.validateProject(validProject, 'proj_1');
    if (!projectResult.valid) {
      throw new Error('Valid project marked as invalid');
    }
    log('  ✅ Project validation passed', 'green');
    
    log('\n✅ Data Validator: ALL TESTS PASSED', 'green');
    return true;
    
  } catch (error) {
    log(`\n❌ Data Validator: TEST FAILED - ${error.message}`, 'red');
    return false;
  }
}

async function testArtifactStorage() {
  section('TEST 4: Artifact Storage');
  
  const pipeline = new ImprovedPipeline();
  const { artifactStorage } = pipeline;
  
  try {
    const testProjectId = 'test-proj-' + Date.now();
    
    // Test initialization
    log('→ Testing storage initialization...', 'blue');
    await artifactStorage.initialize();
    log('  ✅ Storage initialized', 'green');
    
    // Test directory creation
    log('→ Testing project directory creation...', 'blue');
    const projectDir = await artifactStorage.ensureProjectDir(testProjectId);
    const dirExists = await fs.access(projectDir).then(() => true).catch(() => false);
    if (!dirExists) {
      throw new Error('Project directory not created');
    }
    log('  ✅ Project directory created', 'green');
    
    // Test compatibility report save
    log('→ Testing compatibility report save...', 'blue');
    const testCompat = {
      overall: 'compatible',
      checks: [],
      warnings: [],
      errors: []
    };
    const compatFile = await artifactStorage.saveCompatibilityReport(testProjectId, testCompat);
    if (!compatFile.url || !compatFile.path) {
      throw new Error('Compatibility report not saved');
    }
    log('  ✅ Compatibility report saved', 'green');
    
    // Test artifact listing
    log('→ Testing artifact listing...', 'blue');
    const artifacts = await artifactStorage.listProjectArtifacts(testProjectId);
    if (artifacts.length === 0) {
      throw new Error('Artifacts not listed');
    }
    log(`  ✅ Listed ${artifacts.length} artifacts`, 'green');
    
    // Test cleanup
    log('→ Testing artifact cleanup...', 'blue');
    await artifactStorage.deleteProjectArtifacts(testProjectId);
    const artifactsAfterDelete = await artifactStorage.listProjectArtifacts(testProjectId);
    if (artifactsAfterDelete.length > 0) {
      throw new Error('Artifacts not deleted');
    }
    log('  ✅ Artifacts cleaned up', 'green');
    
    log('\n✅ Artifact Storage: ALL TESTS PASSED', 'green');
    return true;
    
  } catch (error) {
    log(`\n❌ Artifact Storage: TEST FAILED - ${error.message}`, 'red');
    return false;
  }
}

async function testPipelineIntegration() {
  section('TEST 5: Pipeline Integration');
  
  const pipeline = new ImprovedPipeline();
  
  try {
    // Test data loading
    log('→ Testing data loading...', 'blue');
    const data = await pipeline.loadData();
    if (!data) {
      throw new Error('Failed to load data');
    }
    log('  ✅ Data loaded', 'green');
    
    // Test data validation
    log('→ Testing data validation...', 'blue');
    const validation = pipeline.dataValidator.validateData(data);
    if (!validation.valid) {
      log(`  ⚠️  Data validation issues: ${validation.errors.join(', ')}`, 'yellow');
      // Initialize if needed
      const initialized = pipeline.dataValidator.initializeDataStructure(data);
      await pipeline.saveData(initialized);
      log('  ✅ Data structure initialized and saved', 'green');
    } else {
      log('  ✅ Data structure valid', 'green');
    }
    
    // Test with lock
    log('→ Testing pipeline with lock...', 'blue');
    const result = await pipeline.lockManager.withLock('test-lock', 'integration-test', async () => {
      return { success: true, message: 'Lock acquired and released' };
    });
    if (!result.success) {
      throw new Error('Lock execution failed');
    }
    log('  ✅ Lock execution successful', 'green');
    
    log('\n✅ Pipeline Integration: ALL TESTS PASSED', 'green');
    return true;
    
  } catch (error) {
    log(`\n❌ Pipeline Integration: TEST FAILED - ${error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log('\n' + '█'.repeat(60), 'cyan');
  log('  IMPROVED PIPELINE - COMPREHENSIVE TEST SUITE', 'cyan');
  log('█'.repeat(60), 'cyan');
  
  const results = {
    lockManager: false,
    checkpointManager: false,
    dataValidator: false,
    artifactStorage: false,
    integration: false
  };
  
  try {
    results.lockManager = await testLockManager();
    results.checkpointManager = await testCheckpointManager();
    results.dataValidator = await testDataValidator();
    results.artifactStorage = await testArtifactStorage();
    results.integration = await testPipelineIntegration();
    
  } catch (error) {
    log(`\n💥 Test suite crashed: ${error.message}`, 'red');
    console.error(error);
  }
  
  // Summary
  section('TEST SUMMARY');
  
  const tests = [
    { name: 'Lock Manager', result: results.lockManager },
    { name: 'Checkpoint Manager', result: results.checkpointManager },
    { name: 'Data Validator', result: results.dataValidator },
    { name: 'Artifact Storage', result: results.artifactStorage },
    { name: 'Pipeline Integration', result: results.integration }
  ];
  
  tests.forEach(test => {
    const status = test.result ? '✅ PASS' : '❌ FAIL';
    const color = test.result ? 'green' : 'red';
    log(`  ${test.name.padEnd(25)} ${status}`, color);
  });
  
  const passed = tests.filter(t => t.result).length;
  const total = tests.length;
  
  console.log('\n' + '-'.repeat(60));
  if (passed === total) {
    log(`🎉 ALL TESTS PASSED (${passed}/${total})`, 'green');
    log('\n✅ The improved pipeline is working correctly!', 'green');
    log('   All critical fixes have been validated.', 'green');
    process.exit(0);
  } else {
    log(`⚠️  SOME TESTS FAILED (${passed}/${total} passed)`, 'yellow');
    log('\n❌ Please review failed tests above.', 'red');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runAllTests().catch(error => {
    log(`\n💥 Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runAllTests };
