const fs = require('fs').promises;
const path = require('path');

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

class CreationEnginePipeline {
  constructor() {
    this.DATA_FILE = path.join(__dirname, '..', 'data.json');
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

  async executeRun(runId) {
    try {
      console.log(`🔧 Starting Creation Engine pipeline for run: ${runId}`);
      
      const data = JSON.parse(await fs.readFile(this.DATA_FILE, 'utf8'));
      const run = data.creation_engine.runs.find(r => r.id === runId);
      
      if (!run) {
        throw new Error(`Run ${runId} not found`);
      }
      
      const project = data.creation_engine.projects.find(p => p.id === run.projectId);
      if (!project) {
        throw new Error(`Project ${run.projectId} not found`);
      }

      // Initialize project context
      let projectContext = {
        project,
        run,
        spec: null,
        subsystems: null,
        components: [],
        compatibility: null,
        artifacts: []
      };

      // Execute stages sequentially
      for (const stage of this.stages) {
        try {
          console.log(`⚡ Executing stage: ${stage.name}`);
          
          // Update run status
          run.currentStage = stage.name;
          await this.updateData(data);
          
          // Execute stage
          projectContext = await stage.handler.call(this, projectContext, data);
          
          console.log(`✅ Stage ${stage.name} completed`);
        } catch (stageError) {
          console.error(`❌ Stage ${stage.name} failed:`, stageError);
          run.status = 'failed';
          run.error = stageError.message;
          await this.updateData(data);
          throw stageError;
        }
      }

      // Mark run as completed
      run.status = 'completed';
      project.status = 'completed';
      project.spec = projectContext.spec;
      
      await this.updateData(data);
      
      console.log(`🎉 Pipeline completed successfully for run: ${runId}`);
      return projectContext;
      
    } catch (error) {
      console.error(`💥 Pipeline failed for run ${runId}:`, error);
      throw error;
    }
  }

  async parseSpecStage(context, data) {
    console.log('📝 Parsing project specification...');
    
    const spec = await specService.normalizeInput({
      summary: context.project.summary,
      templateId: context.project.templateId
    });
    
    context.spec = spec;
    context.project.spec = spec;
    
    // Create task entries
    const task = {
      id: `task_${Date.now()}_spec`,
      projectId: context.project.id,
      title: 'Parse Project Specification',
      description: 'Normalize input into structured specification',
      status: 'completed',
      dependsOn: [],
      dueAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours from now
    };
    
    data.creation_engine.tasks.push(task);
    
    return context;
  }

  async decomposeStage(context, data) {
    console.log('🔧 Decomposing into subsystems...');
    
    const subsystems = await decomposeService.decomposeProject(context.spec);
    context.subsystems = subsystems;
    
    const task = {
      id: `task_${Date.now()}_decompose`,
      projectId: context.project.id,
      title: 'System Decomposition',
      description: `Identified ${subsystems.length} subsystems: ${subsystems.map(s => s.name).join(', ')}`,
      status: 'completed',
      dependsOn: [],
      dueAt: Date.now() + 24 * 60 * 60 * 1000
    };
    
    data.creation_engine.tasks.push(task);
    
    return context;
  }

  async sourcePartsStage(context, data) {
    console.log('🔍 Sourcing components...');
    
    const components = await sourcingService.findComponents(
      context.subsystems, 
      data.component_cache
    );
    
    context.components = components;
    
    // Add BOM entries
    components.forEach(comp => {
      const bomItem = {
        id: `bom_${Date.now()}_${comp.component.id}`,
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
      id: `task_${Date.now()}_sourcing`,
      projectId: context.project.id,
      title: 'Component Sourcing',
      description: `Found ${components.length} components for BOM`,
      status: 'completed',
      dependsOn: [],
      dueAt: Date.now() + 24 * 60 * 60 * 1000
    };
    
    data.creation_engine.tasks.push(task);
    
    return context;
  }

  async compatCheckStage(context, data) {
    console.log('⚖️ Checking compatibility...');
    
    const compatibility = await compatService.checkCompatibility(
      context.components,
      context.spec
    );
    
    context.compatibility = compatibility;
    
    const artifact = {
      id: `artifact_${Date.now()}_compat`,
      projectId: context.project.id,
      type: 'compatibility_report',
      url: `/exports/${context.project.id}/compatibility-report.json`,
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
    
    return context;
  }

  async firmwareStage(context, data) {
    console.log('💻 Generating firmware scaffold...');
    
    const firmware = await firmwareService.generateScaffold(
      context.spec,
      context.components
    );
    
    const artifact = {
      id: `artifact_${Date.now()}_firmware`,
      projectId: context.project.id,
      type: 'firmware',
      url: `/exports/${context.project.id}/firmware.zip`,
      meta: {
        platform: firmware.platform,
        files: firmware.files.length
      },
      checksum: this.generateChecksum(firmware.mainCode),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return context;
  }

  async wiringStage(context, data) {
    console.log('🔌 Generating wiring diagram...');
    
    const wiring = await wiringService.generateWiring(
      context.components,
      context.spec
    );
    
    const artifact = {
      id: `artifact_${Date.now()}_wiring`,
      projectId: context.project.id,
      type: 'wiring_svg',
      url: `/exports/${context.project.id}/wiring.svg`,
      meta: {
        components: wiring.devices.length,
        nets: wiring.nets.length
      },
      checksum: this.generateChecksum(wiring.svg),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return context;
  }

  async cadStage(context, data) {
    console.log('📦 Generating enclosure...');
    
    const enclosure = await cadService.generateEnclosure(context.spec);
    
    const artifact = {
      id: `artifact_${Date.now()}_enclosure`,
      projectId: context.project.id,
      type: 'stl',
      url: `/exports/${context.project.id}/enclosure.stl`,
      meta: {
        dimensions: enclosure.dimensions,
        volume: enclosure.volume
      },
      checksum: this.generateChecksum(enclosure.stlContent),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return context;
  }

  async simulateStage(context, data) {
    console.log('⚡ Running circuit simulation...');
    
    const simulation = await simService.runSimulation(
      context.components,
      context.spec
    );
    
    const artifact = {
      id: `artifact_${Date.now()}_simulation`,
      projectId: context.project.id,
      type: 'simulation_report',
      url: `/exports/${context.project.id}/simulation-report.html`,
      meta: {
        status: simulation.status,
        tests: simulation.tests.length
      },
      checksum: this.generateChecksum(JSON.stringify(simulation)),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return context;
  }

  async docsStage(context, data) {
    console.log('📚 Generating documentation...');
    
    const documentation = await docsService.generateDocs(context);
    
    const artifact = {
      id: `artifact_${Date.now()}_docs`,
      projectId: context.project.id,
      type: 'documentation',
      url: `/exports/${context.project.id}/README.md`,
      meta: {
        sections: documentation.sections.length,
        wordCount: documentation.wordCount
      },
      checksum: this.generateChecksum(documentation.content),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return context;
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
    
    const artifact = {
      id: `artifact_${Date.now()}_project`,
      projectId: context.project.id,
      type: 'project_summary',
      url: `/exports/${context.project.id}/project.json`,
      meta: {
        totalArtifacts: context.artifacts.length,
        totalComponents: context.components.length
      },
      checksum: this.generateChecksum(JSON.stringify(collated)),
      createdAt: Date.now()
    };
    
    data.creation_engine.artifacts.push(artifact);
    context.artifacts.push(artifact);
    
    return context;
  }

  async updateData(data) {
    await fs.writeFile(this.DATA_FILE, JSON.stringify(data, null, 2));
  }

  generateChecksum(content) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
}

module.exports = CreationEnginePipeline;