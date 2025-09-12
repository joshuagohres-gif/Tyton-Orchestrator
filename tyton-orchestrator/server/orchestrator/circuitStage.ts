
import { PrismaClient } from '@prisma/client';
import { getOpenAIService } from '@/server/llm/openai';
import { renderCircuitPrompt, CircuitPromptInput } from '@/lib/prompts/p7_circuit';
import { buildWiringArtifacts } from '@/server/services/wiringFromSpec';
import { SchematicSpecV12Schema, SchematicSpecV12 } from '@/server/validation/schematicSpecValidator';
import { llmRouter } from '@/server/llm/router';

const prisma = new PrismaClient();

export async function runCircuitStage(projectId: string, input: CircuitPromptInput) {
  const prompt = renderCircuitPrompt(input);

  const llmResponse = await llmRouter.completeJSON({
    prompt,
    schema: SchematicSpecV12Schema,
    options: {
      maxTokens: Number(process.env.ORCHESTRATION_MAX_TOKENS) || 4000,
      temperature: 0.1,
    },
  });

  const specJson = llmResponse;

  const pr = await prisma.promptRun.create({
    data: {
      projectId,
      stage: 'schematic',
      inputJson: JSON.stringify(input),
      outputText: JSON.stringify(llmResponse),
      outputJson: JSON.stringify(specJson),
      status: 'success',
    },
  });

  const { wiringMd, wiringJson, edges } = buildWiringArtifacts(specJson);

  const humanSummary = specJson.project.description;
  const pinMappingTable = ''; // This can be generated from the spec if needed

  let schematicMd = `## Circuit Summary\n\n${humanSummary}\n\n`;

  if (specJson.components && specJson.components.length > 0) {
    schematicMd += '## Components\n\n';
    specJson.components.forEach(comp => {
      schematicMd += `- **${comp.refDes}**: ${comp.mpn} (${comp.package})\n`;
      schematicMd += `  - ${comp.description}\n`;
    });
    schematicMd += '\n';
  }

  let module;
  try {
    module = await prisma.module.upsert({
      where: {
        id: (await prisma.module.findFirst({
          where: { projectId, kind: 'schematic' },
        }))?.id || '___new___',
      },
      update: {
        label: 'Circuit Schematic',
        detailsMd: schematicMd,
        metadata: JSON.stringify({
          schematicSpec: specJson,
        }),
      },
      create: {
        projectId,
        kind: 'schematic',
        label: 'Circuit Schematic',
        detailsMd: schematicMd,
        metadata: JSON.stringify({
          schematicSpec: specJson,
        }),
      },
    });
  } catch (e) {
    if (e.code === 'P2002') {
      module = await prisma.module.findFirst({ where: { projectId, kind: 'schematic' } });
    } else {
      throw e;
    }
  }

  let wiringModule;
  try {
    wiringModule = await prisma.module.upsert({
      where: {
        id: (await prisma.module.findFirst({
          where: { projectId, kind: 'wiring' },
        }))?.id || '___new___',
      },
      update: {
        label: 'Wiring Instructions',
        detailsMd: wiringMd,
        metadata: JSON.stringify({ wiring: wiringJson, spec: specJson }),
      },
      create: {
        projectId,
        kind: 'wiring',
        label: 'Wiring Instructions',
        detailsMd: wiringMd,
        metadata: JSON.stringify({ wiring: wiringJson, spec: specJson }),
      },
    });
  } catch (e) {
    if (e.code === 'P2002') {
      wiringModule = await prisma.module.findFirst({ where: { projectId, kind: 'wiring' } });
    } else {
      throw e;
    }
  }

  await prisma.connection.deleteMany({ where: { projectId, type: 'wiring' } });
  for (const e of edges) {
    await prisma.connection.create({ data: {
      projectId,
      fromModuleId: e.fromModuleId,
      toModuleId: e.toModuleId,
      type: 'wiring',
      label: e.label,
      metadata: JSON.stringify(e.meta || {}),
    }});
  }

  return {
    ok: true,
    errors: [],
    warnings: [],
    schematicModuleId: module.id,
    wiringModuleId: wiringModule.id,
    spec: specJson,
  };
}
