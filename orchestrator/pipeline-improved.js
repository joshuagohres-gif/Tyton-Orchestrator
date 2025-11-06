const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Import services
const specService = require('../services/spec');
const decomposeService = require('../services/decompose');
const sourcingService = require('../services/sourcing');
const compatService = require('../services/compat');
const wiringService = require('../services/wiring');
const firmwareService = require('../services/firmware');
const cadService = require('../services/cad');
const simService = require('../services/sim');
const docsService = require('../services/docs');

// Import utilities
const LockManager = require('./lockManager');
const CheckpointManager = require('./checkpointManager');
const DataValidator = require('./dataValidator');
const ArtifactStorage = require('./artifactStorage');

/**
 * Improved Creation Engine Pipeline
 * 
 * FIXES APPLIED:
 * ✅ File locking to prevent race conditions
 * ✅ Checkpointing for resume capability
 * ✅ Comprehensive data validation
 * ✅ Context persistence after each stage
 * ✅ Actual artifact file storage
 * 
 * Additional improvements:
 * - Better error messages with context
 * - Stage output validation
 * - Atomic data updates
 * - Cleanup on failure
 */
class ImprovedCreationEnginePipeline {
  constructor() {
    this.DATA_FILE = path.join(__dirname, '..', 'data.json');
    this.lockManager = new LockManager();
    this.checkpointManager = new CheckpointManager();
    this.dataValidator = new DataValidator();
    this.artifactStorage = new ArtifactStorage();
    
    this.stages = [
      { name: 'parseSpec', handler: this.parseSpecStage },
      { name: 'decompose', handler: this.decomposeStage },
      { name: 'sourceParts', handler: this.sourcePartsStage },
      { name: 'compatCheck', handler: this.compatCheckStage },
      { name: 'firmware', handler: this.firmwareStage },
      { name: 'wiring', handler: this.wiringStage },
      { name: 'cad', handler: this.cadStage },
      { name: 'simulate', handler: this.simulateStage },
      { name: 'docs', handler: this.docsStage },
      { name: 'collate', handler: this.collateStage }
    ];
  }

  /**
   * Execute pipeline run with full error handling and recovery
   */
  async executeRun(runId, options = {}) {
    const ownerId = options.ownerId || `run_${runId}`;
    const forceRestart = options.forceRestart || false;
    
    console.log(`🔧 Starting Creation Engine pipeline for run: ${runId}`);
    console.log(`   Owner: ${ownerId}, Force Restart: ${forceRestart}`);
    
    try {
      // Clean up stale locks before starting
      await this.lockManager.cleanupStaleLocks();
      
      // Execute with file lock to prevent concurrent runs on same data
      return await this.lockManager.withLock('data.json', ownerId, async () => {
        return await this.executeRunWithLock(runId, forceRestart);
      });
      
    } catch (error) {
      console.error(`💥 Pipeline failed for run ${runId}:`, error);
      
      // Try to update run status even if pipeline failed
      try {
        await this.markRunFailed(runId, error);
      } catch (updateError) {
        console.error('Failed to update run status:', updateError);
      }
      
      throw error;
    }
  }

  /**
   * Execute run with lock held
   */
  async executeRunWithLock(runId, forceRestart) {
    // Load and validate data
    const data = await this.loadData();
    
    // Validate data structure
    const dataValidation = this.dataValidator.validateData(data);
    if (!dataValidation.valid) {
      throw new Error(
        `Invalid data structure: ${dataValidation.errors.join('; ')}`
      );
    }
    
    // Find run
    const run = data.creation_engine.runs.find(r => r.id === runId);
    const runValidation = this.dataValidator.validateRun(run, runId);
    if (!runValidation.valid) {
      const availableRuns = data.creation_engine.runs.map(r => r.id).join(', ');
      throw new Error(
        `${runValidation.errors.join('; ')}. ` +
        `Available runs: ${availableRuns || 'none'}`
      );
    }
    
    // Find project
    const project = data.creation_engine.projects.find(p => p.id === run.projectId);
    const projectValidation = this.dataValidator.validateProject(project, run.projectId);
    if (!projectValidation.valid) {
      const availableProjects = data.creation_engine.projects.map(p => p.id).join(', ');
      throw new Error(
        `${projectValidation.errors.join('; ')}. ` +
        `Available projects: ${availableProjects || 'none'}`
      );
    }
    
    // Check for existing checkpoint
    let checkpoint = null;
    let startStageIndex = 0;
    
    if (!forceRestart) {
      checkpoint = await this.checkpointManager.loadCheckpoint(runId);
      if (checkpoint) {
        console.log(`📂 Found checkpoint at stage: ${checkpoint.stageName}`);
        startStageIndex = this.checkpointManager.getLastCompletedStageIndex(checkpoint, this.stages) + 1;
        
        if (startStageIndex >= this.stages.length) {
          console.log('✅ All stages already completed');
          return checkpoint.context;
        }
        
        console.log(`🔄 Resuming from stage ${startStageIndex + 1}/${this.stages.length}: ${this.stages[startStageIndex].name}`);
      }
    } else {
      console.log('🔄 Force restart - ignoring existing checkpoint');
    }
    
    // Initialize or restore context
    let projectContext = checkpoint ? checkpoint.context : {
      project,
      run,
      spec: null,
      subsystems: null,
      components: [],
      compatibility: null,
      artifacts: []
    };
    
    // Restore run reference (not in sanitized checkpoint)
    projectContext.run = run;
    projectContext.project = project;
    
    // Mark run as running
    run.status = 'running';
    run.startedAt = Date.now();
    await this.saveData(data);
    
    // Execute stages
    for (let i = startStageIndex; i < this.stages.length; i++) {
      const stage = this.stages[i];
      
      try {
        console.log(`\n⚡ Executing stage ${i + 1}/${this.stages.length}: ${stage.name}`);
        
        // Validate stage prerequisites
        const contextValidation = this.dataValidator.validateStageContext(stage.name, projectContext);
        if (!contextValidation.valid) {
          throw new Error(
            `Stage ${stage.name} prerequisites not met: ${contextValidation.errors.join('; ')}`
          );
        }
        
        // Update run status
        run.currentStage = stage.name;
        await this.saveData(data);
        
        // Execute stage
        const stageOutput = await this.executeStage(stage, projectContext, data);
        
        // Validate stage output
        const outputValidation = this.dataValidator.validateStageOutput(stage.name, stageOutput);
        if (!outputValidation.valid) {
          console.warn(`⚠️  Stage ${stage.name} output validation warnings:`, outputValidation.errors);
          // Don't fail on warnings, just log them
        }
        
        // Update context with stage output
        projectContext = this.updateContextWithStageOutput(projectContext, stage.name, stageOutput);
        
        // Save checkpoint after successful stage
        await this.checkpointManager.saveCheckpoint(runId, stage.name, projectContext, stageOutput);
        
        // Save updated data
        await this.saveData(data);
        
        console.log(`✅ Stage ${stage.name} completed`);
        
      } catch (stageError) {
        console.error(`❌ Stage ${stage.name} failed:`, stageError);
        
        // Enhanced error message
        run.status = 'failed';
        run.error = `Stage ${stage.name} failed: ${stageError.message}`;
        run.failedAt = Date.now();
        run.failedStage = stage.name;
        
        await this.saveData(data);
        
        throw new Error(
          `Pipeline failed at stage ${stage.name} (${i + 1}/${this.stages.length}): ${stageError.message}. ` +
          `Checkpoint saved - can resume with same run ID.`
        );
      }
    }
    
    // Mark run as completed
    run.status = 'completed';
    run.completedAt = Date.now();
    run.duration = run.completedAt - run.startedAt;
    project.status = 'completed';
    project.spec = projectContext.spec;
    
    await this.saveData(data);
    
    // Clean up checkpoint after successful completion
    await this.checkpointManager.deleteCheckpoint(runId);
    
    console.log(`\n🎉 Pipeline completed successfully for run: ${runId}`);
    console.log(`   Duration: ${Math.round(run.duration / 1000)}s`);
    console.log(`   Artifacts: ${projectContext.artifacts.length}`);
    
    return projectContext;
  }

  /**
   * Execute a single stage with timeout
   */
  async executeStage(stage, context, data) {
    const timeout = 300000; // 5 minutes per stage
    
    const stagePromise = stage.handler.call(this, context, data);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Stage timeout after ${timeout}ms`)), timeout)
    );
    
    return await Promise.race([stagePromise, timeoutPromise]);
  }

  /**
   * Update context with stage output
   */
  updateContextWithStageOutput(context, stageName, output) {
    switch (stageName) {
      case 'parseSpec':
        context.spec = output;
        context.project.spec = output;
        break;
      case 'decompose':
        context.subsystems = output;
        break;
      case 'sourceParts':
        context.components = output;
        break;
      case 'compatCheck':
        context.compatibility = output;
        break;
      // Other stages add artifacts, handled in stage methods
    }
    
    return context;
  }

  /**
   * Mark run as failed (helper for external error handling)
   */
  async markRunFailed(runId, error) {
    const data = await this.loadData();
    const run = data.creation_engine.runs.find(r => r.id === runId);
    
    if (run) {
      run.status = 'failed';
      run.error = error.message;
      run.failedAt = Date.now();
      await this.saveData(data);
    }
  }

  /**
   * Load data with validation
   */
  async loadData() {
    try {
      const content = await fs.readFile(this.DATA_FILE, 'utf8');
      let data = JSON.parse(content);
      
      // Initialize missing structures
      data = this.dataValidator.initializeDataStructure(data);
      
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📝 Data file not found, creating new one...');
        const newData = this.dataValidator.initializeDataStructure({});
        await this.saveData(newData);
        return newData;
      }
      throw error;
    }
  }

  /**
   * Save data atomically
   */
  async saveData(data) {
    // Atomic write using temp file
    const tempFile = `${this.DATA_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
    await fs.rename(tempFile, this.DATA_FILE);
  }

  // =================
  // STAGE HANDLERS (with improvements)
  // =================

  async parseSpecStage(context, data) {
    console.log('📝 Parsing project specification...');
    
    const spec = await specService.normalizeInput({
      summary: context.project.summary,
      templateId: context.project.templateId
    });
    
    // Create task entry
    const task = {
      id: crypto.randomUUID(), // FIX: Use UUID instead of Date.now()
      projectId: context.project.id,
      title: 'Parse Project Specification',
      description: 'Normalize input into structured specification',
      status: 'completed',
      dependsOn: [],
      completedAt: Date.now(),
      dueAt: Date.now() + 24 * 60 * 60 * 1000
    };
    
    data.creation_engine.tasks.push(task);
    
    return spec; // Return output for validation
  }

  async decomposeStage(context, data) {
    console.log('🔧 Decomposing into subsystems...');
    
    const subsystems = await decomposeService.decomposeProject(context.spec);
    
    const task = {
      id: crypto.randomUUID(),
      projectId: context.project.id,
      title: 'System Decomposition',
      description: `Identified ${subsystems.length} subsystems: ${subsystems.map(s => s.name).join(', ')}`,
      status: 'completed',
      dependsOn: [],
      completedAt: Date.now(),
      dueAt: Date.now() + 24 * 60 * 60 * 1000
    };
    
    data.creation_engine.tasks.push(task);
    
    return subsystems;
  }

  async sourcePartsStage(context, data) {
    console.log('🔍 Sourcing components...');
    
    const components = await sourcingService.findComponents(
      context.subsystems,
      data.component_cache
    );
    
    // Add BOM entries with UUIDs
    components.forEach(comp => {
      const bomItem = {
        id: crypto.randomUUID(),
        projectId: context.project.id,
        componentId: comp.component.id,
        qty: comp.quantity,
        notes: comp.purpose,
        alternates: comp.alternates || [],
        score: comp.score
      };
      
      data.creation_engine.bom.push(bomItem);
    });
    
    const task = {
      id: crypto.randomUUID(),
      projectId: context.project.id,
      title: 'Component Sourcing',
      description: `Found ${components.length} components (${components.filter(c => !c.missing).length} available, ${components.filter(c => c.missing).length} missing)`,
      status: 'completed',
      dependsOn: [],
      completedAt: Date.now(),
      dueAt: Date.now() + 24 * 60 * 60 * 1000
    };
    
    data.creation_engine.tasks.push(task);
    
    return components;
  }

  async compatCheckStage(context, data) {
    console.log('⚖️  Checking compatibility...');
    
    const compatibility = await compatService.checkCompatibility(
      context.components,
      context.spec
    );
    
    // FIX: Actually save the file
    const fileInfo = await this.artifactStorage.saveCompatibilityReport(
      context.project.id,
      compatibility
    );
    
    const artifact = {
      id: crypto.randomUUID(),
      projectId: context.project.id,
      type: 'compatibility_report',
      url: fileInfo.url,
      path: fileInfo.path,
      size: fileInfo.size,
      meta: {
        overall: compatibility.overall,
        warnings: compatibility.warnings.length,
        errors: compatibility.errors.length
      },
      checksum: this.generateChecksum(JSON.stringify(compatibility)),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return compatibility;
  }

  async firmwareStage(context, data) {
    console.log('💻 Generating firmware scaffold...');
    
    const firmware = await firmwareService.generateScaffold(
      context.spec,
      context.components
    );
    
    // FIX: Actually save the files
    const fileInfo = await this.artifactStorage.saveFirmware(
      context.project.id,
      firmware
    );
    
    const artifact = {
      id: crypto.randomUUID(),
      projectId: context.project.id,
      type: 'firmware',
      url: fileInfo.url,
      mainFile: fileInfo.mainFile,
      path: fileInfo.path,
      fileCount: fileInfo.fileCount,
      size: fileInfo.size,
      meta: {
        platform: firmware.platform,
        files: firmware.files.length
      },
      checksum: this.generateChecksum(firmware.mainCode),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return firmware;
  }

  async wiringStage(context, data) {
    console.log('🔌 Generating wiring diagram...');
    
    const wiring = await wiringService.generateWiring(
      context.components,
      context.spec
    );
    
    // FIX: Actually save the file
    const fileInfo = await this.artifactStorage.saveWiring(
      context.project.id,
      wiring
    );
    
    const artifact = {
      id: crypto.randomUUID(),
      projectId: context.project.id,
      type: 'wiring_svg',
      url: fileInfo.url,
      netlistUrl: fileInfo.netlistUrl,
      path: fileInfo.path,
      size: fileInfo.size,
      meta: {
        components: wiring.devices.length,
        nets: wiring.nets.length
      },
      checksum: this.generateChecksum(wiring.svg),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return wiring;
  }

  async cadStage(context, data) {
    console.log('📦 Generating enclosure...');
    
    const enclosure = await cadService.generateEnclosure(context.spec);
    
    // FIX: Actually save the file
    const fileInfo = await this.artifactStorage.saveEnclosure(
      context.project.id,
      enclosure
    );
    
    const artifact = {
      id: crypto.randomUUID(),
      projectId: context.project.id,
      type: 'stl',
      url: fileInfo.url,
      metadataUrl: fileInfo.metadataUrl,
      path: fileInfo.path,
      size: fileInfo.size,
      meta: {
        dimensions: enclosure.dimensions,
        volume: enclosure.volume
      },
      checksum: this.generateChecksum(enclosure.stlContent),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return enclosure;
  }

  async simulateStage(context, data) {
    console.log('⚡ Running circuit simulation...');
    
    const simulation = await simService.runSimulation(
      context.components,
      context.spec
    );
    
    // FIX: Actually save the file
    const fileInfo = await this.artifactStorage.saveSimulation(
      context.project.id,
      simulation
    );
    
    const artifact = {
      id: crypto.randomUUID(),
      projectId: context.project.id,
      type: 'simulation_report',
      url: fileInfo.url,
      jsonUrl: fileInfo.jsonUrl,
      htmlPath: fileInfo.htmlPath,
      jsonPath: fileInfo.jsonPath,
      size: fileInfo.size,
      meta: {
        status: simulation.status,
        tests: simulation.tests.length
      },
      checksum: this.generateChecksum(JSON.stringify(simulation)),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return simulation;
  }

  async docsStage(context, data) {
    console.log('📚 Generating documentation...');
    
    const documentation = await docsService.generateDocs(context);
    
    // FIX: Actually save the file
    const fileInfo = await this.artifactStorage.saveDocumentation(
      context.project.id,
      documentation
    );
    
    const artifact = {
      id: crypto.randomUUID(),
      projectId: context.project.id,
      type: 'documentation',
      url: fileInfo.url,
      metadataUrl: fileInfo.metadataUrl,
      path: fileInfo.path,
      size: fileInfo.size,
      meta: {
        sections: documentation.sections.length,
        wordCount: documentation.wordCount
      },
      checksum: this.generateChecksum(documentation.content),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return documentation;
  }

  async collateStage(context, data) {
    console.log('📋 Collating final deliverables...');
    
    // Create final collated artifact
    const collated = {
      project: context.project,
      spec: context.spec,
      subsystems: context.subsystems,
      components: context.components,
      compatibility: context.compatibility,
      artifacts: context.artifacts,
      completedAt: Date.now()
    };
    
    // FIX: Actually save the file
    const fileInfo = await this.artifactStorage.saveProjectSummary(
      context.project.id,
      collated
    );
    
    const artifact = {
      id: crypto.randomUUID(),
      projectId: context.project.id,
      type: 'project_summary',
      url: fileInfo.url,
      path: fileInfo.path,
      size: fileInfo.size,
      meta: {
        totalArtifacts: context.artifacts.length,
        totalComponents: context.components.length
      },
      checksum: this.generateChecksum(JSON.stringify(collated)),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return collated;
  }

  /**
   * Generate checksum for data integrity
   */
  generateChecksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
}

module.exports = ImprovedCreationEnginePipeline;
