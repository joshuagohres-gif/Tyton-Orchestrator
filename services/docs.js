class DocumentationService {
  constructor() {
    this.templateSections = {
      overview: 'Project Overview',
      hardware: 'Hardware Components',
      wiring: 'Wiring and Connections',
      firmware: 'Firmware and Software',
      assembly: 'Assembly Instructions',
      testing: 'Testing and Verification',
      troubleshooting: 'Troubleshooting Guide',
      resources: 'Additional Resources'
    };
    
    this.documentTypes = {
      assembly: 'Assembly Guide',
      user: 'User Manual',
      technical: 'Technical Reference',
      quick_start: 'Quick Start Guide'
    };
  }

  async generateDocs(context) {
    try {
      console.log('📚 Generating project documentation...');
      
      // Determine document type based on project complexity
      const docType = this.selectDocumentType(context);
      
      // Generate main content sections
      const sections = await this.generateAllSections(context, docType);
      
      // Combine into final document
      const content = this.assembleDocument(sections, context, docType);
      
      // Calculate metrics
      const wordCount = this.countWords(content);
      const readingTime = Math.ceil(wordCount / 200); // 200 words per minute
      
      const documentation = {
        type: docType,
        content: content,
        sections: sections.map(s => ({ name: s.title, wordCount: this.countWords(s.content) })),
        wordCount: wordCount,
        readingTime: `${readingTime} min`,
        metadata: {
          generated: new Date().toISOString(),
          version: '1.0.0',
          format: 'markdown',
          sections: sections.length,
          complexity: this.assessDocComplexity(context)
        }
      };
      
      console.log(`✅ Generated ${docType} documentation (${wordCount} words, ${sections.length} sections)`);
      return documentation;
      
    } catch (error) {
      console.error('❌ Documentation generation failed:', error);
      throw new Error(`Documentation generation failed: ${error.message}`);
    }
  }
  
  selectDocumentType(context) {
    const components = context.components || [];
    const compatibility = context.compatibility || {};
    
    // Simple projects get quick start guides
    if (components.length <= 5 && compatibility.score > 80) {
      return 'quick_start';
    }
    
    // Complex projects need technical reference
    if (components.length > 15 || compatibility.score < 60) {
      return 'technical';
    }
    
    // Projects with displays/interfaces get user manuals
    if (components.some(c => c.component.specs?.type === 'display')) {
      return 'user';
    }
    
    return 'assembly'; // Default
  }
  
  async generateAllSections(context, docType) {
    const sections = [];
    
    // Generate sections based on document type
    switch (docType) {
      case 'quick_start':
        sections.push(await this.generateOverviewSection(context));
        sections.push(await this.generateQuickStartSection(context));
        sections.push(await this.generateTroubleshootingSection(context));
        break;
        
      case 'user':
        sections.push(await this.generateOverviewSection(context));
        sections.push(await this.generateHardwareSection(context));
        sections.push(await this.generateOperationSection(context));
        sections.push(await this.generateTroubleshootingSection(context));
        sections.push(await this.generateResourcesSection(context));
        break;
        
      case 'technical':
        sections.push(await this.generateOverviewSection(context));
        sections.push(await this.generateSpecificationSection(context));
        sections.push(await this.generateHardwareSection(context));
        sections.push(await this.generateWiringSection(context));
        sections.push(await this.generateFirmwareSection(context));
        sections.push(await this.generateTestingSection(context));
        sections.push(await this.generateTroubleshootingSection(context));
        sections.push(await this.generateResourcesSection(context));
        break;
        
      default: // assembly
        sections.push(await this.generateOverviewSection(context));
        sections.push(await this.generateBOMSection(context));
        sections.push(await this.generateHardwareSection(context));
        sections.push(await this.generateAssemblySection(context));
        sections.push(await this.generateTestingSection(context));
        sections.push(await this.generateResourcesSection(context));
        break;
    }
    
    return sections;
  }
  
  async generateOverviewSection(context) {
    let content = `## Project Overview\n\n`;
    
    const spec = context.spec || {};
    const project = context.project || {};
    
    content += `**Purpose:** ${spec.purpose || project.summary || 'Electronic system project'}\n\n`;
    
    if (spec.features && spec.features.length > 0) {
      content += `**Key Features:**\n`;
      for (const feature of spec.features) {
        content += `- ${feature}\n`;
      }
      content += `\n`;
    }
    
    if (spec.constraints) {
      content += `**System Requirements:**\n`;
      content += `- Operating Voltage: ${spec.constraints.voltage}\n`;
      content += `- Power Consumption: ${spec.constraints.power}\n`;
      content += `- Form Factor: ${spec.constraints.size}\n\n`;
    }
    
    const components = context.components || [];
    content += `**Component Count:** ${components.length} components\n\n`;
    
    if (context.compatibility) {
      const compat = context.compatibility;
      content += `**Design Status:** ${compat.overall.charAt(0).toUpperCase() + compat.overall.slice(1)} `;
      content += `(${compat.score}/100 compatibility score)\n\n`;
      
      if (compat.warnings.length > 0) {
        content += `**Important Notes:**\n`;
        for (const warning of compat.warnings.slice(0, 3)) {
          content += `- ${warning}\n`;
        }
        content += `\n`;
      }
    }
    
    return { title: 'Overview', content };
  }
  
  async generateSpecificationSection(context) {
    let content = `## Technical Specifications\n\n`;
    
    const spec = context.spec || {};
    
    content += `### System Architecture\n\n`;
    
    if (context.subsystems && context.subsystems.length > 0) {
      content += `**Subsystems:**\n`;
      for (const subsystem of context.subsystems) {
        content += `- **${subsystem.name}**: ${subsystem.purpose}\n`;
      }
      content += `\n`;
    }
    
    content += `### Electrical Specifications\n\n`;
    content += `| Parameter | Value |\n`;
    content += `|-----------|-------|\n`;
    content += `| Supply Voltage | ${spec.constraints?.voltage || '3.3V'} |\n`;
    content += `| Power Consumption | ${spec.constraints?.power || '<1W'} |\n`;
    
    if (context.components) {
      const mcus = context.components.filter(c => c.component.specs?.type === 'mcu');
      if (mcus.length > 0) {
        const mcu = mcus[0].component.specs;
        content += `| Processor Speed | ${mcu.freq || 'N/A'}MHz |\n`;
        content += `| Available GPIO | ${mcu.gpio || 'N/A'} pins |\n`;
      }
    }
    
    content += `\n### Interface Specifications\n\n`;
    if (spec.interfaces && spec.interfaces.length > 0) {
      for (const iface of spec.interfaces) {
        content += `- **${iface.toUpperCase()}**: Standard ${iface} protocol\n`;
      }
    }
    content += `\n`;
    
    return { title: 'Specifications', content };
  }
  
  async generateBOMSection(context) {
    let content = `## Bill of Materials (BOM)\n\n`;
    
    const components = context.components || [];
    
    if (components.length === 0) {
      content += `No components specified.\n\n`;
      return { title: 'Bill of Materials', content };
    }
    
    content += `| Qty | Designator | Part Number | Description | Notes |\n`;
    content += `|-----|------------|-------------|-------------|-------|\n`;
    
    for (const comp of components) {
      const component = comp.component;
      const qty = comp.quantity || 1;
      const refdes = this.generateRefDes(component.specs?.type, component.id);
      const partNum = component.sku || 'TBD';
      const description = component.title;
      const notes = comp.missing ? '⚠️ Not found in cache' : '✅ Available';
      
      content += `| ${qty} | ${refdes} | ${partNum} | ${description} | ${notes} |\n`;
    }
    content += `\n`;
    
    // Cost estimation
    const totalCost = components.reduce((sum, comp) => {
      return sum + (comp.component.price || 0) * (comp.quantity || 1);
    }, 0);
    
    content += `**Estimated Total Cost:** $${totalCost.toFixed(2)} USD\n\n`;
    
    // Sourcing notes
    content += `### Sourcing Notes\n\n`;
    const sources = [...new Set(components.map(c => c.component.source).filter(Boolean))];
    if (sources.length > 0) {
      content += `**Suppliers:** ${sources.join(', ')}\n\n`;
    }
    
    const missingComponents = components.filter(c => c.missing);
    if (missingComponents.length > 0) {
      content += `**Components to Source:**\n`;
      for (const comp of missingComponents) {
        content += `- ${comp.component.title}: ${comp.purpose}\n`;
      }
      content += `\n`;
    }
    
    return { title: 'Bill of Materials', content };
  }
  
  async generateHardwareSection(context) {
    let content = `## Hardware Components\n\n`;
    
    const components = context.components || [];
    
    // Group components by subsystem
    const componentsBySubsystem = new Map();
    
    for (const comp of components) {
      const subsystem = comp.subsystem || 'Other';
      if (!componentsBySubsystem.has(subsystem)) {
        componentsBySubsystem.set(subsystem, []);
      }
      componentsBySubsystem.get(subsystem).push(comp);
    }
    
    for (const [subsystem, comps] of componentsBySubsystem) {
      content += `### ${subsystem}\n\n`;
      
      for (const comp of comps) {
        content += `**${comp.component.title}**\n\n`;
        content += `- Purpose: ${comp.purpose}\n`;
        
        const specs = comp.component.specs || {};
        if (specs.voltage) content += `- Operating Voltage: ${specs.voltage}V\n`;
        if (specs.current) content += `- Current Draw: ${specs.current}A\n`;
        if (specs.package) content += `- Package: ${specs.package}\n`;
        if (specs.interface) content += `- Interface: ${specs.interface}\n`;
        
        content += `\n`;
      }
    }
    
    return { title: 'Hardware Components', content };
  }
  
  async generateWiringSection(context) {
    let content = `## Wiring Diagram\n\n`;
    
    content += `### Connection Overview\n\n`;
    content += `The following diagram shows the electrical connections between components.\n\n`;
    
    // Reference to wiring diagram
    content += `![Wiring Diagram](wiring.svg)\n\n`;
    
    content += `### Connection Table\n\n`;
    
    // Generate connection table from nets
    if (context.artifacts) {
      const wiringArtifact = context.artifacts.find(a => a.type === 'wiring_svg');
      if (wiringArtifact && wiringArtifact.meta) {
        content += `**Components:** ${wiringArtifact.meta.components}\n`;
        content += `**Nets:** ${wiringArtifact.meta.nets}\n\n`;
      }
    }
    
    // Power connections
    content += `### Power Distribution\n\n`;
    content += `| Net | Voltage | Components |\n`;
    content += `|-----|---------|------------|\n`;
    content += `| VCC | 3.3V | All active components |\n`;
    content += `| GND | 0V | All components |\n\n`;
    
    // Interface connections
    content += `### Interface Connections\n\n`;
    const spec = context.spec || {};
    if (spec.interfaces) {
      for (const iface of spec.interfaces) {
        content += `**${iface.toUpperCase()} Bus:**\n`;
        
        switch (iface) {
          case 'i2c':
            content += `- SDA: Data line (pull-up required)\n`;
            content += `- SCL: Clock line (pull-up required)\n`;
            break;
          case 'spi':
            content += `- MOSI: Master Out, Slave In\n`;
            content += `- MISO: Master In, Slave Out\n`;
            content += `- SCK: Serial Clock\n`;
            content += `- CS: Chip Select (per device)\n`;
            break;
          case 'uart':
            content += `- TX: Transmit Data\n`;
            content += `- RX: Receive Data\n`;
            break;
        }
        content += `\n`;
      }
    }
    
    return { title: 'Wiring and Connections', content };
  }
  
  async generateFirmwareSection(context) {
    let content = `## Firmware and Software\n\n`;
    
    content += `### Development Environment\n\n`;
    
    // Find MCU for platform info
    const components = context.components || [];
    const mcu = components.find(c => c.component.specs?.type === 'mcu');
    
    if (mcu) {
      const title = mcu.component.title.toLowerCase();
      let platform = 'Arduino';
      
      if (title.includes('esp32')) platform = 'ESP32';
      else if (title.includes('rp2040')) platform = 'Raspberry Pi Pico';
      
      content += `**Target Platform:** ${platform}\n`;
      content += `**Development IDE:** Arduino IDE or PlatformIO\n`;
      content += `**Language:** C++ (Arduino Framework)\n\n`;
    }
    
    content += `### Required Libraries\n\n`;
    content += `Install the following libraries through the Arduino Library Manager:\n\n`;
    
    // Extract libraries based on components
    const libraries = new Set();
    for (const comp of components) {
      const specs = comp.component.specs || {};
      const title = comp.component.title.toUpperCase();
      
      if (title.includes('BME280')) libraries.add('Adafruit BME280 Library');
      if (title.includes('SSD1306')) libraries.add('Adafruit SSD1306');
      if (title.includes('MPU6050')) libraries.add('MPU6050 by Electronic Cats');
      if (specs.interface === 'i2c') libraries.add('Wire (built-in)');
    }
    
    for (const lib of libraries) {
      content += `- ${lib}\n`;
    }
    content += `\n`;
    
    content += `### Firmware Features\n\n`;
    const spec = context.spec || {};
    if (spec.features) {
      for (const feature of spec.features) {
        content += `- ${feature}\n`;
      }
    }
    content += `\n`;
    
    content += `### Getting Started\n\n`;
    content += `1. Install Arduino IDE (version 1.8.x or later)\n`;
    content += `2. Install required libraries listed above\n`;
    content += `3. Connect hardware according to wiring diagram\n`;
    content += `4. Upload firmware to microcontroller\n`;
    content += `5. Open Serial Monitor (115200 baud) to view output\n\n`;
    
    return { title: 'Firmware and Software', content };
  }
  
  async generateQuickStartSection(context) {
    let content = `## Quick Start Guide\n\n`;
    
    content += `### What You Need\n\n`;
    
    const components = context.components || [];
    const essentialComponents = components.slice(0, 5); // Top 5 components
    
    for (const comp of essentialComponents) {
      content += `- ${comp.component.title}\n`;
    }
    content += `- Breadboard and jumper wires\n`;
    content += `- USB cable for programming\n\n`;
    
    content += `### 5-Minute Setup\n\n`;
    content += `1. **Power Up**: Connect 3.3V power supply\n`;
    content += `2. **Connect I2C**: Wire SDA/SCL to sensors\n`;
    content += `3. **Upload Code**: Flash the provided firmware\n`;
    content += `4. **Test**: Check serial output for sensor readings\n\n`;
    
    content += `### First Test\n\n`;
    content += `After uploading firmware, you should see:\n\n`;
    content += `\`\`\`\n`;
    content += `Starting ${context.spec?.purpose || 'system'}...\n`;
    content += `Setup complete!\n`;
    content += `--- Sensor Reading ---\n`;
    content += `Temperature: 23.5°C\n`;
    content += `\`\`\`\n\n`;
    
    return { title: 'Quick Start', content };
  }
  
  async generateOperationSection(context) {
    let content = `## Operation Guide\n\n`;
    
    content += `### Normal Operation\n\n`;
    
    const spec = context.spec || {};
    content += `This ${spec.purpose || 'system'} operates automatically once powered on.\n\n`;
    
    if (spec.features) {
      content += `**Features:**\n`;
      for (const feature of spec.features) {
        content += `- **${feature}**: Automatically active\n`;
      }
      content += `\n`;
    }
    
    // Display operations if display present
    const hasDisplay = context.components?.some(c => c.component.specs?.type === 'display');
    if (hasDisplay) {
      content += `### Display Interface\n\n`;
      content += `The OLED display shows real-time information:\n\n`;
      content += `- Line 1: System status\n`;
      content += `- Line 2: Current sensor readings\n`;
      content += `- Line 3: Timestamp or alerts\n\n`;
    }
    
    content += `### Status Indicators\n\n`;
    content += `- **Power LED**: Solid when system is powered\n`;
    content += `- **Status LED**: Blinks during normal operation\n`;
    content += `- **Serial Output**: Continuous data at 115200 baud\n\n`;
    
    return { title: 'Operation', content };
  }
  
  async generateAssemblySection(context) {
    let content = `## Assembly Instructions\n\n`;
    
    content += `### Safety Precautions\n\n`;
    content += `- Handle components with care\n`;
    content += `- Use anti-static precautions\n`;
    content += `- Double-check connections before applying power\n`;
    content += `- Use appropriate tools for soldering (if required)\n\n`;
    
    content += `### Step-by-Step Assembly\n\n`;
    
    const components = context.components || [];
    const steps = this.generateAssemblySteps(components);
    
    for (let i = 0; i < steps.length; i++) {
      content += `#### Step ${i + 1}: ${steps[i].title}\n\n`;
      content += `${steps[i].description}\n\n`;
      
      if (steps[i].tips) {
        content += `**Tips:**\n`;
        for (const tip of steps[i].tips) {
          content += `- ${tip}\n`;
        }
        content += `\n`;
      }
    }
    
    return { title: 'Assembly Instructions', content };
  }
  
  generateAssemblySteps(components) {
    const steps = [];
    
    // Step 1: Prepare workspace
    steps.push({
      title: 'Prepare Workspace',
      description: 'Gather all components and tools. Prepare breadboard or PCB for assembly.',
      tips: ['Use good lighting', 'Have multimeter ready for testing']
    });
    
    // Step 2: Power supply
    const regulators = components.filter(c => 
      c.component.specs?.type?.includes('regulator')
    );
    if (regulators.length > 0) {
      steps.push({
        title: 'Install Power Supply',
        description: `Install the ${regulators[0].component.title} voltage regulator. Connect input power and verify output voltage.`,
        tips: ['Test voltage before connecting other components', 'Add input/output capacitors as specified']
      });
    }
    
    // Step 3: MCU
    const mcus = components.filter(c => c.component.specs?.type === 'mcu');
    if (mcus.length > 0) {
      steps.push({
        title: 'Install Microcontroller',
        description: `Place the ${mcus[0].component.title} on the board. Connect power and programming interfaces.`,
        tips: ['Verify pin orientation', 'Connect decoupling capacitors close to MCU']
      });
    }
    
    // Step 4: Sensors
    const sensors = components.filter(c => 
      c.component.specs?.type?.includes('sensor')
    );
    if (sensors.length > 0) {
      steps.push({
        title: 'Connect Sensors',
        description: `Install ${sensors.length} sensor(s). Connect I2C or SPI interfaces as specified.`,
        tips: ['Add pull-up resistors for I2C (4.7kΩ typical)', 'Keep sensor wires short to minimize noise']
      });
    }
    
    // Step 5: Display
    const displays = components.filter(c => c.component.specs?.type === 'display');
    if (displays.length > 0) {
      steps.push({
        title: 'Connect Display',
        description: `Install the ${displays[0].component.title} display. Connect I2C interface.`,
        tips: ['Verify I2C address (typically 0x3C)', 'Test display before final mounting']
      });
    }
    
    // Final step: Testing
    steps.push({
      title: 'Final Testing',
      description: 'Power on the system and verify all components are working. Upload test firmware.',
      tips: ['Check all connections with multimeter', 'Monitor serial output for errors']
    });
    
    return steps;
  }
  
  async generateTestingSection(context) {
    let content = `## Testing and Verification\n\n`;
    
    content += `### Initial Power-On Test\n\n`;
    content += `1. **Visual Inspection**: Check all connections\n`;
    content += `2. **Power Test**: Measure supply voltages\n`;
    content += `3. **Current Test**: Verify power consumption\n\n`;
    
    content += `| Test Point | Expected Value | Pass/Fail |\n`;
    content += `|------------|----------------|----------|\n`;
    content += `| VCC | 3.3V ± 5% | [ ] |\n`;
    content += `| GND | 0V | [ ] |\n`;
    content += `| Total Current | < 200mA | [ ] |\n\n`;
    
    content += `### Functional Tests\n\n`;
    
    // Component-specific tests
    const components = context.components || [];
    
    const mcus = components.filter(c => c.component.specs?.type === 'mcu');
    if (mcus.length > 0) {
      content += `**Microcontroller Test:**\n`;
      content += `- Upload blink test firmware\n`;
      content += `- Verify LED blinks at 1Hz\n`;
      content += `- Check serial communication at 115200 baud\n\n`;
    }
    
    const sensors = components.filter(c => c.component.specs?.type?.includes('sensor'));
    if (sensors.length > 0) {
      content += `**Sensor Tests:**\n`;
      for (const sensor of sensors.slice(0, 3)) {
        content += `- ${sensor.component.title}: Verify readings are reasonable\n`;
      }
      content += `\n`;
    }
    
    const displays = components.filter(c => c.component.specs?.type === 'display');
    if (displays.length > 0) {
      content += `**Display Test:**\n`;
      content += `- Verify display initializes without errors\n`;
      content += `- Check all pixels can be addressed\n`;
      content += `- Test text rendering\n\n`;
    }
    
    // Integration tests
    content += `### Integration Tests\n\n`;
    content += `1. **End-to-End Test**: Run complete system for 10 minutes\n`;
    content += `2. **Data Accuracy**: Compare sensor readings with reference\n`;
    content += `3. **Interface Test**: Verify all communication buses\n`;
    content += `4. **Stress Test**: Run at maximum load for extended period\n\n`;
    
    return { title: 'Testing and Verification', content };
  }
  
  async generateTroubleshootingSection(context) {
    let content = `## Troubleshooting Guide\n\n`;
    
    content += `### Common Issues\n\n`;
    
    content += `**System won't power on:**\n`;
    content += `- Check power supply connections\n`;
    content += `- Verify input voltage is correct\n`;
    content += `- Check for short circuits\n`;
    content += `- Measure current draw (should be < 500mA initially)\n\n`;
    
    content += `**No serial output:**\n`;
    content += `- Verify USB cable connection\n`;
    content += `- Check serial port settings (115200 baud)\n`;
    content += `- Try different USB port or cable\n`;
    content += `- Ensure correct COM port is selected\n\n`;
    
    const hasSensors = context.components?.some(c => c.component.specs?.type?.includes('sensor'));
    if (hasSensors) {
      content += `**Sensor readings are wrong:**\n`;
      content += `- Check I2C pull-up resistors (4.7kΩ)\n`;
      content += `- Verify sensor I2C address\n`;
      content += `- Check for loose connections\n`;
      content += `- Try different sensor or known-good sensor\n\n`;
    }
    
    const hasDisplay = context.components?.some(c => c.component.specs?.type === 'display');
    if (hasDisplay) {
      content += `**Display not working:**\n`;
      content += `- Check I2C connections (SDA, SCL)\n`;
      content += `- Verify display I2C address (usually 0x3C)\n`;
      content += `- Check power supply to display\n`;
      content += `- Try running display example code\n\n`;
    }
    
    // Use compatibility warnings for additional troubleshooting
    if (context.compatibility && context.compatibility.warnings.length > 0) {
      content += `### Design-Specific Issues\n\n`;
      for (const warning of context.compatibility.warnings.slice(0, 3)) {
        content += `**${warning}**\n`;
        content += `- Review circuit design and component specifications\n`;
        content += `- Consider design modifications if performance is affected\n\n`;
      }
    }
    
    content += `### Advanced Debugging\n\n`;
    content += `- Use oscilloscope to check clock signals\n`;
    content += `- Monitor I2C bus for proper start/stop conditions\n`;
    content += `- Check component temperatures under load\n`;
    content += `- Verify power supply ripple is within specifications\n\n`;
    
    return { title: 'Troubleshooting', content };
  }
  
  async generateResourcesSection(context) {
    let content = `## Additional Resources\n\n`;
    
    content += `### Component Datasheets\n\n`;
    
    const components = context.components || [];
    const uniqueComponents = Array.from(new Map(
      components.map(c => [c.component.title, c])
    ).values()).slice(0, 10); // Limit to 10 for readability
    
    for (const comp of uniqueComponents) {
      const title = comp.component.title;
      const searchTerm = title.split(' ')[0]; // First word for search
      content += `- [${title} Datasheet](https://www.google.com/search?q=${encodeURIComponent(searchTerm + ' datasheet')})\n`;
    }
    content += `\n`;
    
    content += `### Development Resources\n\n`;
    
    // Find MCU for platform-specific resources
    const mcu = components.find(c => c.component.specs?.type === 'mcu');
    if (mcu) {
      const title = mcu.component.title.toLowerCase();
      if (title.includes('esp32')) {
        content += `- [ESP32 Arduino Core](https://github.com/espressif/arduino-esp32)\n`;
        content += `- [ESP32 Documentation](https://docs.espressif.com/projects/esp32-arduino-lib/)\n`;
      } else if (title.includes('rp2040')) {
        content += `- [Raspberry Pi Pico SDK](https://github.com/raspberrypi/pico-sdk)\n`;
        content += `- [Pico Arduino Core](https://github.com/earlephilhower/arduino-pico)\n`;
      } else {
        content += `- [Arduino Reference](https://www.arduino.cc/reference/)\n`;
        content += `- [Arduino Libraries](https://www.arduinolibraries.info/)\n`;
      }
    }
    
    content += `- [PlatformIO Documentation](https://docs.platformio.org/)\n`;
    content += `- [Circuit Simulation Tools](https://www.falstad.com/circuit/)\n\n`;
    
    content += `### Community Support\n\n`;
    content += `- [Arduino Forum](https://forum.arduino.cc/)\n`;
    content += `- [Reddit r/arduino](https://www.reddit.com/r/arduino/)\n`;
    content += `- [Electronics StackExchange](https://electronics.stackexchange.com/)\n\n`;
    
    content += `### Design Files\n\n`;
    content += `This project includes the following generated files:\n\n`;
    
    if (context.artifacts) {
      for (const artifact of context.artifacts) {
        content += `- [${artifact.type.replace('_', ' ')}](${artifact.url})\n`;
      }
    }
    content += `\n`;
    
    content += `---\n\n`;
    content += `*This documentation was automatically generated by Tyton Creation Engine.*\n\n`;
    
    return { title: 'Additional Resources', content };
  }
  
  assembleDocument(sections, context, docType) {
    const project = context.project || {};
    const title = project.title || context.spec?.purpose || 'Project Documentation';
    
    let content = `# ${title}\n\n`;
    
    // Document header
    content += `**Document Type:** ${this.documentTypes[docType] || 'Documentation'}\n`;
    content += `**Generated:** ${new Date().toLocaleDateString()}\n`;
    content += `**Version:** 1.0.0\n\n`;
    
    content += `---\n\n`;
    
    // Table of contents
    content += `## Table of Contents\n\n`;
    for (const section of sections) {
      const anchor = section.title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      content += `- [${section.title}](#${anchor})\n`;
    }
    content += `\n---\n\n`;
    
    // Add all sections
    for (const section of sections) {
      content += section.content;
    }
    
    return content;
  }
  
  generateRefDes(type, id) {
    const prefixes = {
      'mcu': 'U',
      'sensor': 'U',
      'display': 'U',
      'voltage_regulator': 'U',
      'resistor': 'R',
      'capacitor': 'C',
      'led': 'D'
    };
    
    const prefix = prefixes[type] || 'U';
    const suffix = (id || '').slice(-2); // Last 2 chars
    
    return `${prefix}${suffix || '1'}`;
  }
  
  countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
  
  assessDocComplexity(context) {
    let complexity = 0;
    
    const components = context.components || [];
    complexity += components.length;
    
    if (context.compatibility?.warnings?.length > 5) complexity += 5;
    if (context.subsystems?.length > 3) complexity += 3;
    
    if (complexity < 10) return 'simple';
    if (complexity < 20) return 'moderate';
    return 'complex';
  }
}

module.exports = new DocumentationService();