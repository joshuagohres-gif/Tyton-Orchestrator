class DecomposeService {
  constructor() {
    this.subsystemPatterns = {
      power: {
        keywords: ['power', 'voltage', 'regulator', 'battery', 'supply'],
        components: ['voltage_regulator', 'battery', 'power_supply', 'capacitor'],
        priority: 1
      },
      control: {
        keywords: ['control', 'microcontroller', 'mcu', 'processor', 'cpu'],
        components: ['microcontroller', 'mcu'],
        priority: 2
      },
      sensing: {
        keywords: ['sensor', 'temperature', 'humidity', 'pressure', 'motion', 'gas', 'environmental'],
        components: ['environmental_sensor', 'motion_sensor', 'gas_sensor'],
        priority: 3
      },
      communication: {
        keywords: ['wireless', 'wifi', 'bluetooth', 'communication', 'connectivity'],
        components: ['wireless', 'wifi', 'bluetooth'],
        priority: 4
      },
      output: {
        keywords: ['led', 'display', 'screen', 'output', 'indicator', 'actuator'],
        components: ['led', 'display', 'motor_driver'],
        priority: 5
      },
      interface: {
        keywords: ['button', 'switch', 'interface', 'input', 'connector'],
        components: ['button', 'switch', 'connector', 'header'],
        priority: 6
      }
    };
  }

  async decomposeProject(spec) {
    try {
      console.log('🔧 Decomposing project into subsystems...');
      
      const subsystems = [];
      const identified = new Set();
      
      // Analyze spec components and features to identify subsystems
      const allText = [
        spec.purpose || '',
        ...(spec.features || []),
        ...(spec.components || []),
        ...(spec.interfaces || [])
      ].join(' ').toLowerCase();
      
      // Check each subsystem pattern
      for (const [subsystemType, pattern] of Object.entries(this.subsystemPatterns)) {
        const matches = this.checkSubsystemMatch(allText, spec, pattern);
        
        if (matches.score > 0) {
          const subsystem = {
            id: `subsystem_${Date.now()}_${subsystemType}`,
            name: this.getSubsystemName(subsystemType),
            type: subsystemType,
            purpose: this.getSubsystemPurpose(subsystemType, spec),
            requiredComponents: matches.components,
            interfaces: this.getRequiredInterfaces(subsystemType, spec),
            constraints: this.getSubsystemConstraints(subsystemType, spec),
            priority: pattern.priority,
            score: matches.score
          };
          
          subsystems.push(subsystem);
          identified.add(subsystemType);
        }
      }
      
      // Ensure we always have core subsystems
      if (!identified.has('power')) {
        subsystems.push(this.createCoreSubsystem('power', spec));
      }
      
      if (!identified.has('control')) {
        subsystems.push(this.createCoreSubsystem('control', spec));
      }
      
      // Sort by priority
      subsystems.sort((a, b) => a.priority - b.priority);
      
      console.log(`🎯 Identified ${subsystems.length} subsystems: ${subsystems.map(s => s.type).join(', ')}`);
      return subsystems;
      
    } catch (error) {
      console.error('❌ Project decomposition failed:', error);
      throw new Error(`Decomposition failed: ${error.message}`);
    }
  }
  
  checkSubsystemMatch(text, spec, pattern) {
    let score = 0;
    const matchedComponents = [];
    
    // Check for keyword matches
    for (const keyword of pattern.keywords) {
      if (text.includes(keyword)) {
        score += 2;
      }
    }
    
    // Check for component matches
    for (const component of spec.components || []) {
      if (pattern.components.some(pc => component.includes(pc) || pc.includes(component))) {
        score += 3;
        matchedComponents.push(component);
      }
    }
    
    // Check for interface matches
    if (pattern.keywords.some(k => (spec.interfaces || []).some(i => i.includes(k)))) {
      score += 1;
    }
    
    return { score, components: matchedComponents };
  }
  
  getSubsystemName(type) {
    const names = {
      power: 'Power Supply',
      control: 'Control Unit',
      sensing: 'Sensor Array',
      communication: 'Communication Module',
      output: 'Output Interface',
      interface: 'User Interface'
    };
    
    return names[type] || `${type.charAt(0).toUpperCase() + type.slice(1)} Subsystem`;
  }
  
  getSubsystemPurpose(type, spec) {
    const purposes = {
      power: 'Provide stable power distribution and voltage regulation',
      control: 'Execute main program logic and coordinate subsystems',
      sensing: 'Collect environmental data and sensor readings',
      communication: 'Enable wireless connectivity and data transmission',
      output: 'Display information and provide user feedback',
      interface: 'Enable user interaction and external connections'
    };
    
    let basePurpose = purposes[type] || `Handle ${type} functionality`;
    
    // Customize based on spec
    if (type === 'sensing' && spec.purpose?.includes('temperature')) {
      basePurpose = 'Monitor temperature and environmental conditions';
    } else if (type === 'output' && spec.purpose?.includes('control')) {
      basePurpose = 'Control actuators and provide system feedback';
    }
    
    return basePurpose;
  }
  
  getRequiredInterfaces(type, spec) {
    const interfaceMap = {
      power: ['power_rails'],
      control: ['digital_io', 'analog_in'],
      sensing: ['i2c', 'spi', 'analog_in'],
      communication: ['wifi', 'bluetooth', 'uart'],
      output: ['digital_io', 'pwm'],
      interface: ['digital_io', 'uart']
    };
    
    let interfaces = interfaceMap[type] || ['digital_io'];
    
    // Filter based on spec interfaces if available
    if (spec.interfaces && spec.interfaces.length > 0) {
      interfaces = interfaces.filter(i => 
        spec.interfaces.some(si => si.includes(i) || i.includes(si))
      );
    }
    
    return interfaces.length > 0 ? interfaces : ['digital_io'];
  }
  
  getSubsystemConstraints(type, spec) {
    const baseConstraints = {
      power: {
        voltage: spec.constraints?.voltage || '3.3-5V',
        current: this.estimateCurrent(type, spec),
        efficiency: '>80%'
      },
      control: {
        voltage: '3.3V',
        current: '<50mA',
        frequency: this.estimateFrequency(spec)
      },
      sensing: {
        voltage: '3.3V',
        current: '<20mA',
        accuracy: 'medium'
      },
      communication: {
        voltage: '3.3V',
        current: '<100mA',
        range: this.estimateRange(spec)
      },
      output: {
        voltage: spec.constraints?.voltage || '3.3-5V',
        current: this.estimateOutputCurrent(spec),
        response: 'fast'
      },
      interface: {
        voltage: '3.3-5V',
        current: '<10mA',
        debounce: '50ms'
      }
    };
    
    return baseConstraints[type] || { voltage: '3.3V', current: '<50mA' };
  }
  
  estimateCurrent(type, spec) {
    const powerSpec = spec.constraints?.power || '<1W';
    const powerMatch = powerSpec.match(/(\d+(?:\.\d+)?)(W|MW|mW)/);
    
    if (powerMatch) {
      const value = parseFloat(powerMatch[1]);
      const unit = powerMatch[2];
      
      if (unit === 'W') {
        return `<${Math.ceil(value * 200)}mA`; // Assume ~5V system
      } else if (unit === 'mW') {
        return `<${Math.ceil(value / 5)}mA`;
      }
    }
    
    return '<200mA';
  }
  
  estimateFrequency(spec) {
    if (spec.purpose?.includes('fast') || spec.features?.some(f => f.includes('real-time'))) {
      return '>100MHz';
    } else if (spec.purpose?.includes('sensor') || spec.components?.includes('environmental_sensor')) {
      return '>10MHz';
    }
    
    return '>1MHz';
  }
  
  estimateRange(spec) {
    if (spec.features?.some(f => f.includes('remote') || f.includes('long range'))) {
      return '>100m';
    } else if (spec.features?.some(f => f.includes('wireless'))) {
      return '>10m';
    }
    
    return '>1m';
  }
  
  estimateOutputCurrent(spec) {
    if (spec.components?.includes('motor_driver') || spec.purpose?.includes('motor')) {
      return '<2A';
    } else if (spec.components?.includes('led') || spec.purpose?.includes('led')) {
      return '<100mA';
    }
    
    return '<50mA';
  }
  
  createCoreSubsystem(type, spec) {
    return {
      id: `subsystem_${Date.now()}_${type}_core`,
      name: this.getSubsystemName(type),
      type: type,
      purpose: this.getSubsystemPurpose(type, spec),
      requiredComponents: this.subsystemPatterns[type].components.slice(0, 1),
      interfaces: this.getRequiredInterfaces(type, spec),
      constraints: this.getSubsystemConstraints(type, spec),
      priority: this.subsystemPatterns[type].priority,
      score: 1 // Minimum score for core subsystems
    };
  }
}

module.exports = new DecomposeService();