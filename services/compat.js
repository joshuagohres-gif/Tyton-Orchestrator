class CompatibilityService {
  constructor() {
    this.voltageCompatibility = {
      '1.8V': { min: 1.6, max: 2.0, tolerance: 0.1 },
      '3.3V': { min: 3.0, max: 3.6, tolerance: 0.2 },
      '5V': { min: 4.5, max: 5.5, tolerance: 0.25 },
      '12V': { min: 10.8, max: 13.2, tolerance: 0.6 },
      '24V': { min: 21.6, max: 26.4, tolerance: 1.2 }
    };
    
    this.interfaceCompatibility = {
      'i2c': { voltage: ['3.3V', '5V'], speed: ['100kHz', '400kHz'], pullups: true },
      'spi': { voltage: ['3.3V', '5V'], speed: ['1MHz', '10MHz'], cs_required: true },
      'uart': { voltage: ['3.3V', '5V'], baud: ['9600', '115200'], levels: 'ttl' },
      'digital_io': { voltage: ['3.3V', '5V'], current: '<20mA', type: 'cmos' },
      'analog_in': { voltage: ['3.3V', '5V'], resolution: ['10bit', '12bit'], impedance: '>10kΩ' },
      'pwm': { voltage: ['3.3V', '5V'], frequency: ['1kHz', '100kHz'], duty: '0-100%' }
    };
    
    this.packageCompatibility = {
      'SMD': { assembly: 'machine', skill: 'advanced', tools: 'solder_station' },
      'THT': { assembly: 'hand', skill: 'basic', tools: 'soldering_iron' },
      'BGA': { assembly: 'machine', skill: 'expert', tools: 'reflow_oven' },
      'QFN': { assembly: 'machine', skill: 'advanced', tools: 'hot_air' }
    };
  }

  async checkCompatibility(components, spec) {
    try {
      console.log('⚖️ Checking system compatibility...');
      
      const compatibility = {
        overall: 'compatible',
        score: 0,
        warnings: [],
        errors: [],
        checks: {
          voltage: this.checkVoltageCompatibility(components, spec),
          interface: this.checkInterfaceCompatibility(components, spec),
          power: this.checkPowerCompatibility(components, spec),
          physical: this.checkPhysicalCompatibility(components, spec),
          assembly: this.checkAssemblyCompatibility(components, spec)
        }
      };
      
      // Calculate overall score and status
      const checkScores = Object.values(compatibility.checks).map(check => check.score);
      compatibility.score = Math.round(checkScores.reduce((a, b) => a + b, 0) / checkScores.length);
      
      // Collect all warnings and errors
      Object.values(compatibility.checks).forEach(check => {
        compatibility.warnings.push(...check.warnings);
        compatibility.errors.push(...check.errors);
      });
      
      // Determine overall status
      if (compatibility.errors.length > 0) {
        compatibility.overall = 'incompatible';
      } else if (compatibility.warnings.length > 3 || compatibility.score < 70) {
        compatibility.overall = 'marginal';
      } else {
        compatibility.overall = 'compatible';
      }
      
      console.log(`📊 Compatibility: ${compatibility.overall} (${compatibility.score}/100) - ${compatibility.warnings.length} warnings, ${compatibility.errors.length} errors`);
      return compatibility;
      
    } catch (error) {
      console.error('❌ Compatibility check failed:', error);
      throw new Error(`Compatibility analysis failed: ${error.message}`);
    }
  }
  
  checkVoltageCompatibility(components, spec) {
    const check = { score: 100, warnings: [], errors: [] };
    
    // Get system voltage requirement
    const systemVoltage = this.parseVoltageSpec(spec.constraints?.voltage || '3.3V');
    
    // Group components by subsystem
    const subsystemVoltages = new Map();
    const mcuComponents = components.filter(c => c.component.specs?.type === 'mcu');
    
    for (const comp of components) {
      const compSpec = comp.component.specs || {};
      const subsystem = comp.subsystem;
      
      // Check operating voltage
      if (compSpec.voltage || compSpec.vout) {
        const voltage = compSpec.voltage || compSpec.vout;
        const voltageRange = this.parseComponentVoltage(voltage);
        
        if (!subsystemVoltages.has(subsystem)) {
          subsystemVoltages.set(subsystem, []);
        }
        subsystemVoltages.get(subsystem).push({ component: comp, voltage: voltageRange });
        
        // Check compatibility with system voltage
        if (!this.isVoltageCompatible(voltageRange, systemVoltage)) {
          check.errors.push(`${comp.component.title} voltage (${voltage}V) incompatible with system ${systemVoltage.nominal}V`);
          check.score -= 15;
        }
      }
      
      // Check maximum input voltage
      if (compSpec.vin_max && compSpec.vin_max < systemVoltage.max) {
        check.warnings.push(`${comp.component.title} max input ${compSpec.vin_max}V < system max ${systemVoltage.max}V`);
        check.score -= 5;
      }
      
      // Special checks for MCUs
      if (compSpec.type === 'mcu' && mcuComponents.length > 1) {
        check.warnings.push(`Multiple microcontrollers detected - ensure proper power sequencing`);
        check.score -= 10;
      }
    }
    
    // Check voltage consistency within subsystems
    for (const [subsystem, voltages] of subsystemVoltages) {
      if (voltages.length > 1) {
        const nominals = voltages.map(v => v.voltage.nominal);
        const unique = [...new Set(nominals)];
        
        if (unique.length > 1) {
          check.warnings.push(`${subsystem} has mixed voltages: ${unique.join(', ')}V`);
          check.score -= 8;
        }
      }
    }
    
    return check;
  }
  
  checkInterfaceCompatibility(components, spec) {
    const check = { score: 100, warnings: [], errors: [] };
    
    // Map interfaces to components
    const interfaceMap = new Map();
    const mcus = components.filter(c => c.component.specs?.type === 'mcu');
    
    for (const comp of components) {
      const interfaces = comp.component.specs?.interface || 
                       comp.component.specs?.interfaces || [];
      const interfaceArray = Array.isArray(interfaces) ? interfaces : [interfaces];
      
      for (const iface of interfaceArray) {
        if (iface && typeof iface === 'string') {
          if (!interfaceMap.has(iface)) {
            interfaceMap.set(iface, []);
          }
          interfaceMap.get(iface).push(comp);
        }
      }
    }
    
    // Check I2C compatibility
    if (interfaceMap.has('i2c')) {
      const i2cDevices = interfaceMap.get('i2c');
      if (i2cDevices.length > 1) {
        // Check for address conflicts (simplified)
        check.warnings.push(`${i2cDevices.length} I2C devices - verify unique addresses`);
        check.score -= 5;
        
        // Check pull-up requirements
        check.warnings.push(`I2C bus requires pull-up resistors (typically 4.7kΩ to 3.3V)`);
        check.score -= 2;
      }
    }
    
    // Check SPI compatibility
    if (interfaceMap.has('spi')) {
      const spiDevices = interfaceMap.get('spi');
      if (spiDevices.length > 1) {
        check.warnings.push(`${spiDevices.length} SPI devices - each needs dedicated CS pin`);
        check.score -= 3;
      }
    }
    
    // Check MCU pin requirements
    if (mcus.length > 0) {
      const mcu = mcus[0]; // Use first MCU
      const availableGPIO = mcu.component.specs?.gpio || 20;
      
      let requiredPins = 0;
      
      // Estimate pin requirements
      for (const [iface, devices] of interfaceMap) {
        switch (iface) {
          case 'i2c':
            requiredPins += 2; // SDA, SCL
            break;
          case 'spi':
            requiredPins += 3 + devices.length; // MOSI, MISO, SCK + CS per device
            break;
          case 'uart':
            requiredPins += 2; // TX, RX
            break;
          case 'digital_io':
            requiredPins += devices.length;
            break;
          case 'analog_in':
            requiredPins += devices.length;
            break;
          case 'pwm':
            requiredPins += devices.length;
            break;
        }
      }
      
      if (requiredPins > availableGPIO) {
        check.errors.push(`Pin count exceeded: need ${requiredPins} pins, MCU has ${availableGPIO} GPIO`);
        check.score -= 25;
      } else if (requiredPins > availableGPIO * 0.8) {
        check.warnings.push(`High pin utilization: ${requiredPins}/${availableGPIO} GPIO pins used`);
        check.score -= 10;
      }
    }
    
    return check;
  }
  
  checkPowerCompatibility(components, spec) {
    const check = { score: 100, warnings: [], errors: [] };
    
    // Calculate total power consumption
    let totalPower = 0;
    let maxCurrent = 0;
    const powerComponents = [];
    
    for (const comp of components) {
      const specs = comp.component.specs || {};
      
      // Estimate power consumption
      let componentPower = 0;
      
      if (specs.type === 'mcu') {
        // MCU power estimation
        const freq = specs.freq || 100; // MHz
        componentPower = Math.max(20, freq * 0.5); // mW, rough estimate
      } else if (specs.type === 'display') {
        componentPower = 50; // mW, typical small display
      } else if (specs.type?.includes('sensor')) {
        componentPower = 5; // mW, typical sensor
      } else if (specs.type === 'motor_driver') {
        componentPower = 100; // mW, driver IC only
      } else if (specs.current) {
        const voltage = this.parseVoltageSpec(spec.constraints?.voltage || '3.3V');
        componentPower = specs.current * 1000 * voltage.nominal; // mW
      }
      
      totalPower += componentPower * comp.quantity;
      
      // Track power supply components
      if (specs.type === 'ldo' || specs.type === 'linear') {
        powerComponents.push(comp);
        maxCurrent = Math.max(maxCurrent, specs.iout_max || 0);
      }
    }
    
    // Check against spec power budget
    const specPower = this.parsePowerSpec(spec.constraints?.power || '<1W');
    
    if (totalPower > specPower * 1000) { // Convert W to mW
      check.errors.push(`Power consumption ${Math.round(totalPower)}mW exceeds budget ${specPower}W`);
      check.score -= 20;
    } else if (totalPower > specPower * 800) { // 80% of budget
      check.warnings.push(`High power usage: ${Math.round(totalPower)}mW of ${specPower}W budget`);
      check.score -= 10;
    }
    
    // Check power supply capacity
    if (powerComponents.length === 0) {
      check.warnings.push('No voltage regulator specified - verify power supply design');
      check.score -= 15;
    } else {
      const estimatedCurrent = totalPower / (this.parseVoltageSpec(spec.constraints?.voltage || '3.3V').nominal * 1000);
      
      if (maxCurrent < estimatedCurrent) {
        check.errors.push(`Regulator capacity ${maxCurrent}A < estimated load ${estimatedCurrent.toFixed(3)}A`);
        check.score -= 25;
      } else if (maxCurrent < estimatedCurrent * 1.5) {
        check.warnings.push(`Low regulator headroom: ${maxCurrent}A capacity, ${estimatedCurrent.toFixed(3)}A load`);
        check.score -= 8;
      }
    }
    
    return check;
  }
  
  checkPhysicalCompatibility(components, spec) {
    const check = { score: 100, warnings: [], errors: [] };
    
    const packages = new Map();
    let hasLargeComponents = false;
    let hasBGAComponents = false;
    
    for (const comp of components) {
      const pkg = comp.component.specs?.package;
      if (pkg) {
        packages.set(pkg, (packages.get(pkg) || 0) + 1);
        
        // Check for challenging packages
        if (pkg === 'BGA') {
          hasBGAComponents = true;
        } else if (['TO-220', 'TO-247'].includes(pkg)) {
          hasLargeComponents = true;
        }
      }
    }
    
    // Size constraint checking
    const sizeConstraint = spec.constraints?.size || 'compact';
    
    if (sizeConstraint === 'small' && hasLargeComponents) {
      check.warnings.push('Large components (TO-220) may not fit in small form factor');
      check.score -= 10;
    }
    
    if (hasBGAComponents) {
      check.warnings.push('BGA components require specialized PCB design and assembly');
      check.score -= 15;
    }
    
    // Mixed package warnings
    const smdPackages = ['0805', '1206', 'SOT-23', 'QFN', 'BGA'];
    const thtPackages = ['TO-92', 'DO-35', 'DO-41', 'TO-220'];
    
    const hasSMD = [...packages.keys()].some(pkg => smdPackages.includes(pkg));
    const hasTHT = [...packages.keys()].some(pkg => thtPackages.includes(pkg));
    
    if (hasSMD && hasTHT) {
      check.warnings.push('Mixed SMD/THT assembly increases complexity and cost');
      check.score -= 5;
    }
    
    return check;
  }
  
  checkAssemblyCompatibility(components, spec) {
    const check = { score: 100, warnings: [], errors: [] };
    
    let maxSkillLevel = 'basic';
    let requiresSpecialTools = false;
    const assemblyMethods = new Set();
    
    for (const comp of components) {
      const pkg = comp.component.specs?.package;
      if (pkg && this.packageCompatibility[pkg]) {
        const pkgInfo = this.packageCompatibility[pkg];
        
        assemblyMethods.add(pkgInfo.assembly);
        
        if (pkgInfo.skill === 'expert') {
          maxSkillLevel = 'expert';
        } else if (pkgInfo.skill === 'advanced' && maxSkillLevel !== 'expert') {
          maxSkillLevel = 'advanced';
        }
        
        if (['reflow_oven', 'hot_air'].includes(pkgInfo.tools)) {
          requiresSpecialTools = true;
        }
      }
    }
    
    // Assembly warnings based on complexity
    if (maxSkillLevel === 'expert') {
      check.warnings.push('Expert-level assembly skills required');
      check.score -= 10;
    } else if (maxSkillLevel === 'advanced') {
      check.warnings.push('Advanced soldering skills recommended');
      check.score -= 5;
    }
    
    if (requiresSpecialTools) {
      check.warnings.push('Specialized assembly equipment required (reflow oven, hot air station)');
      check.score -= 8;
    }
    
    if (assemblyMethods.size > 1) {
      check.warnings.push('Mixed assembly methods - plan manufacturing workflow carefully');
      check.score -= 3;
    }
    
    return check;
  }
  
  parseVoltageSpec(voltageSpec) {
    // Parse voltage specifications like "3.3V", "3.0-3.6V", "5V"
    const rangeMatch = voltageSpec.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)V/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[2]);
      return { nominal: (min + max) / 2, min, max };
    }
    
    const singleMatch = voltageSpec.match(/(\d+(?:\.\d+)?)V/);
    if (singleMatch) {
      const nominal = parseFloat(singleMatch[1]);
      return { nominal, min: nominal * 0.9, max: nominal * 1.1 };
    }
    
    return { nominal: 3.3, min: 3.0, max: 3.6 };
  }
  
  parseComponentVoltage(voltage) {
    if (typeof voltage === 'number') {
      return { nominal: voltage, min: voltage * 0.9, max: voltage * 1.1 };
    }
    
    return this.parseVoltageSpec(voltage.toString() + 'V');
  }
  
  parsePowerSpec(powerSpec) {
    // Parse power specifications like "<1W", "500mW", "0.5W"
    const match = powerSpec.match(/<?(\d+(?:\.\d+)?)(W|mW)/);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2];
      return unit === 'W' ? value : value / 1000;
    }
    
    return 1; // Default 1W
  }
  
  isVoltageCompatible(componentRange, systemRange) {
    // Check if component voltage range overlaps with system voltage range
    return !(componentRange.max < systemRange.min || componentRange.min > systemRange.max);
  }
}

module.exports = new CompatibilityService();