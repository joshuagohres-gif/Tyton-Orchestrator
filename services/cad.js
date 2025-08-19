class CADService {
  constructor() {
    this.enclosureTemplates = {
      small: { width: 60, height: 40, depth: 20 },
      compact: { width: 80, height: 60, depth: 25 },
      portable: { width: 100, height: 70, depth: 30 },
      large: { width: 120, height: 90, depth: 40 }
    };
    
    this.materialProperties = {
      abs: { density: 1.04, flexural: 2.3, temp_max: 80 },
      pla: { density: 1.24, flexural: 4.1, temp_max: 60 },
      petg: { density: 1.27, flexural: 2.1, temp_max: 70 },
      nylon: { density: 1.14, flexural: 7.6, temp_max: 120 }
    };
    
    this.wallThickness = 2.0; // mm
    this.cornerRadius = 3.0;  // mm
    this.tolerance = 0.2;     // mm
  }

  async generateEnclosure(spec) {
    try {
      console.log('📦 Generating enclosure design...');
      
      // Determine enclosure size
      const sizeConstraint = spec.constraints?.size || 'compact';
      const dimensions = this.calculateDimensions(sizeConstraint, spec);
      
      // Generate STL content (simplified ASCII STL)
      const stlContent = this.generateSTLContent(dimensions);
      
      // Calculate physical properties
      const volume = this.calculateVolume(dimensions);
      const material = this.selectMaterial(spec);
      const weight = this.calculateWeight(volume, material);
      
      const enclosure = {
        dimensions: {
          width: dimensions.width,
          height: dimensions.height, 
          depth: dimensions.depth,
          wallThickness: this.wallThickness
        },
        volume: volume,
        weight: weight,
        material: material,
        stlContent: stlContent,
        features: this.generateFeatures(spec, dimensions),
        printSettings: this.generatePrintSettings(material),
        metadata: {
          triangles: this.countTriangles(stlContent),
          complexity: this.assessComplexity(dimensions, spec),
          printTime: this.estimatePrintTime(volume, material),
          filamentLength: this.estimateFilament(volume, material)
        }
      };
      
      console.log(`✅ Generated ${dimensions.width}x${dimensions.height}x${dimensions.depth}mm enclosure (${volume.toFixed(1)}cm³)`);
      return enclosure;
      
    } catch (error) {
      console.error('❌ CAD generation failed:', error);
      throw new Error(`CAD generation failed: ${error.message}`);
    }
  }
  
  calculateDimensions(sizeConstraint, spec) {
    // Start with template dimensions
    const baseDims = this.enclosureTemplates[sizeConstraint] || this.enclosureTemplates.compact;
    
    // Adjust based on component requirements
    let adjustments = { width: 0, height: 0, depth: 0 };
    
    // Analyze spec for size hints
    const features = spec.features || [];
    const purpose = spec.purpose || '';
    
    if (features.some(f => f.includes('display')) || purpose.includes('display')) {
      adjustments.width += 20; // Space for display
      adjustments.height += 10;
    }
    
    if (features.some(f => f.includes('battery')) || purpose.includes('battery')) {
      adjustments.depth += 15; // Space for battery
    }
    
    if (features.some(f => f.includes('sensor')) || purpose.includes('sensor')) {
      adjustments.height += 5; // Ventilation space
    }
    
    if (features.some(f => f.includes('wireless')) || purpose.includes('wireless')) {
      adjustments.height += 8; // Antenna clearance
    }
    
    return {
      width: baseDims.width + adjustments.width,
      height: baseDims.height + adjustments.height,
      depth: baseDims.depth + adjustments.depth
    };
  }
  
  generateSTLContent(dimensions) {
    // Generate simplified ASCII STL for a basic rectangular enclosure
    const { width, height, depth } = dimensions;
    const wall = this.wallThickness;
    
    // This is a highly simplified STL - in production, use proper CAD libraries
    let stl = 'solid enclosure\n';
    
    // Generate vertices for outer box
    const vertices = [
      // Bottom face (outer)
      [0, 0, 0], [width, 0, 0], [width, height, 0], [0, height, 0],
      // Top face (outer)
      [0, 0, depth], [width, 0, depth], [width, height, depth], [0, height, depth],
      // Inner cavity (simplified)
      [wall, wall, wall], [width-wall, wall, wall], [width-wall, height-wall, wall], [wall, height-wall, wall],
      [wall, wall, depth-wall], [width-wall, wall, depth-wall], [width-wall, height-wall, depth-wall], [wall, height-wall, depth-wall]
    ];
    
    // Generate triangular faces (simplified example)
    const faces = [
      // Bottom outer
      [[0, 0, 0], [width, 0, 0], [width, height, 0]],
      [[0, 0, 0], [width, height, 0], [0, height, 0]],
      // Top outer  
      [[0, 0, depth], [width, height, depth], [width, 0, depth]],
      [[0, 0, depth], [0, height, depth], [width, height, depth]],
      // Front face
      [[0, 0, 0], [width, 0, 0], [width, 0, depth]],
      [[0, 0, 0], [width, 0, depth], [0, 0, depth]],
      // Back face
      [[0, height, 0], [width, height, depth], [width, height, 0]],
      [[0, height, 0], [0, height, depth], [width, height, depth]],
      // Left face
      [[0, 0, 0], [0, 0, depth], [0, height, depth]],
      [[0, 0, 0], [0, height, depth], [0, height, 0]],
      // Right face
      [[width, 0, 0], [width, height, depth], [width, 0, depth]],
      [[width, 0, 0], [width, height, 0], [width, height, depth]]
    ];
    
    // Write triangular facets to STL
    for (const face of faces) {
      const normal = this.calculateNormal(face[0], face[1], face[2]);
      stl += `  facet normal ${normal[0].toFixed(6)} ${normal[1].toFixed(6)} ${normal[2].toFixed(6)}\n`;
      stl += `    outer loop\n`;
      for (const vertex of face) {
        stl += `      vertex ${vertex[0].toFixed(6)} ${vertex[1].toFixed(6)} ${vertex[2].toFixed(6)}\n`;
      }
      stl += `    endloop\n`;
      stl += `  endfacet\n`;
    }
    
    stl += 'endsolid enclosure\n';
    
    return stl;
  }
  
  calculateNormal(v1, v2, v3) {
    // Calculate face normal using cross product
    const u = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
    const v = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
    
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0]
    ];
    
    // Normalize
    const length = Math.sqrt(normal[0]**2 + normal[1]**2 + normal[2]**2);
    return length > 0 ? [normal[0]/length, normal[1]/length, normal[2]/length] : [0, 0, 1];
  }
  
  calculateVolume(dimensions) {
    // Total volume - internal cavity volume
    const totalVolume = (dimensions.width * dimensions.height * dimensions.depth) / 1000; // cm³
    const cavityVolume = ((dimensions.width - 2*this.wallThickness) * 
                         (dimensions.height - 2*this.wallThickness) * 
                         (dimensions.depth - this.wallThickness)) / 1000;
    
    return Math.max(0, totalVolume - cavityVolume);
  }
  
  selectMaterial(spec) {
    const purpose = (spec.purpose || '').toLowerCase();
    const features = (spec.features || []).join(' ').toLowerCase();
    
    // Material selection logic
    if (purpose.includes('outdoor') || features.includes('weather')) {
      return 'petg'; // Weather resistant
    } else if (purpose.includes('prototype') || features.includes('quick')) {
      return 'pla'; // Easy to print
    } else if (purpose.includes('strong') || features.includes('durable')) {
      return 'abs'; // Strong and durable
    } else if (purpose.includes('flexible') || features.includes('flex')) {
      return 'nylon'; // Flexible
    }
    
    return 'pla'; // Default
  }
  
  calculateWeight(volume, material) {
    const materialProps = this.materialProperties[material];
    const density = materialProps ? materialProps.density : 1.24; // g/cm³
    
    return (volume * density).toFixed(1); // grams
  }
  
  generateFeatures(spec, dimensions) {
    const features = [];
    
    // Always include basic features
    features.push({
      name: 'Snap-fit assembly',
      description: 'Two-part enclosure with integrated clips'
    });
    
    features.push({
      name: 'Mounting posts',
      description: 'Internal posts for PCB mounting'
    });
    
    // Conditional features
    const specFeatures = spec.features || [];
    const purpose = spec.purpose || '';
    
    if (specFeatures.some(f => f.includes('display')) || purpose.includes('display')) {
      features.push({
        name: 'Display window',
        description: 'Rectangular cutout for display visibility'
      });
    }
    
    if (specFeatures.some(f => f.includes('sensor')) || purpose.includes('sensor')) {
      features.push({
        name: 'Ventilation slots',
        description: 'Small slots for airflow to sensors'
      });
    }
    
    if (specFeatures.some(f => f.includes('battery')) || purpose.includes('battery')) {
      features.push({
        name: 'Battery compartment',
        description: 'Dedicated space for battery pack'
      });
    }
    
    if (specFeatures.some(f => f.includes('wireless')) || purpose.includes('wireless')) {
      features.push({
        name: 'Antenna relief',
        description: 'Reduced wall thickness for RF transparency'
      });
    }
    
    // Status LED opening
    features.push({
      name: 'Status LED opening',
      description: 'Small hole for status indicator LED'
    });
    
    // Cable management
    features.push({
      name: 'Cable grommet',
      description: 'Reinforced opening for external cables'
    });
    
    return features;
  }
  
  generatePrintSettings(material) {
    const materialProps = this.materialProperties[material];
    
    const settings = {
      material: material.toUpperCase(),
      layerHeight: '0.2mm',
      infill: '20%',
      support: 'Auto-generated where needed',
      adhesion: 'Brim recommended'
    };
    
    switch (material) {
      case 'pla':
        settings.hotendTemp = '200-220°C';
        settings.bedTemp = '60°C';
        settings.speed = '50mm/s';
        break;
        
      case 'abs':
        settings.hotendTemp = '230-250°C';
        settings.bedTemp = '80-100°C';
        settings.speed = '40mm/s';
        settings.enclosure = 'Recommended';
        break;
        
      case 'petg':
        settings.hotendTemp = '220-240°C';
        settings.bedTemp = '70-80°C';
        settings.speed = '45mm/s';
        break;
        
      case 'nylon':
        settings.hotendTemp = '250-270°C';
        settings.bedTemp = '80-100°C';
        settings.speed = '30mm/s';
        settings.enclosure = 'Required';
        break;
    }
    
    return settings;
  }
  
  countTriangles(stlContent) {
    // Count facet entries in STL
    const facetMatches = stlContent.match(/facet normal/g);
    return facetMatches ? facetMatches.length : 0;
  }
  
  assessComplexity(dimensions, spec) {
    let complexity = 0;
    
    // Size complexity
    const volume = dimensions.width * dimensions.height * dimensions.depth;
    complexity += Math.log10(volume / 1000) * 2;
    
    // Feature complexity
    const features = spec.features || [];
    complexity += features.length;
    
    if (features.some(f => f.includes('display'))) complexity += 2;
    if (features.some(f => f.includes('sensor'))) complexity += 1;
    if (features.some(f => f.includes('battery'))) complexity += 1;
    if (features.some(f => f.includes('wireless'))) complexity += 1;
    
    if (complexity < 5) return 'simple';
    if (complexity < 10) return 'moderate';
    return 'complex';
  }
  
  estimatePrintTime(volume, material) {
    // Rough estimation based on volume and material
    const baseTime = volume * 0.5; // hours per cm³
    
    // Material adjustments
    const materialMultipliers = {
      'pla': 1.0,
      'abs': 1.2,
      'petg': 1.1,
      'nylon': 1.4
    };
    
    const multiplier = materialMultipliers[material] || 1.0;
    const estimatedHours = baseTime * multiplier;
    
    const hours = Math.floor(estimatedHours);
    const minutes = Math.round((estimatedHours - hours) * 60);
    
    return `${hours}h ${minutes}m`;
  }
  
  estimateFilament(volume, material) {
    // Estimate filament length needed
    const infillFactor = 0.2; // 20% infill
    const shellFactor = 0.3;  // Shell walls
    
    const materialVolume = volume * (infillFactor + shellFactor);
    
    // Typical filament cross-section: 1.75mm diameter
    const filamentCrossSection = Math.PI * (1.75/2)**2 / 100; // cm²
    const lengthCm = materialVolume / filamentCrossSection;
    const lengthM = lengthCm / 100;
    
    return `${lengthM.toFixed(1)}m`;
  }
}

module.exports = new CADService();