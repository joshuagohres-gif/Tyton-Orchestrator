const fs = require('fs').promises;
const path = require('path');

/**
 * Artifact Storage Manager
 * Actually saves generated artifacts to disk (not just URLs)
 * Handles file organization, cleanup, and retrieval
 */
class ArtifactStorage {
  constructor(baseDir = 'exports') {
    this.baseDir = path.join(__dirname, '..', 'public', baseDir);
  }

  /**
   * Initialize storage directory
   */
  async initialize() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  /**
   * Get project export directory
   */
  getProjectDir(projectId) {
    return path.join(this.baseDir, projectId);
  }

  /**
   * Ensure project directory exists
   */
  async ensureProjectDir(projectId) {
    const projectDir = this.getProjectDir(projectId);
    await fs.mkdir(projectDir, { recursive: true });
    return projectDir;
  }

  /**
   * Save compatibility report
   */
  async saveCompatibilityReport(projectId, compatibility) {
    const projectDir = await this.ensureProjectDir(projectId);
    const filePath = path.join(projectDir, 'compatibility-report.json');
    
    await fs.writeFile(filePath, JSON.stringify(compatibility, null, 2));
    
    return {
      path: filePath,
      url: `/exports/${projectId}/compatibility-report.json`,
      size: (await fs.stat(filePath)).size
    };
  }

  /**
   * Save firmware files as ZIP
   */
  async saveFirmware(projectId, firmware) {
    const projectDir = await this.ensureProjectDir(projectId);
    const firmwareDir = path.join(projectDir, 'firmware');
    
    // Create firmware directory
    await fs.mkdir(firmwareDir, { recursive: true });
    
    // Save each file
    for (const file of firmware.files) {
      const filePath = path.join(firmwareDir, file.name);
      await fs.writeFile(filePath, file.content);
    }
    
    // Also save as single concatenated file for quick access
    const mainPath = path.join(projectDir, 'firmware.txt');
    await fs.writeFile(mainPath, firmware.mainCode);
    
    return {
      path: firmwareDir,
      url: `/exports/${projectId}/firmware.zip`, // Would need actual ZIP in production
      mainFile: `/exports/${projectId}/firmware.txt`,
      fileCount: firmware.files.length,
      size: (await this.getDirectorySize(firmwareDir))
    };
  }

  /**
   * Save wiring diagram SVG
   */
  async saveWiring(projectId, wiring) {
    const projectDir = await this.ensureProjectDir(projectId);
    const filePath = path.join(projectDir, 'wiring.svg');
    
    await fs.writeFile(filePath, wiring.svg);
    
    // Also save netlist as JSON for programmatic access
    const netlistPath = path.join(projectDir, 'netlist.json');
    await fs.writeFile(netlistPath, JSON.stringify({
      devices: wiring.devices,
      nets: wiring.nets
    }, null, 2));
    
    return {
      path: filePath,
      url: `/exports/${projectId}/wiring.svg`,
      netlistUrl: `/exports/${projectId}/netlist.json`,
      size: (await fs.stat(filePath)).size
    };
  }

  /**
   * Save CAD enclosure STL
   */
  async saveEnclosure(projectId, enclosure) {
    const projectDir = await this.ensureProjectDir(projectId);
    const filePath = path.join(projectId, 'enclosure.stl');
    
    await fs.writeFile(filePath, enclosure.stlContent);
    
    // Save metadata
    const metaPath = path.join(projectDir, 'enclosure-metadata.json');
    await fs.writeFile(metaPath, JSON.stringify({
      dimensions: enclosure.dimensions,
      volume: enclosure.volume,
      weight: enclosure.weight,
      material: enclosure.material,
      printSettings: enclosure.printSettings,
      features: enclosure.features
    }, null, 2));
    
    return {
      path: filePath,
      url: `/exports/${projectId}/enclosure.stl`,
      metadataUrl: `/exports/${projectId}/enclosure-metadata.json`,
      size: (await fs.stat(filePath)).size
    };
  }

  /**
   * Save simulation report
   */
  async saveSimulation(projectId, simulation) {
    const projectDir = await this.ensureProjectDir(projectId);
    
    // Save JSON report
    const jsonPath = path.join(projectDir, 'simulation-report.json');
    await fs.writeFile(jsonPath, JSON.stringify(simulation, null, 2));
    
    // Generate HTML report (simplified)
    const htmlPath = path.join(projectDir, 'simulation-report.html');
    const html = this.generateSimulationHTML(simulation);
    await fs.writeFile(htmlPath, html);
    
    return {
      jsonPath,
      htmlPath,
      url: `/exports/${projectId}/simulation-report.html`,
      jsonUrl: `/exports/${projectId}/simulation-report.json`,
      size: (await fs.stat(htmlPath)).size
    };
  }

  /**
   * Save documentation
   */
  async saveDocumentation(projectId, documentation) {
    const projectDir = await this.ensureProjectDir(projectId);
    const filePath = path.join(projectDir, 'README.md');
    
    await fs.writeFile(filePath, documentation.content);
    
    // Save metadata
    const metaPath = path.join(projectDir, 'docs-metadata.json');
    await fs.writeFile(metaPath, JSON.stringify({
      type: documentation.type,
      sections: documentation.sections,
      wordCount: documentation.wordCount,
      readingTime: documentation.readingTime,
      metadata: documentation.metadata
    }, null, 2));
    
    return {
      path: filePath,
      url: `/exports/${projectId}/README.md`,
      metadataUrl: `/exports/${projectId}/docs-metadata.json`,
      size: (await fs.stat(filePath)).size
    };
  }

  /**
   * Save project summary/manifest
   */
  async saveProjectSummary(projectId, collated) {
    const projectDir = await this.ensureProjectDir(projectId);
    const filePath = path.join(projectDir, 'project.json');
    
    await fs.writeFile(filePath, JSON.stringify(collated, null, 2));
    
    return {
      path: filePath,
      url: `/exports/${projectId}/project.json`,
      size: (await fs.stat(filePath)).size
    };
  }

  /**
   * Generate HTML for simulation report
   */
  generateSimulationHTML(simulation) {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Simulation Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
    h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .status { display: inline-block; padding: 5px 15px; border-radius: 4px; font-weight: bold; }
    .status.passed { background: #4CAF50; color: white; }
    .status.warning { background: #FF9800; color: white; }
    .status.failed { background: #F44336; color: white; }
    .test-suite { margin: 20px 0; padding: 15px; background: #f9f9f9; border-left: 4px solid #2196F3; }
    .test { margin: 10px 0; padding: 10px; background: white; border-radius: 4px; }
    .test-pass { border-left: 3px solid #4CAF50; }
    .test-warning { border-left: 3px solid #FF9800; }
    .test-fail { border-left: 3px solid #F44336; }
    .recommendation { margin: 10px 0; padding: 10px; background: #FFF3CD; border-left: 3px solid #FFC107; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #ddd; }
    th { background: #f0f0f0; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Circuit Simulation Report</h1>
    <p><strong>Status:</strong> <span class="status ${simulation.status}">${simulation.status.toUpperCase()}</span></p>
    <p><strong>Tests:</strong> ${simulation.metadata.passedTests}/${simulation.metadata.totalTests} passed</p>
    <p><strong>Duration:</strong> ${simulation.metadata.duration}</p>
    
    <h2>Test Results</h2>
    ${simulation.tests.map(suite => `
      <div class="test-suite">
        <h3>${suite.name} <span class="status ${suite.status}">${suite.status}</span></h3>
        ${suite.tests.map(test => `
          <div class="test test-${test.status}">
            <strong>${test.name}:</strong> ${test.value || 'N/A'}
            ${test.expected ? `<br><em>Expected: ${test.expected}</em>` : ''}
            ${test.warnings && test.warnings.length > 0 ? `<br><small style="color: #FF9800;">⚠️ ${test.warnings.join(', ')}</small>` : ''}
          </div>
        `).join('')}
      </div>
    `).join('')}
    
    <h2>Recommendations</h2>
    ${simulation.recommendations.map(rec => `
      <div class="recommendation">
        <strong>${rec.category.toUpperCase()} [${rec.priority}]:</strong> ${rec.issue}<br>
        <em>Solution: ${rec.solution}</em>
      </div>
    `).join('')}
    
    <h2>Technical Details</h2>
    <table>
      <tr><th>Property</th><th>Value</th></tr>
      <tr><td>Complexity</td><td>${simulation.metadata.complexity}</td></tr>
      <tr><td>Total Tests</td><td>${simulation.metadata.totalTests}</td></tr>
      <tr><td>Passed Tests</td><td>${simulation.metadata.passedTests}</td></tr>
      <tr><td>Execution Time</td><td>${simulation.metadata.duration}</td></tr>
    </table>
  </div>
</body>
</html>`;
  }

  /**
   * Get directory size recursively
   */
  async getDirectorySize(dirPath) {
    let totalSize = 0;
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath);
        } else {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      console.error(`Error calculating directory size for ${dirPath}:`, error);
    }
    
    return totalSize;
  }

  /**
   * Delete project artifacts
   */
  async deleteProjectArtifacts(projectId) {
    const projectDir = this.getProjectDir(projectId);
    
    try {
      await fs.rm(projectDir, { recursive: true, force: true });
      console.log(`🗑️  Deleted artifacts for project ${projectId}`);
      return true;
    } catch (error) {
      console.error(`Error deleting artifacts for ${projectId}:`, error);
      return false;
    }
  }

  /**
   * List all project artifacts
   */
  async listProjectArtifacts(projectId) {
    const projectDir = this.getProjectDir(projectId);
    
    try {
      const files = await fs.readdir(projectDir);
      const artifacts = [];
      
      for (const file of files) {
        const filePath = path.join(projectDir, file);
        const stats = await fs.stat(filePath);
        
        artifacts.push({
          name: file,
          path: filePath,
          url: `/exports/${projectId}/${file}`,
          size: stats.size,
          modified: stats.mtime
        });
      }
      
      return artifacts;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // No artifacts yet
      }
      throw error;
    }
  }
}

module.exports = ArtifactStorage;
