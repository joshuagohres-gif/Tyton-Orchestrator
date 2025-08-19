class WiringService {
  constructor() {
    this.standardColors = {
      vcc: '#FF0000',     // Red
      vdd: '#FF4500',     // Orange-red  
      gnd: '#000000',     // Black
      sda: '#0000FF',     // Blue
      scl: '#800080',     // Purple
      mosi: '#00FF00',    // Green
      miso: '#FFFF00',    // Yellow
      sck: '#FFA500',     // Orange
      cs: '#FF69B4',      // Pink
      tx: '#00CED1',      // Dark turquoise
      rx: '#8A2BE2',      // Blue violet
      pwm: '#DC143C',     // Crimson
      analog: '#32CD32',  // Lime green
      digital: '#4169E1'  // Royal blue
    };
    
    this.componentLayouts = {
      mcu: { width: 60, height: 40, pins: this.getMCUPins() },
      sensor: { width: 30, height: 20, pins: this.getSensorPins() },
      display: { width: 50, height: 30, pins: this.getDisplayPins() },
      regulator: { width: 25, height: 15, pins: this.getRegulatorPins() },
      resistor: { width: 20, height: 8, pins: [{ name: '1', x: 0, y: 4 }, { name: '2', x: 20, y: 4 }] },
      capacitor: { width: 12, height: 20, pins: [{ name: '+', x: 6, y: 0 }, { name: '-', x: 6, y: 20 }] },
      led: { width: 10, height: 10, pins: [{ name: 'A', x: 5, y: 0 }, { name: 'K', x: 5, y: 10 }] }
    };
  }

  async generateWiring(components, spec) {
    try {
      console.log('🔌 Generating wiring diagram...');
      
      // Identify main components
      const devices = this.identifyDevices(components);
      const nets = this.generateNetlist(devices);
      
      // Create SVG layout
      const layout = this.calculateLayout(devices);
      const svg = this.generateSVG(devices, nets, layout);
      
      const wiring = {
        devices: devices,
        nets: nets,
        svg: svg,
        layout: layout,
        metadata: {
          components: devices.length,
          nets: nets.length,
          complexity: this.calculateComplexity(devices, nets),
          estimatedWires: nets.reduce((sum, net) => sum + net.connections.length - 1, 0)
        }
      };
      
      console.log(`🎯 Generated wiring with ${devices.length} devices, ${nets.length} nets`);
      return wiring;
      
    } catch (error) {
      console.error('❌ Wiring generation failed:', error);
      throw new Error(`Wiring generation failed: ${error.message}`);
    }
  }
  
  identifyDevices(components) {
    const devices = [];
    
    for (const comp of components) {
      const specs = comp.component.specs || {};
      const deviceType = this.mapComponentToDevice(specs.type);
      
      if (deviceType) {
        const device = {
          id: comp.component.id,
          name: comp.component.title,
          type: deviceType,
          refdes: this.generateRefDes(deviceType, devices.length + 1),
          pins: this.getDevicePins(deviceType, specs),
          interfaces: this.extractInterfaces(specs),
          power: this.extractPowerRequirements(specs),
          layout: this.componentLayouts[deviceType] || this.componentLayouts.sensor
        };
        
        devices.push(device);
      }
    }
    
    return devices;
  }
  
  mapComponentToDevice(type) {
    const mapping = {
      'mcu': 'mcu',
      'environmental': 'sensor',
      'motion': 'sensor', 
      'gas': 'sensor',
      'display': 'display',
      'ldo': 'regulator',
      'linear': 'regulator',
      'resistor': 'resistor',
      'capacitor': 'capacitor',
      'led': 'led'
    };
    
    return mapping[type] || null;
  }
  
  generateRefDes(type, index) {
    const prefixes = {
      'mcu': 'U',
      'sensor': 'U', 
      'display': 'U',
      'regulator': 'U',
      'resistor': 'R',
      'capacitor': 'C',
      'led': 'D'
    };
    
    return `${prefixes[type] || 'U'}${index}`;
  }
  
  getDevicePins(type, specs) {
    switch (type) {
      case 'mcu':
        return this.getMCUPins(specs);
      case 'sensor':
        return this.getSensorPins(specs);
      case 'display':
        return this.getDisplayPins(specs);
      case 'regulator':
        return this.getRegulatorPins(specs);
      default:
        return this.componentLayouts[type]?.pins || [];
    }
  }
  
  getMCUPins(specs = {}) {
    const pins = [
      { name: 'VCC', x: 10, y: 0, type: 'power', net: 'VCC' },
      { name: 'GND', x: 50, y: 0, type: 'power', net: 'GND' },
      { name: 'RST', x: 0, y: 10, type: 'input', net: 'RST' }
    ];
    
    // Add interface pins based on specs
    if (specs.wifi || specs.bluetooth) {
      pins.push(
        { name: 'GPIO0', x: 0, y: 20, type: 'io', net: null },
        { name: 'GPIO2', x: 0, y: 30, type: 'io', net: null }
      );
    }
    
    // Add I2C pins
    pins.push(
      { name: 'SDA', x: 60, y: 10, type: 'io', net: 'I2C_SDA' },
      { name: 'SCL', x: 60, y: 20, type: 'io', net: 'I2C_SCL' }
    );
    
    // Add SPI pins
    pins.push(
      { name: 'MOSI', x: 60, y: 30, type: 'io', net: 'SPI_MOSI' },
      { name: 'MISO', x: 60, y: 35, type: 'io', net: 'SPI_MISO' },
      { name: 'SCK', x: 60, y: 40, type: 'io', net: 'SPI_SCK' }
    );
    
    return pins;
  }
  
  getSensorPins(specs = {}) {
    const pins = [
      { name: 'VCC', x: 5, y: 0, type: 'power', net: 'VCC' },
      { name: 'GND', x: 25, y: 0, type: 'power', net: 'GND' }
    ];
    
    // Add interface pins based on sensor interface
    if (specs.interface === 'i2c' || !specs.interface) {
      pins.push(
        { name: 'SDA', x: 0, y: 10, type: 'io', net: 'I2C_SDA' },
        { name: 'SCL', x: 30, y: 10, type: 'io', net: 'I2C_SCL' }
      );
    } else if (specs.interface === 'spi') {
      pins.push(
        { name: 'MOSI', x: 0, y: 10, type: 'io', net: 'SPI_MOSI' },
        { name: 'MISO', x: 30, y: 10, type: 'io', net: 'SPI_MISO' },
        { name: 'SCK', x: 0, y: 15, type: 'io', net: 'SPI_SCK' },
        { name: 'CS', x: 30, y: 15, type: 'io', net: `SPI_CS_${specs.address || '1'}` }
      );
    }
    
    return pins;
  }
  
  getDisplayPins(specs = {}) {
    const pins = [
      { name: 'VCC', x: 10, y: 0, type: 'power', net: 'VCC' },
      { name: 'GND', x: 40, y: 0, type: 'power', net: 'GND' }
    ];
    
    // Most small displays use I2C
    pins.push(
      { name: 'SDA', x: 0, y: 15, type: 'io', net: 'I2C_SDA' },
      { name: 'SCL', x: 50, y: 15, type: 'io', net: 'I2C_SCL' }
    );
    
    return pins;
  }
  
  getRegulatorPins(specs = {}) {
    return [
      { name: 'VIN', x: 0, y: 7, type: 'power', net: 'VIN' },
      { name: 'VOUT', x: 25, y: 7, type: 'power', net: 'VCC' },
      { name: 'GND', x: 12, y: 15, type: 'power', net: 'GND' }
    ];
  }
  
  extractInterfaces(specs) {
    const interfaces = [];
    
    if (specs.interface === 'i2c') {
      interfaces.push({ type: 'i2c', pins: ['SDA', 'SCL'] });
    } else if (specs.interface === 'spi') {
      interfaces.push({ type: 'spi', pins: ['MOSI', 'MISO', 'SCK', 'CS'] });
    } else if (specs.interface === 'uart') {
      interfaces.push({ type: 'uart', pins: ['TX', 'RX'] });
    }
    
    return interfaces;
  }
  
  extractPowerRequirements(specs) {
    return {
      voltage: specs.voltage || specs.vout || 3.3,
      current: specs.current || specs.iout_max || 0.05 // 50mA default
    };
  }
  
  generateNetlist(devices) {
    const nets = [];
    const netMap = new Map();
    
    // Collect all pins and group by net
    for (const device of devices) {
      for (const pin of device.pins) {
        if (pin.net) {
          if (!netMap.has(pin.net)) {
            netMap.set(pin.net, {
              name: pin.net,
              connections: [],
              type: pin.type
            });
          }
          
          netMap.get(pin.net).connections.push({
            device: device.refdes,
            deviceId: device.id,
            pin: pin.name,
            x: pin.x,
            y: pin.y
          });
        }
      }
    }
    
    // Convert to nets array
    for (const [netName, netData] of netMap) {
      if (netData.connections.length > 1) { // Only nets with multiple connections
        nets.push({
          id: `net_${netName}`,
          name: netName,
          connections: netData.connections,
          type: netData.type,
          color: this.getNetColor(netName)
        });
      }
    }
    
    return nets;
  }
  
  getNetColor(netName) {
    const name = netName.toLowerCase();
    
    if (name.includes('vcc') || name.includes('vdd')) return this.standardColors.vcc;
    if (name.includes('gnd')) return this.standardColors.gnd;
    if (name.includes('sda')) return this.standardColors.sda;
    if (name.includes('scl')) return this.standardColors.scl;
    if (name.includes('mosi')) return this.standardColors.mosi;
    if (name.includes('miso')) return this.standardColors.miso;
    if (name.includes('sck')) return this.standardColors.sck;
    if (name.includes('cs')) return this.standardColors.cs;
    if (name.includes('tx')) return this.standardColors.tx;
    if (name.includes('rx')) return this.standardColors.rx;
    if (name.includes('pwm')) return this.standardColors.pwm;
    
    return this.standardColors.digital;
  }
  
  calculateLayout(devices) {
    const layout = { width: 800, height: 600, devices: [] };
    
    // Simple grid layout
    const cols = Math.ceil(Math.sqrt(devices.length));
    const cellWidth = layout.width / cols;
    const cellHeight = layout.height / Math.ceil(devices.length / cols);
    
    devices.forEach((device, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      layout.devices.push({
        id: device.id,
        refdes: device.refdes,
        x: col * cellWidth + cellWidth / 2 - device.layout.width / 2,
        y: row * cellHeight + cellHeight / 2 - device.layout.height / 2,
        width: device.layout.width,
        height: device.layout.height
      });
    });
    
    return layout;
  }
  
  generateSVG(devices, nets, layout) {
    let svg = `<svg width="${layout.width}" height="${layout.height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<defs>`;
    svg += `<style>`;
    svg += `.device { fill: #f0f0f0; stroke: #333; stroke-width: 1; }`;
    svg += `.device-label { font-family: Arial; font-size: 10px; fill: #333; text-anchor: middle; }`;
    svg += `.pin { fill: #888; stroke: #333; stroke-width: 0.5; }`;
    svg += `.pin-label { font-family: Arial; font-size: 8px; fill: #333; text-anchor: middle; }`;
    svg += `.net { stroke-width: 2; fill: none; }`;
    svg += `.net-label { font-family: Arial; font-size: 8px; fill: #333; }`;
    svg += `</style>`;
    svg += `</defs>`;
    
    // Draw background
    svg += `<rect width="${layout.width}" height="${layout.height}" fill="#ffffff"/>`;
    
    // Draw devices
    for (let i = 0; i < devices.length; i++) {
      const device = devices[i];
      const layoutDevice = layout.devices[i];
      
      // Device body
      svg += `<rect x="${layoutDevice.x}" y="${layoutDevice.y}" width="${layoutDevice.width}" height="${layoutDevice.height}" class="device"/>`;
      
      // Device label
      svg += `<text x="${layoutDevice.x + layoutDevice.width / 2}" y="${layoutDevice.y + layoutDevice.height / 2}" class="device-label">${device.refdes}</text>`;
      svg += `<text x="${layoutDevice.x + layoutDevice.width / 2}" y="${layoutDevice.y + layoutDevice.height / 2 + 12}" class="device-label" font-size="8">${device.name}</text>`;
      
      // Device pins
      for (const pin of device.pins) {
        const pinX = layoutDevice.x + pin.x;
        const pinY = layoutDevice.y + pin.y;
        
        svg += `<circle cx="${pinX}" cy="${pinY}" r="3" class="pin"/>`;
        svg += `<text x="${pinX}" y="${pinY - 6}" class="pin-label">${pin.name}</text>`;
      }
    }
    
    // Draw nets
    for (const net of nets) {
      if (net.connections.length < 2) continue;
      
      const color = net.color;
      
      // Draw connections as straight lines (simplified)
      for (let i = 1; i < net.connections.length; i++) {
        const conn1 = net.connections[0];
        const conn2 = net.connections[i];
        
        const device1Layout = layout.devices.find(d => d.refdes === conn1.device);
        const device2Layout = layout.devices.find(d => d.refdes === conn2.device);
        
        if (device1Layout && device2Layout) {
          const x1 = device1Layout.x + conn1.x;
          const y1 = device1Layout.y + conn1.y;
          const x2 = device2Layout.x + conn2.x;
          const y2 = device2Layout.y + conn2.y;
          
          svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" class="net"/>`;
        }
      }
      
      // Net label
      if (net.connections.length > 0) {
        const firstConn = net.connections[0];
        const device1Layout = layout.devices.find(d => d.refdes === firstConn.device);
        if (device1Layout) {
          const labelX = device1Layout.x + firstConn.x + 10;
          const labelY = device1Layout.y + firstConn.y - 5;
          svg += `<text x="${labelX}" y="${labelY}" class="net-label" fill="${color}">${net.name}</text>`;
        }
      }
    }
    
    svg += `</svg>`;
    return svg;
  }
  
  calculateComplexity(devices, nets) {
    // Simple complexity score
    let complexity = 0;
    
    complexity += devices.length * 2;
    complexity += nets.length * 3;
    
    // Interface complexity
    for (const device of devices) {
      complexity += device.interfaces.length * 2;
    }
    
    if (complexity < 20) return 'simple';
    if (complexity < 50) return 'moderate';
    if (complexity < 100) return 'complex';
    return 'very complex';
  }
}

module.exports = new WiringService();