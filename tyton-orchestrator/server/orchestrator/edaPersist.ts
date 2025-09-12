import { EdaSpecV1 } from "@/server/services/eda/spec";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface EdaVersionHistory {
  timestamp: string;
  version: string;
  changes: string[];
  edaSpec: EdaSpecV1;
}

interface EdaMetadata {
  edaSpec: EdaSpecV1;
  version: string;
  timestamp: string;
  lastEnrichment?: string;
  history: EdaVersionHistory[];
}

export async function saveEdaSpecWithVersioning(
  projectId: string,
  newEdaSpec: EdaSpecV1,
  changes: string[] = []
): Promise<void> {
  console.log(`[EDA_PERSIST] Saving EDA spec with versioning for project ${projectId}`);
  
  const timestamp = new Date().toISOString();
  
  // Load existing module to get history
  const existingModule = await prisma.module.findFirst({
    where: { projectId, kind: "eda" }
  });
  
  let existingMetadata: EdaMetadata | null = null;
  if (existingModule?.metadata) {
    try {
      existingMetadata = JSON.parse(existingModule.metadata as string);
    } catch (e) {
      console.warn('[EDA_PERSIST] Could not parse existing metadata:', e);
    }
  }
  
  // Create new version history entry
  const newVersionEntry: EdaVersionHistory = {
    timestamp,
    version: newEdaSpec.version,
    changes: changes.length > 0 ? changes : ['EDA specification updated'],
    edaSpec: newEdaSpec
  };
  
  // Build new metadata with history
  const newMetadata: EdaMetadata = {
    edaSpec: newEdaSpec,
    version: newEdaSpec.version,
    timestamp,
    lastEnrichment: existingMetadata?.lastEnrichment,
    history: [
      ...(existingMetadata?.history || []),
      newVersionEntry
    ].slice(-10) // Keep last 10 versions
  };
  
  // Generate summary markdown
  const summaryMd = generateEdaSummaryMd(newEdaSpec, newMetadata.history.length);
  
  // Upsert module
  await prisma.module.upsert({
    where: { 
      id: existingModule?.id || "___new_eda___" 
    },
    update: {
      label: "EDA Layout Specification",
      detailsMd: summaryMd,
      metadata: JSON.stringify(newMetadata),
    },
    create: {
      projectId,
      kind: "eda",
      label: "EDA Layout Specification",
      detailsMd: summaryMd,
      metadata: JSON.stringify(newMetadata),
    }
  });
  
  console.log(`[EDA_PERSIST] EDA spec saved successfully (version ${newVersionEntry.version})`);
}

export async function loadEdaSpec(projectId: string): Promise<EdaSpecV1 | null> {
  console.log(`[EDA_PERSIST] Loading EDA spec for project ${projectId}`);
  
  const module = await prisma.module.findFirst({
    where: { projectId, kind: "eda" }
  });
  
  if (!module?.metadata) {
    console.log('[EDA_PERSIST] No EDA spec found');
    return null;
  }
  
  try {
    const metadata: EdaMetadata = JSON.parse(module.metadata as string);
    return metadata.edaSpec;
  } catch (e) {
    console.error('[EDA_PERSIST] Failed to parse EDA metadata:', e);
    return null;
  }
}

export async function getEdaVersionHistory(projectId: string): Promise<EdaVersionHistory[]> {
  console.log(`[EDA_PERSIST] Loading EDA version history for project ${projectId}`);
  
  const module = await prisma.module.findFirst({
    where: { projectId, kind: "eda" }
  });
  
  if (!module?.metadata) {
    return [];
  }
  
  try {
    const metadata: EdaMetadata = JSON.parse(module.metadata as string);
    return metadata.history || [];
  } catch (e) {
    console.error('[EDA_PERSIST] Failed to parse EDA metadata for history:', e);
    return [];
  }
}

export async function revertToEdaVersion(
  projectId: string, 
  targetTimestamp: string
): Promise<EdaSpecV1 | null> {
  console.log(`[EDA_PERSIST] Reverting EDA spec to version ${targetTimestamp}`);
  
  const history = await getEdaVersionHistory(projectId);
  const targetVersion = history.find(h => h.timestamp === targetTimestamp);
  
  if (!targetVersion) {
    throw new Error(`Version ${targetTimestamp} not found in history`);
  }
  
  // Save the reverted version as a new version
  await saveEdaSpecWithVersioning(
    projectId,
    targetVersion.edaSpec,
    [`Reverted to version from ${targetTimestamp}`]
  );
  
  return targetVersion.edaSpec;
}

export function compareEdaSpecs(oldSpec: EdaSpecV1, newSpec: EdaSpecV1): string[] {
  const changes: string[] = [];
  
  // Compare components
  if (oldSpec.components.length !== newSpec.components.length) {
    changes.push(`Component count changed: ${oldSpec.components.length} → ${newSpec.components.length}`);
  }
  
  // Check for footprint changes
  const footprintChanges = newSpec.components.filter((newComp, index) => {
    const oldComp = oldSpec.components.find(c => c.ref === newComp.ref);
    return oldComp && oldComp.footprint !== newComp.footprint;
  });
  
  if (footprintChanges.length > 0) {
    changes.push(`${footprintChanges.length} footprint(s) changed`);
  }
  
  // Check for placement changes
  const placementChanges = newSpec.placement.filter((newPlace) => {
    const oldPlace = oldSpec.placement.find(p => p.ref === newPlace.ref);
    return oldPlace && (
      Math.abs(oldPlace.x_mm - newPlace.x_mm) > 0.1 || 
      Math.abs(oldPlace.y_mm - newPlace.y_mm) > 0.1
    );
  });
  
  if (placementChanges.length > 0) {
    changes.push(`${placementChanges.length} component(s) repositioned`);
  }
  
  // Compare board dimensions
  if (oldSpec.board.outline_mm.width !== newSpec.board.outline_mm.width ||
      oldSpec.board.outline_mm.height !== newSpec.board.outline_mm.height) {
    changes.push('Board dimensions changed');
  }
  
  // Compare net classes
  if (oldSpec.netClasses.length !== newSpec.netClasses.length) {
    changes.push(`Net class count changed: ${oldSpec.netClasses.length} → ${newSpec.netClasses.length}`);
  }
  
  return changes.length > 0 ? changes : ['Minor updates'];
}

function generateEdaSummaryMd(eda: EdaSpecV1, versionCount: number): string {
  let md = `# EDA Layout Specification v${eda.version}\\n\\n`;
  
  md += `## Board Overview\\n`;
  md += `- **Target**: ${eda.target.tool} ${eda.target.version}\\n`;
  md += `- **Dimensions**: ${eda.board.outline_mm.width}×${eda.board.outline_mm.height}mm\\n`;
  md += `- **Layers**: ${eda.board.layers}\\n`;
  md += `- **Components**: ${eda.components.length}\\n`;
  md += `- **Versions**: ${versionCount}\\n\\n`;
  
  // Component status
  const assignedComponents = eda.components.filter(c => c.footprint && c.footprint !== 'TBD');
  const assignmentProgress = Math.round((assignedComponents.length / eda.components.length) * 100);
  
  md += `## Component Status\\n`;
  md += `- **Assigned**: ${assignedComponents.length}/${eda.components.length} (${assignmentProgress}%)\\n`;
  md += `- **Placement**: ${eda.placement.length} positioned\\n\\n`;
  
  if (eda.netClasses.length > 0) {
    md += `## Net Classes\\n`;
    eda.netClasses.forEach(nc => {
      md += `- **${nc.name}**: ${nc.track_mm}mm track, ${nc.clearance_mm}mm clearance\\n`;
    });
    md += "\\n";
  }
  
  if (eda.constraints?.antenna_keepouts?.length) {
    md += `## Design Constraints\\n`;
    md += `- **Antenna Keepouts**: ${eda.constraints.antenna_keepouts.length}\\n`;
    if (eda.constraints.high_current_nets?.length) {
      md += `- **High Current Nets**: ${eda.constraints.high_current_nets.length}\\n`;
    }
    md += "\\n";
  }
  
  if (eda.openQuestions && eda.openQuestions.length > 0) {
    md += `## Open Questions (${eda.openQuestions.length})\\n`;
    eda.openQuestions.slice(0, 5).forEach(q => md += `- ${q}\\n`);
    if (eda.openQuestions.length > 5) {
      md += `- ... and ${eda.openQuestions.length - 5} more\\n`;
    }
    md += "\\n";
  }
  
  md += `## Manufacturing\\n`;
  if (eda.manufacturing) {
    const mfg = eda.manufacturing;
    md += `- **Fab**: ${mfg.fab || 'TBD'}\\n`;
    md += `- **Thickness**: ${mfg.thickness_mm || 1.6}mm\\n`;
    md += `- **Min Track**: ${mfg.min_track_mm || 0.127}mm\\n`;
    md += `- **Finish**: ${mfg.finish || 'HASL'}\\n`;
  }
  
  return md;
}