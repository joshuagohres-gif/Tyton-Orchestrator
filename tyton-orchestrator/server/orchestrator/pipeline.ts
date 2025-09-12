import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import { getOpenAIService } from '../llm/openai';
import { getAnthropicService } from '../llm/anthropic';
import { prisma } from '../db/client';
import BulkOperations from '../db/bulk';
import { callLlmWithRetry } from './llm';
import * as metaPrompt from '../../lib/prompts/metaOrchestratorPrompt';
import * as p1Components from '../../lib/prompts/p1_components';
import * as p2Wiring from '../../lib/prompts/p2_wiring';
import * as p3Mechanical from '../../lib/prompts/p3_mechanical';
import * as p4Firmware from '../../lib/prompts/p4_firmware';
import * as p5Bom from '../../lib/prompts/p5_bom';
import * as p6Sourcing from '../../lib/prompts/p6_sourcing';

// Event bus for pipeline progress streaming
export const pipelineBus = new EventEmitter();

// Runtime state for orchestration runs
interface OrchestrationRun {
  id: string;
  projectId: string;
  status: 'starting' | 'running' | 'paused' | 'cancelling' | 'done' | 'error';
  stages: Map<string, StageStatus>;
  issues: { erc: any[]; drc: any[] };
  schematic?: { specV12: any };
  summary?: any;
  lastError?: string;
  paused: boolean;
  cancelling: boolean;
  maxConcurrency: number;
  createdAt: Date;
}

interface StageStatus {
  id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  attempts: number;
  message?: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

// Global state for active runs
const activeRuns = new Map<string, OrchestrationRun>();

export type Stage = 'meta' | 'components' | 'wiring' | 'mechanical' | 'firmware' | 'bom' | 'sourcing';

interface StageResult {
  success: boolean;
  data?: any;
  error?: string;
  safetyGate?: boolean;
  openQuestions?: string[];
}

class OrchestrationPipeline {
  private llmService: any;

  constructor() {
    // Use OpenAI by default, only use Anthropic if explicitly configured
    try {
      this.llmService = getOpenAIService();
    } catch (error) {
      console.error('Failed to initialize OpenAI service:', error);
      throw new Error('No LLM service available');
    }
  }

  private emitStageProgress(runId: string, stageId: string, status: StageStatus['status'], message?: string, attempts = 1) {
    const run = activeRuns.get(runId);
    if (!run) return;

    const stageStatus: StageStatus = {
      id: stageId,
      status,
      attempts,
      message,
      ...(status === 'running' && { startedAt: new Date() }),
      ...(status === 'done' && { completedAt: new Date() })
    };

    run.stages.set(stageId, stageStatus);
    
    // Emit to event bus
    pipelineBus.emit("stage", { 
      runId, 
      id: stageId, 
      status, 
      attempts, 
      message 
    });
  }

  private async checkPauseOrCancel(runId: string): Promise<boolean> {
    const run = activeRuns.get(runId);
    if (!run) return true; // Cancel if run not found

    if (run.cancelling) {
      run.status = 'cancelling';
      return true;
    }

    while (run.paused && !run.cancelling) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return run.cancelling;
  }

  async runStage(projectId: string, stageName: Stage, input: any, tx: any): Promise<StageResult> {
    try {
      // Get project
      const project = await tx.project.findUnique({
        where: { id: projectId },
        include: {
          modules: true,
          bomItems: true,
          suppliers: true,
          promptRuns: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!project) {
        throw new Error('Project not found');
      }

      // Select appropriate prompt based on stage
      let promptFunction: (input: any) => string;
      switch (stageName) {
        case 'meta':
          promptFunction = metaPrompt.prompt;
          break;
        case 'components':
          promptFunction = p1Components.prompt;
          break;
        case 'wiring':
          promptFunction = p2Wiring.prompt;
          break;
        case 'mechanical':
          promptFunction = p3Mechanical.prompt;
          break;
        case 'firmware':
          promptFunction = p4Firmware.prompt;
          break;
        case 'bom':
          promptFunction = p5Bom.prompt;
          break;
        case 'sourcing':
          promptFunction = p6Sourcing.prompt;
          break;
        default:
          throw new Error(`Unknown stage: ${stageName}`);
      }

      // Build context from previous runs
      const prior = this.buildPriorContext(project, stageName);

      // Generate prompt
      const prompt = promptFunction({
        projectDescription: input.projectDescription || project.description,
        prior
      });

      // Call LLM with retry logic
      const llmResponse = await callLlmWithRetry(() => 
        this.llmService.complete({
          prompt,
          temperature: 0.7
        })
      );

      // Create prompt run record
      const promptRun = await prisma.promptRun.create({
        data: {
          projectId,
          stage: stageName,
          inputJson: JSON.stringify(input),
          outputText: llmResponse.text,
          outputJson: llmResponse.json ? JSON.stringify(llmResponse.json) : null,
          status: 'success'
        }
      });

      // Process response based on stage
      await this.processStageResponse(projectId, stageName, llmResponse);

      // Check for safety gate (with override support)
      const safetyGate = (llmResponse.json?.safety_gate || 
                        llmResponse.text.includes('SAFETY GATE')) && 
                        !process.env.SAFETY_GATE_OVERRIDE;

      if (safetyGate) {
        await prisma.project.update({
          where: { id: projectId },
          data: { status: 'safety_gate' }
        });
        console.log('Safety gate triggered - stopping pipeline');
      } else if (llmResponse.json?.safety_gate || llmResponse.text.includes('SAFETY GATE')) {
        console.log('Safety gate triggered but overridden by SAFETY_GATE_OVERRIDE environment variable');
      }

      return {
        success: true,
        data: llmResponse.json || llmResponse.text,
        safetyGate,
        openQuestions: llmResponse.json?.open_questions
      };

    } catch (error: any) {
      console.error(`Stage ${stageName} failed:`, error);

      // Record failure in PromptRun
      await prisma.promptRun.create({
        data: {
          projectId,
          stage: stageName,
          inputJson: JSON.stringify(input),
          status: 'error',
          error: error.message,
        },
      });

      // Record failure in FailedStage
      await prisma.failedStage.create({
        data: {
          projectId,
          stageName,
          inputData: JSON.stringify(input),
          error: error.message,
        },
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  private buildPriorContext(project: any, stage: Stage): Record<string, any> {
    const context: Record<string, any> = {};

    // Get previous stage outputs
    const relevantRuns = project.promptRuns.filter((run: any) => 
      run.status === 'success' && run.outputJson
    );

    for (const run of relevantRuns) {
      try {
        const data = JSON.parse(run.outputJson);
        context[run.stage] = data;
      } catch (e) {
        console.error('Failed to parse prior run data:', e);
      }
    }

    // Add current modules/BOM if relevant
    if (stage === 'bom' || stage === 'sourcing') {
      context.currentModules = project.modules;
      context.currentBom = project.bomItems;
    }

    return context;
  }

  private async processStageResponse(projectId: string, stage: Stage, response: any, tx: any) {
    const data = response.json;
    if (!data) return;

    switch (stage) {
      case 'meta':
        // Update project with meta analysis (respect override)
        const shouldSetSafetyGate = data.safety_gate && !process.env.SAFETY_GATE_OVERRIDE;
        await tx.project.update({
          where: { id: projectId },
          data: {
            reviewId: `review_${Date.now()}`,
            status: shouldSetSafetyGate ? 'safety_gate' : 'analyzed'
          }
        });
        break;

      case 'components':
        // Create modules for each component type (optimized bulk operation)
        const electronicsModules = [];
        for (const [category, options] of Object.entries(data)) {
          if (Array.isArray(options)) {
            for (const option of options) {
              electronicsModules.push({
                projectId,
                kind: 'electronics',
                label: option.part_no || category,
                componentRef: option.part_no,
                detailsMd: `${option.description}\n\nSpecs: ${option.specs}`,
                metadata: JSON.stringify(option)
              });
            }
          }
        }
        if (electronicsModules.length > 0) {
          await BulkOperations.createModules(electronicsModules, tx);
        }
        break;

      case 'wiring':
        // Create connections between modules
        if (data.connections) {
          for (const conn of data.connections) {
            for (const wire of conn.connections) {
              await tx.connection.create({
                data: {
                  projectId,
                  fromModuleId: conn.component,
                  toModuleId: 'MCU',
                  type: 'wiring',
                  label: `${wire.pin}→${wire.mcu_pin}`,
                  metadata: JSON.stringify(wire)
                }
              });
            }
          }
        }
        break;

      case 'mechanical':
        // Create mechanical part modules (optimized bulk operation)
        if (data.custom_parts) {
          const mechanicalModules = data.custom_parts.map((part: any) => ({
            projectId,
            kind: 'mechanical',
            label: part.part,
            detailsMd: `Material: ${part.material}\nManufacturing: ${part.manufacturing}`,
            metadata: JSON.stringify(part)
          }));
          
          if (mechanicalModules.length > 0) {
            await BulkOperations.createModules(mechanicalModules, tx);
          }
        }
        break;

      case 'firmware':
        // Update firmware modules with code (optimized query + bulk update)
        const firmwareModules = await BulkOperations.getModulesWithFirmware(projectId, ['electronics'], tx);

        if (firmwareModules.length > 0 && response.text) {
          const firmwareUpdates = firmwareModules.slice(0, 1).map(module => ({
            id: module.id,
            firmwareCode: response.text
          }));
          
          await BulkOperations.updateModuleFirmware(firmwareUpdates, tx);
          
          // Update metadata separately for first module
          await tx.module.update({
            where: { id: firmwareModules[0].id },
            data: { metadata: JSON.stringify(data) }
          });
        }
        break;

      case 'bom':
        // Create BOM items (optimized bulk operation)
        if (data.items) {
          const bomItems = data.items.map((item: any) => ({
            category: item.category,
            partNumber: item.part_no,
            description: item.description,
            quantity: item.quantity,
            unitCost: item.unit_cost,
            extendedCost: item.extended_cost,
            notes: item.notes
          }));
          
          await BulkOperations.replaceBomItems(projectId, bomItems, tx);
        }
        break;

      case 'sourcing':
        // Create supplier links (optimized bulk operation)
        if (data.sourcing) {
          const supplierLinks = [];
          
          for (const item of data.sourcing) {
            for (const supplier of (item.suppliers || [])) {
              supplierLinks.push({
                partNumber: item.part_no,
                supplier: supplier.name,
                availability: supplier.availability,
                datasheetUrl: item.datasheet,
                purchaseUrl: supplier.url,
                altPartsJson: JSON.stringify(item.alternates)
              });
            }
          }
          
          await BulkOperations.replaceSupplierLinks(projectId, supplierLinks, tx);
        }
        break;
    }

    // Add audit log entry
    await tx.auditLog.create({
      data: {
        projectId,
        action: `stage_${stage}_completed`,
        detail: `Processed ${stage} stage successfully`
      }
    });
  }

  async runMeta(projectId: string): Promise<StageResult> {
    return prisma.$transaction(async (tx) => {
      try {
        const project = await tx.project.findUnique({
          where: { id: projectId },
        });

        if (!project) {
          throw new Error('Project not found');
        }

        // Run meta analysis first
        const metaResult = await this.runStage(projectId, 'meta', {
          projectDescription: project.description,
        }, tx);

        if (!metaResult.success) {
          return metaResult;
        }

        // If no safety gate (or override enabled), run all other stages
        const shouldContinue = !metaResult.safetyGate || process.env.SAFETY_GATE_OVERRIDE;
        
        if (shouldContinue) {
          if (process.env.SAFETY_GATE_OVERRIDE && metaResult.safetyGate) {
            console.log('Safety gate overridden - continuing with all stages');
          }
          
          const parallelStages: Stage[] = ['components', 'mechanical'];
          const sequentialStages: Stage[] = ['wiring', 'firmware', 'bom', 'sourcing'];
          const limit = pLimit(2);

          const parallelPromises = parallelStages.map(stage => 
            limit(() => this.runStage(projectId, stage, { projectDescription: project.description }, tx))
          );

          const parallelResults = await Promise.all(parallelPromises);

          for (const result of parallelResults) {
            if (!result.success) {
              console.error(`A parallel stage failed:`, result.error);
            }
          }

          for (const stage of sequentialStages) {
            const result = await this.runStage(projectId, stage, {
              projectDescription: project.description,
            }, tx);
            
            if (!result.success) {
              console.error(`Stage ${stage} failed:`, result.error);
              // Continue with other stages even if one fails
            }
          }
        }

        return {
          success: true,
          data: {
            message: 'Pipeline completed',
            safetyGate: metaResult.safetyGate,
          },
          safetyGate: metaResult.safetyGate,
        };

      } catch (error: any) {
        console.error('Meta orchestration failed:', error);
        return {
          success: false,
          error: error.message,
        };
      }
    });
  }

  // New event-driven orchestration methods
  async startOrchestration(projectId: string, opts?: { 
    resumeFromStage?: string; 
    maxConcurrency?: number 
  }): Promise<{ runId: string }> {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create run state
    const run: OrchestrationRun = {
      id: runId,
      projectId,
      status: 'starting',
      stages: new Map(),
      issues: { erc: [], drc: [] },
      paused: false,
      cancelling: false,
      maxConcurrency: opts?.maxConcurrency || 3,
      createdAt: new Date()
    };

    // Initialize stage statuses
    const allStages: Stage[] = ['meta', 'components', 'wiring', 'mechanical', 'firmware', 'bom', 'sourcing'];
    const resumeFrom = opts?.resumeFromStage;
    const startIndex = resumeFrom ? allStages.indexOf(resumeFrom as Stage) : 0;
    
    for (let i = startIndex; i < allStages.length; i++) {
      run.stages.set(allStages[i], {
        id: allStages[i],
        status: 'pending',
        attempts: 0
      });
    }

    activeRuns.set(runId, run);

    // Start the pipeline asynchronously
    this.runFullPipeline(runId).catch(error => {
      console.error('Pipeline execution failed:', error);
      run.status = 'error';
      run.lastError = error.message;
      pipelineBus.emit("error", { runId, message: error.message });
    });

    return { runId };
  }

  private async runFullPipeline(runId: string): Promise<void> {
    const run = activeRuns.get(runId);
    if (!run) throw new Error('Run not found');

    run.status = 'running';
    pipelineBus.emit("status", { runId, status: 'running' });

    try {
      const project = await prisma.project.findUnique({
        where: { id: run.projectId }
      });

      if (!project) {
        throw new Error('Project not found');
      }

      // Create concurrency limiter
      const limit = pLimit(run.maxConcurrency);
      
      // Get stages to run
      const stagesToRun = Array.from(run.stages.keys()) as Stage[];
      
      // For now, run stages sequentially (can be parallelized later for certain stages)
      for (const stageName of stagesToRun) {
        // Check for pause/cancel before each stage
        if (await this.checkPauseOrCancel(runId)) {
          return;
        }

        this.emitStageProgress(runId, stageName, 'running', `Starting ${stageName} stage`);
        
        try {
          const result = await this.runStage(run.projectId, stageName, {
            projectDescription: project.description
          });

          if (result.success) {
            this.emitStageProgress(runId, stageName, 'done', `${stageName} completed successfully`);
            
            // Update issues if provided
            if (result.data?.issues) {
              run.issues = result.data.issues;
              pipelineBus.emit("issues", { runId, issues: run.issues });
            }

            // Update schematic if provided  
            if (result.data?.schematic) {
              run.schematic = result.data.schematic;
            }
          } else {
            this.emitStageProgress(runId, stageName, 'error', result.error || `${stageName} failed`);
            
            // Continue with other stages even if one fails
            console.error(`Stage ${stageName} failed:`, result.error);
          }
        } catch (error: any) {
          this.emitStageProgress(runId, stageName, 'error', error.message);
          console.error(`Stage ${stageName} error:`, error);
        }
      }

      // Mark as complete
      run.status = 'done';
      run.summary = {
        completedStages: stagesToRun.length,
        successfulStages: Array.from(run.stages.values()).filter(s => s.status === 'done').length,
        completedAt: new Date()
      };

      pipelineBus.emit("done", { runId, summary: run.summary });
      pipelineBus.emit("status", { runId, status: 'done' });

    } catch (error: any) {
      run.status = 'error';
      run.lastError = error.message;
      pipelineBus.emit("error", { runId, message: error.message });
      pipelineBus.emit("status", { runId, status: 'error' });
    }
  }

  pauseOrchestration(runId: string): boolean {
    const run = activeRuns.get(runId);
    if (!run) return false;
    
    run.paused = true;
    run.status = 'paused';
    return true;
  }

  resumeOrchestration(runId: string): boolean {
    const run = activeRuns.get(runId);
    if (!run) return false;
    
    run.paused = false;
    run.status = 'running';
    return true;
  }

  cancelOrchestration(runId: string): boolean {
    const run = activeRuns.get(runId);
    if (!run) return false;
    
    run.cancelling = true;
    run.status = 'cancelling';
    return true;
  }

  snapshotStatus(projectId: string, runId?: string): any {
    // Find the most recent run for this project
    let run: OrchestrationRun | undefined;
    
    if (runId) {
      run = activeRuns.get(runId);
    } else {
      // Find the most recent run for this project
      const projectRuns = Array.from(activeRuns.values())
        .filter(r => r.projectId === projectId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      run = projectRuns[0];
    }

    if (!run) {
      return {
        status: 'idle',
        stages: [],
        issues: { erc: [], drc: [] },
        schematic: null,
        summary: null
      };
    }

    return {
      status: run.status,
      stages: Array.from(run.stages.values()),
      issues: run.issues,
      schematic: run.schematic,
      summary: run.summary,
      lastError: run.lastError
    };
  }
}

// Singleton instance
let pipeline: OrchestrationPipeline | null = null;

export function getOrchestrationPipeline(): OrchestrationPipeline {
  if (!pipeline) {
    pipeline = new OrchestrationPipeline();
  }
  return pipeline;
}

export default OrchestrationPipeline;