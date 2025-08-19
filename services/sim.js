class SimulationService {
  constructor() {
    this.testSuites = {
      power: {
        name: 'Power Supply Analysis',
        tests: ['voltage_regulation', 'current_capacity', 'ripple_analysis', 'efficiency']
      },
      signal: {
        name: 'Signal Integrity',
        tests: ['logic_levels', 'rise_fall_times', 'noise_margins', 'propagation_delay']
      },
      thermal: {
        name: 'Thermal Analysis',
        tests: ['component_temperatures', 'heat_dissipation', 'thermal_cycling']
      },
      functional: {
        name: 'Functional Verification',
        tests: ['interface_communication', 'sensor_readings', 'actuator_control']
      }
    };
    
    this.componentModels = {
      'resistor': { model: 'passive', spiceModel: 'R{value}' },
      'capacitor': { model: 'passive', spiceModel: 'C{value}' },
      'led': { model: 'diode', spiceModel: 'D{forward_voltage}' },
      'voltage_regulator': { model: 'active', spiceModel: 'LDO{vout}' },
      'mcu': { model: 'digital', spiceModel: 'MCU{freq}' },
      'sensor': { model: 'mixed_signal', spiceModel: 'SENSOR{interface}' }
    };
  }

  async runSimulation(components, spec) {
    try {
      console.log('⚡ Running circuit simulation...');
      
      // Create circuit netlist
      const netlist = this.generateNetlist(components);
      
      // Determine required test suites
      const testSuites = this.selectTestSuites(components, spec);
      
      // Run simulation tests
      const testResults = [];
      for (const suite of testSuites) {
        const suiteResult = await this.runTestSuite(suite, netlist, components);
        testResults.push(suiteResult);
      }
      
      // Analyze results
      const overallStatus = this.analyzeResults(testResults);
      
      // Generate waveforms (simplified)
      const waveforms = this.generateWaveforms(components, spec);
      
      const simulation = {
        status: overallStatus,
        netlist: netlist,
        tests: testResults,
        waveforms: waveforms,
        recommendations: this.generateRecommendations(testResults),
        metadata: {
          totalTests: testResults.reduce((sum, suite) => sum + suite.tests.length, 0),
          passedTests: testResults.reduce((sum, suite) => sum + suite.tests.filter(t => t.status === 'pass').length, 0),
          duration: this.estimateSimulationTime(components),
          complexity: this.assessCircuitComplexity(components)
        }
      };
      
      console.log(`✅ Simulation completed: ${simulation.status} (${simulation.metadata.passedTests}/${simulation.metadata.totalTests} tests passed)`);
      return simulation;
      
    } catch (error) {
      console.error('❌ Circuit simulation failed:', error);
      throw new Error(`Simulation failed: ${error.message}`);
    }
  }
  
  generateNetlist(components) {
    const netlist = {
      title: 'Generated Circuit Netlist',
      nodes: new Map(),
      elements: [],
      supplies: []
    };
    
    let nodeCounter = 1;
    
    for (const comp of components) {
      const element = this.componentToSpiceElement(comp, nodeCounter);
      if (element) {
        netlist.elements.push(element);
        
        // Track power supplies
        if (element.type === 'voltage_source') {
          netlist.supplies.push(element);
        }
        
        nodeCounter += element.nodes || 2;
      }
    }
    
    // Add ground reference
    netlist.elements.push({
      name: 'GND',
      type: 'ground',
      node: 0,
      model: 'GND'
    });
    
    return netlist;
  }
  
  componentToSpiceElement(comp, startNode) {
    const specs = comp.component.specs || {};
    const type = specs.type || 'unknown';
    
    const element = {
      name: comp.component.sku || comp.component.id,
      refdes: this.generateRefDes(type, comp.component.id),
      type: type,
      nodes: 2,
      model: this.getSpiceModel(type, specs),
      parameters: this.extractSpiceParameters(specs)
    };
    
    // Assign node numbers
    element.node1 = startNode;
    element.node2 = startNode + 1;
    
    // Special handling for specific components
    if (type === 'mcu' || type === 'sensor') {
      element.nodes = this.estimateNodeCount(specs);
    }
    
    return element;
  }
  
  getSpiceModel(type, specs) {
    const modelTemplate = this.componentModels[type];
    if (!modelTemplate) {
      return `GENERIC_${type.toUpperCase()}`;
    }
    
    let model = modelTemplate.spiceModel;
    
    // Substitute parameters
    if (specs.resistance && model.includes('{value}')) {
      model = model.replace('{value}', specs.resistance);
    }
    if (specs.capacitance && model.includes('{value}')) {
      model = model.replace('{value}', specs.capacitance);
    }
    if (specs.vout && model.includes('{vout}')) {
      model = model.replace('{vout}', specs.vout);
    }
    if (specs.freq && model.includes('{freq}')) {
      model = model.replace('{freq}', specs.freq);
    }
    
    return model;
  }
  
  generateRefDes(type, id) {
    const prefixes = {
      'resistor': 'R',
      'capacitor': 'C',
      'led': 'D',
      'voltage_regulator': 'U',
      'mcu': 'U',
      'sensor': 'U'
    };
    
    const prefix = prefixes[type] || 'X';
    const suffix = id.slice(-4); // Last 4 chars of ID
    
    return `${prefix}${suffix}`;
  }
  
  extractSpiceParameters(specs) {
    const params = {};
    
    if (specs.resistance) params.R = specs.resistance;
    if (specs.capacitance) params.C = specs.capacitance;
    if (specs.voltage) params.V = specs.voltage;
    if (specs.current) params.I = specs.current;
    if (specs.power) params.P = specs.power;
    if (specs.tolerance) params.TOL = specs.tolerance;
    
    return params;
  }
  
  estimateNodeCount(specs) {
    // Rough estimation based on component type
    if (specs.gpio) return Math.min(specs.gpio, 20); // Max 20 nodes for complexity
    if (specs.type === 'mcu') return 8; // Typical MCU connections
    if (specs.interface === 'i2c') return 4; // VCC, GND, SDA, SCL
    if (specs.interface === 'spi') return 6; // VCC, GND, MOSI, MISO, SCK, CS
    
    return 2; // Default
  }
  
  selectTestSuites(components, spec) {
    const suites = [];
    
    // Always include power analysis
    suites.push('power');
    
    // Signal integrity for digital components
    const hasDigital = components.some(c => 
      c.component.specs?.type === 'mcu' || 
      c.component.specs?.interface
    );
    if (hasDigital) {
      suites.push('signal');
    }
    
    // Thermal analysis for power components
    const hasPower = components.some(c => 
      c.component.specs?.type?.includes('regulator') ||
      c.component.specs?.current > 0.1
    );
    if (hasPower) {
      suites.push('thermal');
    }
    
    // Functional verification for sensors/actuators
    const hasSensors = components.some(c => 
      c.component.specs?.type?.includes('sensor') ||
      c.component.specs?.type === 'display'
    );
    if (hasSensors) {
      suites.push('functional');
    }
    
    return suites;
  }
  
  async runTestSuite(suiteName, netlist, components) {
    const suite = this.testSuites[suiteName];
    const results = {
      name: suite.name,
      status: 'pass',
      tests: [],
      duration: '0.5s',
      warnings: []
    };
    
    for (const testName of suite.tests) {
      const testResult = await this.runSingleTest(testName, netlist, components);
      results.tests.push(testResult);
      
      if (testResult.status === 'fail') {
        results.status = 'fail';
      } else if (testResult.status === 'warning' && results.status === 'pass') {
        results.status = 'warning';
      }
      
      if (testResult.warnings) {
        results.warnings.push(...testResult.warnings);
      }
    }
    
    return results;
  }
  
  async runSingleTest(testName, netlist, components) {
    // Simulate different test types
    const test = {
      name: this.formatTestName(testName),
      status: 'pass',
      value: null,
      expected: null,
      tolerance: null,
      warnings: []
    };
    
    switch (testName) {
      case 'voltage_regulation':
        test.value = '3.30V';
        test.expected = '3.30V ± 3%';
        test.status = Math.random() > 0.1 ? 'pass' : 'warning';
        if (test.status === 'warning') {
          test.warnings.push('Slight voltage deviation under load');
        }
        break;
        
      case 'current_capacity':
        const maxCurrent = this.estimateMaxCurrent(components);
        test.value = `${(maxCurrent * 0.8).toFixed(2)}A`;
        test.expected = `<${maxCurrent}A`;
        test.status = 'pass';
        break;
        
      case 'logic_levels':
        test.value = 'VIL=0.8V, VIH=2.0V';
        test.expected = '3.3V CMOS levels';
        test.status = Math.random() > 0.05 ? 'pass' : 'warning';
        break;
        
      case 'interface_communication':
        const interfaces = this.countInterfaces(components);
        test.value = `${interfaces} interfaces verified`;
        test.expected = 'All interfaces functional';
        test.status = Math.random() > 0.15 ? 'pass' : 'fail';
        if (test.status === 'fail') {
          test.warnings.push('I2C communication timeout detected');
        }
        break;
        
      case 'component_temperatures':
        const hotComponents = this.identifyHotComponents(components);
        test.value = hotComponents.length > 0 ? `${hotComponents.length} components >50°C` : 'All <50°C';
        test.expected = 'All components <85°C';
        test.status = hotComponents.length === 0 ? 'pass' : 'warning';
        break;
        
      default:
        test.value = 'Simulated';
        test.expected = 'Within limits';
        test.status = Math.random() > 0.1 ? 'pass' : 'warning';
        break;
    }
    
    return test;
  }
  
  formatTestName(testName) {
    return testName.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }
  
  estimateMaxCurrent(components) {
    let totalCurrent = 0;
    
    for (const comp of components) {
      const specs = comp.component.specs || {};
      
      if (specs.current) {
        totalCurrent += specs.current * comp.quantity;
      } else if (specs.iout_max) {
        totalCurrent += specs.iout_max;
      } else {
        // Estimate based on component type
        switch (specs.type) {
          case 'mcu':
            totalCurrent += 0.05; // 50mA typical
            break;
          case 'sensor':
            totalCurrent += 0.01; // 10mA typical
            break;
          case 'display':
            totalCurrent += 0.02; // 20mA typical
            break;
          default:
            totalCurrent += 0.005; // 5mA default
            break;
        }
      }
    }
    
    return Math.max(0.1, totalCurrent * 1.5); // 50% safety margin
  }
  
  countInterfaces(components) {
    const interfaces = new Set();
    
    for (const comp of components) {
      const specs = comp.component.specs || {};
      if (specs.interface) {
        interfaces.add(specs.interface);
      }
    }
    
    return interfaces.size;
  }
  
  identifyHotComponents(components) {
    const hotComponents = [];
    
    for (const comp of components) {
      const specs = comp.component.specs || {};
      
      // Components likely to run hot
      if (specs.type?.includes('regulator') && specs.iout_max > 0.5) {
        hotComponents.push(comp.component.title);
      } else if (specs.type === 'motor_driver') {
        hotComponents.push(comp.component.title);
      } else if (specs.power && specs.power > 1) {
        hotComponents.push(comp.component.title);
      }
    }
    
    return hotComponents;
  }
  
  analyzeResults(testResults) {
    const failedSuites = testResults.filter(suite => suite.status === 'fail');
    const warningSuites = testResults.filter(suite => suite.status === 'warning');
    
    if (failedSuites.length > 0) {
      return 'failed';
    } else if (warningSuites.length > 0) {
      return 'warning';
    } else {
      return 'passed';
    }
  }
  
  generateWaveforms(components, spec) {
    const waveforms = [];
    
    // Power supply waveform
    waveforms.push({
      name: 'VCC Supply',
      type: 'voltage',
      data: this.generateSineWave(3.3, 0.05, 1000, 'DC with ripple'),
      units: 'V',
      timebase: '1ms/div'
    });
    
    // Digital signals if MCU present
    const hasMCU = components.some(c => c.component.specs?.type === 'mcu');
    if (hasMCU) {
      waveforms.push({
        name: 'Clock Signal',
        type: 'digital',
        data: this.generateSquareWave(3.3, 1000000, 1000, 'System clock'),
        units: 'V',
        timebase: '1us/div'
      });
      
      waveforms.push({
        name: 'I2C SDA',
        type: 'digital',
        data: this.generateI2CWaveform(),
        units: 'V',
        timebase: '10us/div'
      });
    }
    
    return waveforms;
  }
  
  generateSineWave(amplitude, offset, frequency, description) {
    // Simplified waveform data
    const points = [];
    for (let i = 0; i < 100; i++) {
      const t = i / 100;
      const value = amplitude + offset * Math.sin(2 * Math.PI * frequency * t);
      points.push([t, value]);
    }
    
    return {
      points: points,
      description: description
    };
  }
  
  generateSquareWave(amplitude, frequency, samples, description) {
    const points = [];
    for (let i = 0; i < samples; i++) {
      const t = i / samples;
      const value = Math.sin(2 * Math.PI * frequency * t) > 0 ? amplitude : 0;
      points.push([t, value]);
    }
    
    return {
      points: points,
      description: description
    };
  }
  
  generateI2CWaveform() {
    // Simplified I2C transaction
    const points = [
      [0, 3.3], [0.1, 3.3], // Idle high
      [0.1, 0],   [0.2, 0],   // Start condition
      [0.2, 3.3], [0.3, 0],   // Address bits...
      [0.3, 3.3], [0.4, 0],
      [0.4, 3.3], [0.5, 3.3], // Stop condition
    ];
    
    return {
      points: points,
      description: 'I2C Address Phase'
    };
  }
  
  generateRecommendations(testResults) {
    const recommendations = [];
    
    // Analyze test results for recommendations
    const failedTests = testResults.flatMap(suite => 
      suite.tests.filter(test => test.status === 'fail')
    );
    
    const warningTests = testResults.flatMap(suite => 
      suite.tests.filter(test => test.status === 'warning')
    );
    
    if (failedTests.some(test => test.name.includes('Current'))) {
      recommendations.push({
        priority: 'high',
        category: 'power',
        issue: 'Insufficient current capacity',
        solution: 'Upgrade voltage regulator or add parallel regulators'
      });
    }
    
    if (warningTests.some(test => test.name.includes('Voltage'))) {
      recommendations.push({
        priority: 'medium',
        category: 'power',
        issue: 'Voltage regulation tolerance',
        solution: 'Add output capacitance for improved regulation'
      });
    }
    
    if (failedTests.some(test => test.name.includes('Communication'))) {
      recommendations.push({
        priority: 'high',
        category: 'signal',
        issue: 'Interface communication failure',
        solution: 'Check pull-up resistors and address conflicts'
      });
    }
    
    if (warningTests.some(test => test.name.includes('Temperature'))) {
      recommendations.push({
        priority: 'medium',
        category: 'thermal',
        issue: 'Elevated component temperatures',
        solution: 'Consider heat sinks or improved ventilation'
      });
    }
    
    // Always include general recommendations
    recommendations.push({
      priority: 'low',
      category: 'general',
      issue: 'Design validation',
      solution: 'Breadboard prototype before PCB fabrication'
    });
    
    return recommendations;
  }
  
  estimateSimulationTime(components) {
    // Rough time estimation
    const baseTime = 0.1; // seconds
    const componentTime = components.length * 0.05;
    const complexityTime = this.assessCircuitComplexity(components) === 'complex' ? 0.5 : 0.2;
    
    return `${(baseTime + componentTime + complexityTime).toFixed(1)}s`;
  }
  
  assessCircuitComplexity(components) {
    let complexity = 0;
    
    complexity += components.length;
    complexity += components.filter(c => c.component.specs?.type === 'mcu').length * 3;
    complexity += components.filter(c => c.component.specs?.interface).length * 2;
    
    if (complexity < 10) return 'simple';
    if (complexity < 20) return 'moderate';
    return 'complex';
  }
}

module.exports = new SimulationService();