const fs = require('fs').promises;
const path = require('path');

class SpecService {
  constructor() {
    this.TEMPLATES_FILE = path.join(__dirname, '..', 'data', 'templates.json');
    this.defaultTemplates = {
      'led_blinker': {
        id: 'led_blinker',
        title: 'LED Blinker',
        spec: {
          purpose: 'Basic LED blinking circuit for education',
          features: ['LED indicator', 'adjustable timing', 'battery powered'],
          constraints: {
            voltage: '3-5V',
            power: '<100mW',
            size: 'small'
          },
          components: ['led', 'resistor', 'microcontroller'],
          interfaces: ['digital_out']
        }
      },
      'sensor_monitor': {
        id: 'sensor_monitor',
        title: 'Environmental Sensor Monitor', 
        spec: {
          purpose: 'Monitor temperature, humidity, and air quality',
          features: ['multi-sensor', 'data logging', 'wireless connectivity'],
          constraints: {
            voltage: '3.3-5V',
            power: '<1W',
            size: 'portable'
          },
          components: ['environmental_sensor', 'microcontroller', 'display', 'wireless'],
          interfaces: ['i2c', 'wifi', 'display']
        }
      },
      'motor_controller': {
        id: 'motor_controller',
        title: 'DC Motor Controller',
        spec: {
          purpose: 'Control DC motors with speed and direction',
          features: ['bidirectional', 'speed control', 'current limiting'],
          constraints: {
            voltage: '6-24V',
            power: '<50W',
            size: 'compact'
          },
          components: ['motor_driver', 'microcontroller', 'power_supply'],
          interfaces: ['pwm', 'digital_io']
        }
      }
    };
  }

  async normalizeInput(input) {
    try {
      console.log('📝 Normalizing project input...');
      
      let spec = {};
      
      // Handle template-based projects
      if (input.templateId) {
        console.log(`📋 Using template: ${input.templateId}`);
        
        let templates = this.defaultTemplates;
        try {
          const templatesData = await fs.readFile(this.TEMPLATES_FILE, 'utf8');
          templates = { ...this.defaultTemplates, ...JSON.parse(templatesData) };
        } catch (error) {
          console.log('📄 Using default templates only');
        }
        
        const template = templates[input.templateId];
        if (!template) {
          throw new Error(`Template ${input.templateId} not found`);
        }
        
        spec = { ...template.spec };
        
        // Override with any summary customizations
        if (input.summary) {
          const customizations = this.parseCustomizations(input.summary);
          spec = this.mergeSpecCustomizations(spec, customizations);
        }
        
      } else if (input.summary) {
        // Parse natural language summary into structured spec
        console.log('🔍 Parsing natural language specification...');
        spec = await this.parseNaturalLanguage(input.summary);
      } else {
        throw new Error('Either templateId or summary must be provided');
      }
      
      // Validate and normalize the specification
      spec = this.validateAndNormalize(spec);
      
      console.log(`✅ Normalized spec with ${spec.features?.length || 0} features`);
      return spec;
      
    } catch (error) {
      console.error('❌ Spec normalization failed:', error);
      throw new Error(`Specification parsing failed: ${error.message}`);
    }
  }
  
  parseCustomizations(summary) {
    const customizations = {};
    const text = summary.toLowerCase();
    
    // Extract voltage requirements
    const voltageMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:to\s*)?(\d+(?:\.\d+)?)?\s*v(?:olt)?/i);
    if (voltageMatch) {
      customizations.voltage = voltageMatch[2] ? 
        `${voltageMatch[1]}-${voltageMatch[2]}V` : 
        `${voltageMatch[1]}V`;
    }
    
    // Extract power requirements
    const powerMatch = text.match(/(\d+(?:\.\d+)?)\s*(w|mw|watt)/i);
    if (powerMatch) {
      customizations.power = `<${powerMatch[1]}${powerMatch[2].toUpperCase()}`;
    }
    
    // Extract size constraints
    if (text.includes('small') || text.includes('compact') || text.includes('miniature')) {
      customizations.size = 'small';
    } else if (text.includes('large') || text.includes('big')) {
      customizations.size = 'large';
    } else if (text.includes('portable') || text.includes('handheld')) {
      customizations.size = 'portable';
    }
    
    return customizations;
  }
  
  mergeSpecCustomizations(spec, customizations) {
    if (customizations.voltage) {
      spec.constraints = spec.constraints || {};
      spec.constraints.voltage = customizations.voltage;
    }
    
    if (customizations.power) {
      spec.constraints = spec.constraints || {};
      spec.constraints.power = customizations.power;
    }
    
    if (customizations.size) {
      spec.constraints = spec.constraints || {};
      spec.constraints.size = customizations.size;
    }
    
    return spec;
  }
  
  async parseNaturalLanguage(summary) {
    // Simple NLP-style parsing for demo purposes
    // In production, this would use actual NLP libraries or AI models
    
    const text = summary.toLowerCase();
    const spec = {
      purpose: this.extractPurpose(text),
      features: this.extractFeatures(text),
      constraints: this.extractConstraints(text),
      components: this.extractComponents(text),
      interfaces: this.extractInterfaces(text)
    };
    
    return spec;
  }
  
  extractPurpose(text) {
    // Look for purpose indicators
    if (text.includes('monitor')) return 'Data monitoring and collection system';
    if (text.includes('control')) return 'Control system for automated operation';
    if (text.includes('sensor')) return 'Sensor-based measurement system';
    if (text.includes('led') || text.includes('light')) return 'LED-based lighting or indication system';
    if (text.includes('motor')) return 'Motor control and automation system';
    if (text.includes('robot')) return 'Robotic system with autonomous capabilities';
    
    return 'Electronic system for automated tasks';
  }
  
  extractFeatures(text) {
    const features = [];
    
    if (text.includes('wireless') || text.includes('wifi') || text.includes('bluetooth')) {
      features.push('wireless connectivity');
    }
    if (text.includes('display') || text.includes('screen') || text.includes('oled')) {
      features.push('visual display');
    }
    if (text.includes('sensor')) {
      features.push('sensor monitoring');
    }
    if (text.includes('battery') || text.includes('portable')) {
      features.push('battery powered');
    }
    if (text.includes('logging') || text.includes('record') || text.includes('store')) {
      features.push('data logging');
    }
    if (text.includes('remote') || text.includes('app')) {
      features.push('remote control');
    }
    
    return features.length > 0 ? features : ['basic functionality'];
  }
  
  extractConstraints(text) {
    const constraints = {};
    
    // Voltage
    const voltageMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:to\s*)?(\d+(?:\.\d+)?)?\s*v(?:olt)?/);
    if (voltageMatch) {
      constraints.voltage = voltageMatch[2] ? 
        `${voltageMatch[1]}-${voltageMatch[2]}V` : 
        `${voltageMatch[1]}V`;
    } else {
      constraints.voltage = '3.3-5V'; // default
    }
    
    // Power
    const powerMatch = text.match(/(\d+(?:\.\d+)?)\s*(w|mw|watt)/);
    if (powerMatch) {
      constraints.power = `<${powerMatch[1]}${powerMatch[2].toUpperCase()}`;
    } else {
      constraints.power = '<1W'; // default
    }
    
    // Size
    if (text.includes('small') || text.includes('compact')) {
      constraints.size = 'small';
    } else if (text.includes('large')) {
      constraints.size = 'large';
    } else {
      constraints.size = 'compact';
    }
    
    return constraints;
  }
  
  extractComponents(text) {
    const components = [];
    
    // Microcontrollers
    if (text.includes('esp32') || text.includes('wifi') || text.includes('bluetooth')) {
      components.push('microcontroller');
    } else if (text.includes('arduino') || text.includes('microcontroller') || text.includes('mcu')) {
      components.push('microcontroller');
    }
    
    // Sensors
    if (text.includes('temperature') || text.includes('humidity') || text.includes('pressure')) {
      components.push('environmental_sensor');
    }
    if (text.includes('motion') || text.includes('accelerometer') || text.includes('gyro')) {
      components.push('motion_sensor');
    }
    if (text.includes('co2') || text.includes('gas')) {
      components.push('gas_sensor');
    }
    
    // Actuators  
    if (text.includes('motor') || text.includes('drive')) {
      components.push('motor_driver');
    }
    if (text.includes('led') || text.includes('light')) {
      components.push('led');
    }
    
    // Power
    if (text.includes('regulator') || text.includes('power supply')) {
      components.push('voltage_regulator');
    }
    
    // Display
    if (text.includes('display') || text.includes('screen') || text.includes('oled')) {
      components.push('display');
    }
    
    // Default fallback
    if (components.length === 0) {
      components.push('microcontroller');
    }
    
    return components;
  }
  
  extractInterfaces(text) {
    const interfaces = [];
    
    if (text.includes('i2c') || text.includes('sensor')) {
      interfaces.push('i2c');
    }
    if (text.includes('spi')) {
      interfaces.push('spi');
    }
    if (text.includes('uart') || text.includes('serial')) {
      interfaces.push('uart');
    }
    if (text.includes('wifi') || text.includes('wireless')) {
      interfaces.push('wifi');
    }
    if (text.includes('bluetooth')) {
      interfaces.push('bluetooth');
    }
    if (text.includes('pwm') || text.includes('motor')) {
      interfaces.push('pwm');
    }
    if (text.includes('digital') || text.includes('gpio')) {
      interfaces.push('digital_io');
    }
    
    return interfaces.length > 0 ? interfaces : ['digital_io'];
  }
  
  validateAndNormalize(spec) {
    // Ensure all required fields exist
    const normalized = {
      purpose: spec.purpose || 'Electronic system',
      features: Array.isArray(spec.features) ? spec.features : [spec.features || 'basic functionality'],
      constraints: {
        voltage: spec.constraints?.voltage || '3.3-5V',
        power: spec.constraints?.power || '<1W',
        size: spec.constraints?.size || 'compact'
      },
      components: Array.isArray(spec.components) ? spec.components : [spec.components || 'microcontroller'],
      interfaces: Array.isArray(spec.interfaces) ? spec.interfaces : [spec.interfaces || 'digital_io']
    };
    
    // Validate constraints
    if (!this.isValidVoltageRange(normalized.constraints.voltage)) {
      normalized.constraints.voltage = '3.3-5V';
    }
    
    if (!this.isValidPowerSpec(normalized.constraints.power)) {
      normalized.constraints.power = '<1W';
    }
    
    if (!['small', 'compact', 'portable', 'large'].includes(normalized.constraints.size)) {
      normalized.constraints.size = 'compact';
    }
    
    return normalized;
  }
  
  isValidVoltageRange(voltage) {
    return /^\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?V$/.test(voltage);
  }
  
  isValidPowerSpec(power) {
    return /^<?\d+(?:\.\d+)?(W|MW|mW)$/.test(power);
  }
}

module.exports = new SpecService();