/**
 * Data Structure Validator
 * Validates data.json structure before pipeline operations
 * Prevents crashes from missing or malformed data
 */
class DataValidator {
  /**
   * Validate complete data structure
   */
  validateData(data) {
    const errors = [];
    
    // Check root structure
    if (!data || typeof data !== 'object') {
      errors.push('Data is not a valid object');
      return { valid: false, errors };
    }
    
    // Validate creation_engine structure
    if (!data.creation_engine) {
      errors.push('Missing creation_engine object');
    } else {
      errors.push(...this.validateCreationEngine(data.creation_engine));
    }
    
    // Validate component_cache
    if (!data.component_cache) {
      errors.push('Missing component_cache array');
    } else if (!Array.isArray(data.component_cache)) {
      errors.push('component_cache must be an array');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate creation_engine structure
   */
  validateCreationEngine(creationEngine) {
    const errors = [];
    
    // Check required arrays
    const requiredArrays = ['projects', 'runs', 'tasks', 'bom', 'artifacts'];
    
    for (const field of requiredArrays) {
      if (!creationEngine[field]) {
        errors.push(`Missing creation_engine.${field} array`);
      } else if (!Array.isArray(creationEngine[field])) {
        errors.push(`creation_engine.${field} must be an array`);
      }
    }
    
    return errors;
  }

  /**
   * Validate run exists and is in valid state
   */
  validateRun(run, runId) {
    const errors = [];
    
    if (!run) {
      errors.push(`Run ${runId} not found`);
      return { valid: false, errors };
    }
    
    if (!run.id) {
      errors.push('Run missing id field');
    }
    
    if (!run.projectId) {
      errors.push('Run missing projectId field');
    }
    
    if (!run.status) {
      errors.push('Run missing status field');
    }
    
    // Check if run is in a state that can be executed
    if (run.status === 'running') {
      errors.push(
        `Run ${runId} is already running. ` +
        `This may indicate a crashed process or concurrent execution.`
      );
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate project exists and has required fields
   */
  validateProject(project, projectId) {
    const errors = [];
    
    if (!project) {
      errors.push(`Project ${projectId} not found`);
      return { valid: false, errors };
    }
    
    if (!project.id) {
      errors.push('Project missing id field');
    }
    
    if (!project.userId) {
      errors.push('Project missing userId field');
    }
    
    if (!project.summary && !project.templateId) {
      errors.push('Project must have either summary or templateId');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate stage context has required data
   */
  validateStageContext(stageName, context) {
    const errors = [];
    
    // All stages require project and run
    if (!context.project) {
      errors.push(`${stageName}: context missing project`);
    }
    
    if (!context.run) {
      errors.push(`${stageName}: context missing run`);
    }
    
    // Stage-specific validations
    switch (stageName) {
      case 'decompose':
        if (!context.spec) {
          errors.push('decompose: requires spec from parseSpec stage');
        }
        break;
        
      case 'sourceParts':
        if (!context.subsystems || context.subsystems.length === 0) {
          errors.push('sourceParts: requires subsystems from decompose stage');
        }
        break;
        
      case 'compatCheck':
      case 'firmware':
      case 'wiring':
      case 'cad':
      case 'simulate':
        if (!context.components || context.components.length === 0) {
          errors.push(`${stageName}: requires components from sourceParts stage`);
        }
        if (!context.spec) {
          errors.push(`${stageName}: requires spec from parseSpec stage`);
        }
        break;
        
      case 'docs':
        if (!context.spec) {
          errors.push('docs: requires spec from parseSpec stage');
        }
        if (!context.components) {
          errors.push('docs: requires components from sourceParts stage');
        }
        break;
        
      case 'collate':
        if (!context.artifacts || context.artifacts.length === 0) {
          errors.push('collate: no artifacts generated from previous stages');
        }
        break;
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate stage output
   */
  validateStageOutput(stageName, output) {
    const errors = [];
    
    switch (stageName) {
      case 'parseSpec':
        if (!output || !output.purpose) {
          errors.push('parseSpec: output missing purpose field');
        }
        if (!output.features || output.features.length === 0) {
          errors.push('parseSpec: output has no features');
        }
        if (!output.constraints) {
          errors.push('parseSpec: output missing constraints');
        }
        break;
        
      case 'decompose':
        if (!Array.isArray(output) || output.length === 0) {
          errors.push('decompose: output must be non-empty array of subsystems');
        }
        break;
        
      case 'sourceParts':
        if (!Array.isArray(output)) {
          errors.push('sourceParts: output must be array of components');
        }
        const foundComponents = output.filter(c => !c.missing);
        if (foundComponents.length === 0) {
          errors.push('sourceParts: no components found in cache (all missing)');
        }
        break;
        
      case 'compatCheck':
        if (!output || !output.overall) {
          errors.push('compatCheck: output missing overall status');
        }
        if (!output.checks) {
          errors.push('compatCheck: output missing compatibility checks');
        }
        break;
        
      case 'firmware':
        if (!output || !output.files || output.files.length === 0) {
          errors.push('firmware: output has no generated files');
        }
        if (!output.platform) {
          errors.push('firmware: output missing platform information');
        }
        break;
        
      case 'wiring':
        if (!output || !output.devices || output.devices.length === 0) {
          errors.push('wiring: output has no devices');
        }
        if (!output.svg) {
          errors.push('wiring: output missing SVG diagram');
        }
        break;
        
      case 'cad':
        if (!output || !output.stlContent) {
          errors.push('cad: output missing STL content');
        }
        if (!output.dimensions) {
          errors.push('cad: output missing dimensions');
        }
        break;
        
      case 'simulate':
        if (!output || !output.status) {
          errors.push('simulate: output missing status');
        }
        if (!output.tests || output.tests.length === 0) {
          errors.push('simulate: output has no test results');
        }
        break;
        
      case 'docs':
        if (!output || !output.content) {
          errors.push('docs: output missing content');
        }
        if (!output.sections || output.sections.length === 0) {
          errors.push('docs: output has no sections');
        }
        break;
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Initialize data structure if missing
   * Creates required objects/arrays with safe defaults
   */
  initializeDataStructure(data) {
    if (!data.creation_engine) {
      data.creation_engine = {
        projects: [],
        runs: [],
        tasks: [],
        bom: [],
        artifacts: []
      };
    } else {
      // Ensure all required arrays exist
      if (!data.creation_engine.projects) data.creation_engine.projects = [];
      if (!data.creation_engine.runs) data.creation_engine.runs = [];
      if (!data.creation_engine.tasks) data.creation_engine.tasks = [];
      if (!data.creation_engine.bom) data.creation_engine.bom = [];
      if (!data.creation_engine.artifacts) data.creation_engine.artifacts = [];
    }
    
    if (!data.component_cache) {
      data.component_cache = [];
    }
    
    return data;
  }

  /**
   * Get helpful error message with context
   */
  formatValidationError(validation, context = '') {
    if (validation.valid) return null;
    
    const prefix = context ? `${context}: ` : '';
    return prefix + validation.errors.join('; ');
  }
}

module.exports = DataValidator;
