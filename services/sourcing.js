class SourcingService {
  constructor() {
    this.componentMatchings = {
      // Microcontrollers
      microcontroller: {
        types: ['mcu'],
        scoreFactors: {
          wifi: 1.5,
          bluetooth: 1.3,
          gpio: 1.2,
          flash: 1.1
        }
      },
      mcu: {
        types: ['mcu'],
        scoreFactors: {
          freq: 1.2,
          ram: 1.1,
          gpio: 1.3
        }
      },
      
      // Sensors
      environmental_sensor: {
        types: ['environmental'],
        scoreFactors: {
          measures: 2.0,
          interface: 1.5
        }
      },
      temperature_sensor: {
        types: ['environmental'],
        scoreFactors: {
          measures: 1.8
        },
        filterMeasures: ['temperature']
      },
      motion_sensor: {
        types: ['motion'],
        scoreFactors: {
          measures: 2.0,
          interface: 1.5
        }
      },
      gas_sensor: {
        types: ['gas'],
        scoreFactors: {
          measures: 2.0,
          interface: 1.5
        }
      },
      
      // Power Components
      voltage_regulator: {
        types: ['ldo', 'linear'],
        scoreFactors: {
          vout: 2.0,
          iout_max: 1.5
        }
      },
      power_supply: {
        types: ['ldo', 'linear'],
        scoreFactors: {
          vin_max: 1.3,
          iout_max: 1.8
        }
      },
      battery: {
        types: ['battery', 'power'],
        scoreFactors: {
          capacity: 1.5,
          voltage: 1.3
        }
      },
      
      // Basic Components
      resistor: {
        types: ['resistor'],
        scoreFactors: {
          resistance: 2.0,
          power: 1.3,
          tolerance: 1.1
        }
      },
      capacitor: {
        types: ['capacitor'],
        scoreFactors: {
          capacitance: 2.0,
          voltage: 1.3,
          type: 1.2
        }
      },
      led: {
        types: ['led', 'light'],
        scoreFactors: {
          color: 1.5,
          brightness: 1.3
        }
      },
      
      // Transistors & MOSFETs
      transistor: {
        types: ['npn_bjt', 'pnp_bjt'],
        scoreFactors: {
          voltage: 1.5,
          current: 1.3,
          gain: 1.2
        }
      },
      mosfet: {
        types: ['n_mosfet', 'p_mosfet'],
        scoreFactors: {
          voltage: 1.5,
          current: 1.8,
          rds_on: 1.3
        }
      },
      
      // Motor Control
      motor_driver: {
        types: ['motor_driver', 'stepper_driver'],
        scoreFactors: {
          voltage_max: 1.5,
          current_max: 2.0,
          channels: 1.3
        }
      },
      
      // Display
      display: {
        types: ['display'],
        scoreFactors: {
          resolution: 1.5,
          size: 1.3,
          interface: 1.4
        }
      },
      
      // Connectors
      connector: {
        types: ['connector', 'header'],
        scoreFactors: {
          pins: 1.8,
          pitch: 1.2,
          rated_current: 1.3
        }
      },
      header: {
        types: ['header'],
        scoreFactors: {
          pins: 2.0,
          pitch: 1.3,
          rows: 1.2
        }
      }
    };
  }

  async findComponents(subsystems, componentCache) {
    try {
      console.log('🔍 Sourcing components from cache...');
      
      const sourceComponents = [];
      
      for (const subsystem of subsystems) {
        console.log(`🔎 Sourcing for subsystem: ${subsystem.name}`);
        
        for (const requiredComponent of subsystem.requiredComponents) {
          const matches = await this.findBestMatches(
            requiredComponent, 
            componentCache, 
            subsystem,
            3 // Max alternatives per component
          );
          
          if (matches.length > 0) {
            const bestMatch = matches[0];
            sourceComponents.push({
              subsystem: subsystem.name,
              subsystemId: subsystem.id,
              component: bestMatch.component,
              quantity: this.estimateQuantity(requiredComponent, subsystem),
              purpose: `${requiredComponent} for ${subsystem.purpose}`,
              score: bestMatch.score,
              alternates: matches.slice(1).map(m => ({
                componentId: m.component.id,
                score: m.score,
                reason: m.reason
              })),
              constraints: this.getComponentConstraints(requiredComponent, subsystem)
            });
          } else {
            // Create placeholder for missing components
            sourceComponents.push({
              subsystem: subsystem.name,
              subsystemId: subsystem.id,
              component: this.createPlaceholderComponent(requiredComponent),
              quantity: this.estimateQuantity(requiredComponent, subsystem),
              purpose: `${requiredComponent} for ${subsystem.purpose}`,
              score: 0,
              alternates: [],
              constraints: this.getComponentConstraints(requiredComponent, subsystem),
              missing: true
            });
          }
        }
      }
      
      console.log(`✅ Sourced ${sourceComponents.length} components (${sourceComponents.filter(c => !c.missing).length} found, ${sourceComponents.filter(c => c.missing).length} missing)`);
      return sourceComponents;
      
    } catch (error) {
      console.error('❌ Component sourcing failed:', error);
      throw new Error(`Sourcing failed: ${error.message}`);
    }
  }
  
  async findBestMatches(requiredComponent, componentCache, subsystem, maxResults = 3) {
    const matches = [];
    
    // Get matching configuration
    const matchConfig = this.getMatchingConfig(requiredComponent);
    if (!matchConfig) {
      console.log(`⚠️ No matching config for ${requiredComponent}`);
      return matches;
    }
    
    // Search through component cache
    for (const component of componentCache) {
      const score = this.calculateComponentScore(
        component, 
        requiredComponent, 
        matchConfig, 
        subsystem
      );
      
      if (score > 0) {
        matches.push({
          component,
          score,
          reason: this.getMatchReason(component, requiredComponent, matchConfig)
        });
      }
    }
    
    // Sort by score and return top matches
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, maxResults);
  }
  
  getMatchingConfig(requiredComponent) {
    // Try exact match first
    if (this.componentMatchings[requiredComponent]) {
      return this.componentMatchings[requiredComponent];
    }
    
    // Try partial matches
    for (const [configKey, config] of Object.entries(this.componentMatchings)) {
      if (requiredComponent.includes(configKey) || configKey.includes(requiredComponent)) {
        return config;
      }
    }
    
    return null;
  }
  
  calculateComponentScore(component, requiredComponent, matchConfig, subsystem) {
    let score = 0;
    
    // Base type matching
    const componentType = component.specs?.type || '';
    if (matchConfig.types.includes(componentType)) {
      score += 10; // Base score for type match
    } else {
      return 0; // No match if type doesn't match
    }
    
    // Apply score factors based on specs
    for (const [factor, multiplier] of Object.entries(matchConfig.scoreFactors)) {
      if (component.specs && component.specs[factor] !== undefined) {
        score += this.calculateFactorScore(
          component.specs[factor], 
          factor, 
          subsystem, 
          multiplier
        );
      }
    }
    
    // Filter by specific requirements
    if (matchConfig.filterMeasures) {
      const measures = component.specs?.measures || [];
      const hasRequired = matchConfig.filterMeasures.some(req => 
        measures.some(m => m.includes(req))
      );
      if (!hasRequired) {
        score *= 0.5; // Penalty for not having required measurements
      }
    }
    
    // Availability and cost factors
    if (component.stock > 0) {
      score += 2;
    }
    if (component.price < 1.0) {
      score += 1;
    } else if (component.price > 10.0) {
      score -= 1;
    }
    
    // Voltage compatibility check
    score += this.checkVoltageCompatibility(component, subsystem);
    
    return Math.max(0, score);
  }
  
  calculateFactorScore(specValue, factor, subsystem, multiplier) {
    let factorScore = 0;
    
    switch (factor) {
      case 'measures':
        // Array of measurements - more is better
        factorScore = Array.isArray(specValue) ? specValue.length * 2 : 1;
        break;
        
      case 'voltage':
      case 'vout':
        // Voltage matching with subsystem constraints
        const targetVoltage = this.parseVoltage(subsystem.constraints?.voltage || '3.3V');
        const componentVoltage = typeof specValue === 'number' ? specValue : parseFloat(specValue);
        if (Math.abs(componentVoltage - targetVoltage) < 0.5) {
          factorScore = 3;
        } else if (Math.abs(componentVoltage - targetVoltage) < 1.0) {
          factorScore = 1;
        }
        break;
        
      case 'current':
      case 'iout_max':
      case 'current_max':
        // Current capacity - more is generally better
        const currentValue = typeof specValue === 'number' ? specValue : parseFloat(specValue);
        factorScore = Math.min(currentValue / 0.1, 5); // Scale up to 5 points
        break;
        
      case 'resistance':
        // Standard resistor values are preferred
        factorScore = this.isStandardValue(specValue, 'resistor') ? 3 : 1;
        break;
        
      case 'capacitance':
        // Standard capacitor values
        factorScore = this.isStandardValue(specValue, 'capacitor') ? 3 : 1;
        break;
        
      case 'gpio':
      case 'pins':
        // More I/O is generally better
        factorScore = Math.min(specValue / 10, 3);
        break;
        
      case 'freq':
        // Higher frequency for MCUs
        factorScore = specValue > 100 ? 3 : specValue > 50 ? 2 : 1;
        break;
        
      default:
        // Generic scoring
        factorScore = typeof specValue === 'number' ? Math.min(specValue / 10, 2) : 1;
        break;
    }
    
    return factorScore * multiplier;
  }
  
  parseVoltage(voltageSpec) {
    // Extract numeric value from voltage specification
    const match = voltageSpec.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 3.3;
  }
  
  isStandardValue(value, type) {
    const standardResistors = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82, 100, 1000, 10000, 100000];
    const standardCapacitors = [0.0000001, 0.00001, 0.0001]; // 100nF, 10uF, 100uF
    
    if (type === 'resistor') {
      return standardResistors.includes(value);
    } else if (type === 'capacitor') {
      return standardCapacitors.some(std => Math.abs(std - value) < std * 0.1);
    }
    
    return false;
  }
  
  checkVoltageCompatibility(component, subsystem) {
    const subsystemVoltage = this.parseVoltage(subsystem.constraints?.voltage || '3.3V');
    
    // Check component operating voltage
    const specs = component.specs || {};
    let compatible = true;
    
    if (specs.voltage) {
      const componentVoltage = typeof specs.voltage === 'number' ? specs.voltage : parseFloat(specs.voltage);
      compatible = componentVoltage >= subsystemVoltage * 0.8 && componentVoltage <= subsystemVoltage * 2.0;
    }
    
    if (specs.vin_max) {
      compatible = compatible && specs.vin_max >= subsystemVoltage;
    }
    
    return compatible ? 1 : -2;
  }
  
  getMatchReason(component, requiredComponent, matchConfig) {
    const specs = component.specs || {};
    const reasons = [];
    
    reasons.push(`${specs.type} component`);
    
    if (specs.voltage) {
      reasons.push(`${specs.voltage}V rated`);
    }
    
    if (specs.current || specs.iout_max) {
      const current = specs.current || specs.iout_max;
      reasons.push(`${current}A capacity`);
    }
    
    if (component.price < 1.0) {
      reasons.push('low cost');
    }
    
    if (component.stock > 100) {
      reasons.push('good availability');
    }
    
    return reasons.join(', ');
  }
  
  estimateQuantity(componentType, subsystem) {
    const quantities = {
      microcontroller: 1,
      mcu: 1,
      sensor: 1,
      environmental_sensor: 1,
      motion_sensor: 1,
      gas_sensor: 1,
      voltage_regulator: 1,
      power_supply: 1,
      display: 1,
      motor_driver: 1,
      resistor: 3, // Usually need multiple
      capacitor: 2, // Decoupling + main
      led: 2,
      transistor: 2,
      mosfet: 1,
      connector: 2,
      header: 1,
      button: 2,
      switch: 1
    };
    
    // Default to 1, but check for specific types
    for (const [type, qty] of Object.entries(quantities)) {
      if (componentType.includes(type)) {
        return qty;
      }
    }
    
    return 1;
  }
  
  getComponentConstraints(componentType, subsystem) {
    return {
      voltage: subsystem.constraints?.voltage || '3.3V',
      temperature: '-40°C to 85°C',
      package: 'SMD preferred',
      availability: 'in stock',
      lead_time: '<2 weeks'
    };
  }
  
  createPlaceholderComponent(componentType) {
    return {
      id: `missing_${componentType}_${Date.now()}`,
      sku: `MISSING-${componentType.toUpperCase()}`,
      title: `${componentType.replace('_', ' ')} (Not Found)`,
      specs: {
        type: componentType,
        status: 'missing'
      },
      price: 0,
      currency: 'USD',
      source: 'TBD',
      stock: 0,
      lastSeenAt: Date.now()
    };
  }
}

module.exports = new SourcingService();