import type { EdaSpecV1 } from "../specs/edaSpecV10";
import JSZip from "jszip";

export interface GlbExportOptions {
  includeParts?: boolean;
  includeTraces?: boolean;
  boardColor?: string;
  silkscreenColor?: string;
  copperColor?: string;
  solderMaskColor?: string;
  quality?: "low" | "medium" | "high";
  scale?: number;
}

export interface Mesh3D {
  vertices: number[];
  indices: number[];
  normals?: number[];
  uvs?: number[];
  material: string;
}

export interface Scene3D {
  meshes: Mesh3D[];
  materials: Record<string, any>;
  metadata: {
    generator: string;
    version: string;
    scale: number;
  };
}

/**
 * Generate GLB (GL Binary Format) file for 3D board preview
 * Creates a 3D representation of the PCB with components
 */
export function generateGlbBoard(
  eda: EdaSpecV1,
  options: GlbExportOptions = {}
): Buffer {
  const opts = {
    includeParts: true,
    includeTraces: false,
    boardColor: "#2d4a2b",
    silkscreenColor: "#ffffff", 
    copperColor: "#b87333",
    solderMaskColor: "#2d4a2b",
    quality: "medium" as const,
    scale: 1.0,
    ...options
  };

  const scene = generateBoardScene(eda, opts);
  const glb = createGlbFromScene(scene);
  
  return glb;
}

/**
 * Generate 3D scene data for the board
 */
function generateBoardScene(eda: EdaSpecV1, options: GlbExportOptions): Scene3D {
  const meshes: Mesh3D[] = [];
  const materials: Record<string, any> = {};

  // Board substrate
  const boardMesh = generateBoardSubstrate(eda, options);
  meshes.push(boardMesh);
  materials[boardMesh.material] = {
    baseColorFactor: hexToRgba(options.boardColor || "#2d4a2b"),
    metallicFactor: 0.1,
    roughnessFactor: 0.8
  };

  // Solder mask
  if (options.quality !== "low") {
    const solderMaskMesh = generateSolderMask(eda, options);
    meshes.push(solderMaskMesh);
    materials[solderMaskMesh.material] = {
      baseColorFactor: hexToRgba(options.solderMaskColor || "#2d4a2b", 0.9),
      metallicFactor: 0.0,
      roughnessFactor: 0.6
    };
  }

  // Copper traces (if enabled)
  if (options.includeTraces && options.quality === "high") {
    const copperMeshes = generateCopperTraces(eda, options);
    for (const mesh of copperMeshes) {
      meshes.push(mesh);
      materials[mesh.material] = {
        baseColorFactor: hexToRgba(options.copperColor || "#b87333"),
        metallicFactor: 0.9,
        roughnessFactor: 0.1
      };
    }
  }

  // Silkscreen
  if (options.quality !== "low") {
    const silkscreenMesh = generateSilkscreen(eda, options);
    meshes.push(silkscreenMesh);
    materials[silkscreenMesh.material] = {
      baseColorFactor: hexToRgba(options.silkscreenColor || "#ffffff"),
      metallicFactor: 0.0,
      roughnessFactor: 0.9
    };
  }

  // Components
  if (options.includeParts) {
    const componentMeshes = generateComponents(eda, options);
    for (const mesh of componentMeshes) {
      meshes.push(mesh);
      if (!materials[mesh.material]) {
        materials[mesh.material] = getComponentMaterial(mesh.material);
      }
    }
  }

  return {
    meshes,
    materials,
    metadata: {
      generator: "tyton-orchestrator",
      version: "1.0",
      scale: options.scale || 1.0
    }
  };
}

/**
 * Generate board substrate mesh
 */
function generateBoardSubstrate(eda: EdaSpecV1, options: GlbExportOptions): Mesh3D {
  const width = eda.board?.width || 100;
  const height = eda.board?.height || 80;
  const thickness = eda.board?.thickness || 1.6;
  
  const w = width / 2;
  const h = height / 2;
  const t = thickness / 2;

  // Box vertices (8 corners)
  const vertices = [
    // Front face
    -w, -h, -t,  w, -h, -t,  w,  h, -t, -w,  h, -t,
    // Back face  
    -w, -h,  t,  w, -h,  t,  w,  h,  t, -w,  h,  t
  ];

  // Box indices (12 triangles = 36 indices)
  const indices = [
    // Front face
    0, 1, 2,  2, 3, 0,
    // Back face
    4, 7, 6,  6, 5, 4,
    // Left face
    0, 3, 7,  7, 4, 0,
    // Right face
    1, 5, 6,  6, 2, 1,
    // Top face
    3, 2, 6,  6, 7, 3,
    // Bottom face
    0, 4, 5,  5, 1, 0
  ];

  // Generate normals
  const normals = generateBoxNormals();

  return {
    vertices,
    indices,
    normals,
    material: "board_substrate"
  };
}

/**
 * Generate solder mask mesh (slightly larger than substrate)
 */
function generateSolderMask(eda: EdaSpecV1, options: GlbExportOptions): Mesh3D {
  const width = (eda.board?.width || 100) + 0.1;
  const height = (eda.board?.height || 80) + 0.1;
  const thickness = 0.05; // Thin solder mask layer
  
  const w = width / 2;
  const h = height / 2;
  const t = thickness / 2;
  const boardT = (eda.board?.thickness || 1.6) / 2;

  // Top and bottom solder mask surfaces
  const vertices = [
    // Top surface
    -w, -h, boardT + t,  w, -h, boardT + t,  w,  h, boardT + t, -w,  h, boardT + t,
    // Bottom surface
    -w, -h, -boardT - t,  w, -h, -boardT - t,  w,  h, -boardT - t, -w,  h, -boardT - t
  ];

  const indices = [
    // Top face
    0, 1, 2,  2, 3, 0,
    // Bottom face
    4, 7, 6,  6, 5, 4
  ];

  return {
    vertices,
    indices,
    material: "solder_mask"
  };
}

/**
 * Generate copper trace meshes
 */
function generateCopperTraces(eda: EdaSpecV1, options: GlbExportOptions): Mesh3D[] {
  const meshes: Mesh3D[] = [];
  
  // Generate simplified copper pour on top layer
  const width = eda.board?.width || 100;
  const height = eda.board?.height || 80;
  const traceThickness = 0.035; // 1oz copper
  
  // Create a few representative traces
  const traces = [
    { from: [-width/3, -height/3], to: [width/3, -height/3] },
    { from: [-width/3, 0], to: [width/3, 0] },
    { from: [-width/3, height/3], to: [width/3, height/3] }
  ];

  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];
    const mesh = generateTraceMesh(trace.from, trace.to, traceThickness);
    mesh.material = `copper_trace_${i}`;
    meshes.push(mesh);
  }

  return meshes;
}

/**
 * Generate silkscreen mesh with component outlines
 */
function generateSilkscreen(eda: EdaSpecV1, options: GlbExportOptions): Mesh3D {
  const vertices: number[] = [];
  const indices: number[] = [];
  let vertexIndex = 0;

  // Add component reference designators as simple rectangles
  for (const component of eda.components) {
    const placement = eda.placement?.find(p => p.ref === component.ref);
    const x = placement?.x || 0;
    const y = placement?.y || 0;
    const boardT = (eda.board?.thickness || 1.6) / 2;
    const silkHeight = boardT + 0.06;

    // Simple rectangle for reference designator
    const size = 2; // mm
    vertices.push(
      x - size, y - size, silkHeight,
      x + size, y - size, silkHeight,
      x + size, y + size, silkHeight,
      x - size, y + size, silkHeight
    );

    indices.push(
      vertexIndex, vertexIndex + 1, vertexIndex + 2,
      vertexIndex + 2, vertexIndex + 3, vertexIndex
    );
    vertexIndex += 4;
  }

  return {
    vertices,
    indices,
    material: "silkscreen"
  };
}

/**
 * Generate component meshes
 */
function generateComponents(eda: EdaSpecV1, options: GlbExportOptions): Mesh3D[] {
  const meshes: Mesh3D[] = [];

  for (const component of eda.components) {
    const placement = eda.placement?.find(p => p.ref === component.ref);
    const x = placement?.x || 0;
    const y = placement?.y || 0;
    const rotation = placement?.rotation || 0;
    const side = placement?.side || "front";

    const mesh = generateComponentMesh(component, x, y, rotation, side, eda.board?.thickness || 1.6);
    meshes.push(mesh);
  }

  return meshes;
}

/**
 * Generate mesh for a single component
 */
function generateComponentMesh(
  component: any,
  x: number,
  y: number,
  rotation: number,
  side: string,
  boardThickness: number
): Mesh3D {
  const footprint = component.footprint || "";
  const { width, height, thickness } = inferComponentDimensions(footprint);
  
  const boardT = boardThickness / 2;
  const compZ = side === "front" ? boardT + thickness/2 : -boardT - thickness/2;

  // Simple box component
  const w = width / 2;
  const h = height / 2;
  const t = thickness / 2;

  const vertices = [
    // Apply translation
    ...transformVertices([
      // Component box vertices
      -w, -h, -t,  w, -h, -t,  w,  h, -t, -w,  h, -t,
      -w, -h,  t,  w, -h,  t,  w,  h,  t, -w,  h,  t
    ], x, y, compZ, rotation)
  ];

  const indices = [
    0, 1, 2,  2, 3, 0,  // Front
    4, 7, 6,  6, 5, 4,  // Back
    0, 3, 7,  7, 4, 0,  // Left
    1, 5, 6,  6, 2, 1,  // Right
    3, 2, 6,  6, 7, 3,  // Top
    0, 4, 5,  5, 1, 0   // Bottom
  ];

  const materialName = getComponentMaterialName(footprint);

  return {
    vertices,
    indices,
    normals: generateBoxNormals(),
    material: materialName
  };
}

/**
 * Create GLB binary from scene data
 */
function createGlbFromScene(scene: Scene3D): Buffer {
  // Simplified GLB creation - in a real implementation this would
  // properly encode the GLTF JSON + binary buffer according to GLB spec
  
  const gltf = {
    asset: { version: "2.0", generator: scene.metadata.generator },
    scene: 0,
    scenes: [{ nodes: [] as number[] }],
    nodes: [] as any[],
    meshes: [] as any[],
    materials: [] as any[],
    accessors: [] as any[],
    bufferViews: [] as any[],
    buffers: [{ byteLength: 0 }]
  };

  let bufferData = Buffer.alloc(0);
  let nodeIndex = 0;

  // Process each mesh
  for (const mesh of scene.meshes) {
    // Add vertices buffer
    const vertexBuffer = Buffer.from(new Float32Array(mesh.vertices).buffer);
    const vertexView = {
      buffer: 0,
      byteOffset: bufferData.length,
      byteLength: vertexBuffer.length,
      target: 34962 // ARRAY_BUFFER
    };
    gltf.bufferViews.push(vertexView);
    bufferData = Buffer.concat([bufferData, vertexBuffer]);

    // Add vertex accessor
    const positionAccessor = {
      bufferView: gltf.bufferViews.length - 1,
      componentType: 5126, // FLOAT
      count: mesh.vertices.length / 3,
      type: "VEC3",
      min: [Math.min(...mesh.vertices), Math.min(...mesh.vertices), Math.min(...mesh.vertices)],
      max: [Math.max(...mesh.vertices), Math.max(...mesh.vertices), Math.max(...mesh.vertices)]
    };
    gltf.accessors.push(positionAccessor);

    // Add indices buffer
    const indexBuffer = Buffer.from(new Uint16Array(mesh.indices).buffer);
    const indexView = {
      buffer: 0,
      byteOffset: bufferData.length,
      byteLength: indexBuffer.length,
      target: 34963 // ELEMENT_ARRAY_BUFFER
    };
    gltf.bufferViews.push(indexView);
    bufferData = Buffer.concat([bufferData, indexBuffer]);

    // Add index accessor
    const indexAccessor = {
      bufferView: gltf.bufferViews.length - 1,
      componentType: 5123, // UNSIGNED_SHORT
      count: mesh.indices.length,
      type: "SCALAR"
    };
    gltf.accessors.push(indexAccessor);

    // Create mesh
    const gltfMesh = {
      primitives: [{
        attributes: { POSITION: gltf.accessors.length - 2 },
        indices: gltf.accessors.length - 1,
        material: gltf.materials.length
      }]
    };
    gltf.meshes.push(gltfMesh);

    // Add material
    const material = scene.materials[mesh.material] || { baseColorFactor: [0.5, 0.5, 0.5, 1.0] };
    gltf.materials.push({
      name: mesh.material,
      pbrMetallicRoughness: {
        baseColorFactor: material.baseColorFactor || [0.5, 0.5, 0.5, 1.0],
        metallicFactor: material.metallicFactor || 0.0,
        roughnessFactor: material.roughnessFactor || 1.0
      }
    });

    // Add node
    gltf.nodes.push({
      name: `mesh_${nodeIndex}`,
      mesh: gltf.meshes.length - 1
    });
    gltf.scenes[0].nodes.push(nodeIndex);
    nodeIndex++;
  }

  // Update buffer size
  gltf.buffers[0].byteLength = bufferData.length;

  // Create GLB
  const jsonString = JSON.stringify(gltf);
  const jsonBuffer = Buffer.from(jsonString);
  const jsonLength = jsonBuffer.length;
  const binLength = bufferData.length;

  // GLB header (12 bytes) + JSON chunk header (8 bytes) + JSON + BIN chunk header (8 bytes) + BIN
  const totalLength = 12 + 8 + jsonLength + (jsonLength % 4 ? 4 - (jsonLength % 4) : 0) + 8 + binLength + (binLength % 4 ? 4 - (binLength % 4) : 0);
  
  const glb = Buffer.alloc(totalLength);
  let offset = 0;

  // GLB header
  glb.write("glTF", offset); offset += 4;  // magic
  glb.writeUInt32LE(2, offset); offset += 4;  // version
  glb.writeUInt32LE(totalLength, offset); offset += 4;  // length

  // JSON chunk
  const paddedJsonLength = jsonLength + (jsonLength % 4 ? 4 - (jsonLength % 4) : 0);
  glb.writeUInt32LE(paddedJsonLength, offset); offset += 4;  // chunk length
  glb.write("JSON", offset); offset += 4;  // chunk type
  jsonBuffer.copy(glb, offset); offset += jsonLength;
  // Pad to 4-byte boundary
  while (offset % 4 !== 0) {
    glb.writeUInt8(0x20, offset); // space character
    offset++;
  }

  // BIN chunk
  const paddedBinLength = binLength + (binLength % 4 ? 4 - (binLength % 4) : 0);
  glb.writeUInt32LE(paddedBinLength, offset); offset += 4;  // chunk length
  glb.write("BIN\0", offset); offset += 4;  // chunk type
  bufferData.copy(glb, offset); offset += binLength;
  // Pad to 4-byte boundary
  while (offset % 4 !== 0) {
    glb.writeUInt8(0, offset);
    offset++;
  }

  return glb;
}

/**
 * Generate simplified GLB for preview
 */
export function generateSimpleGlb(eda: EdaSpecV1): Buffer {
  const simpleOptions: GlbExportOptions = {
    includeParts: true,
    includeTraces: false,
    quality: "low",
    scale: 1.0
  };

  return generateGlbBoard(eda, simpleOptions);
}

// Helper functions

function hexToRgba(hex: string, alpha = 1.0): number[] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b, alpha];
}

function generateBoxNormals(): number[] {
  return [
    // Front face normals
    0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
    // Back face normals
    0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1
  ];
}

function inferComponentDimensions(footprint: string): { width: number; height: number; thickness: number } {
  const fp = footprint.toLowerCase();
  
  if (fp.includes("0603")) return { width: 1.6, height: 0.8, thickness: 0.4 };
  if (fp.includes("0805")) return { width: 2.0, height: 1.25, thickness: 0.5 };
  if (fp.includes("1206")) return { width: 3.2, height: 1.6, thickness: 0.6 };
  if (fp.includes("soic-8")) return { width: 5.0, height: 4.0, thickness: 1.5 };
  if (fp.includes("dip")) return { width: 15.24, height: 7.62, thickness: 3.0 };
  if (fp.includes("qfn")) return { width: 5.0, height: 5.0, thickness: 0.9 };
  
  // Default component size
  return { width: 5.0, height: 5.0, thickness: 1.0 };
}

function transformVertices(vertices: number[], x: number, y: number, z: number, rotation: number): number[] {
  const result: number[] = [];
  const cos = Math.cos(rotation * Math.PI / 180);
  const sin = Math.sin(rotation * Math.PI / 180);

  for (let i = 0; i < vertices.length; i += 3) {
    const vx = vertices[i];
    const vy = vertices[i + 1];
    const vz = vertices[i + 2];

    // Rotate around Z axis
    const rx = vx * cos - vy * sin;
    const ry = vx * sin + vy * cos;
    
    // Translate
    result.push(rx + x, ry + y, vz + z);
  }

  return result;
}

function generateTraceMesh(from: number[], to: number[], thickness: number): Mesh3D {
  const width = 0.2; // trace width
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  
  const hw = width / 2;
  const hl = length / 2;
  const ht = thickness / 2;

  // Rectangle representing the trace
  const vertices = [
    -hl, -hw, -ht,  hl, -hw, -ht,  hl,  hw, -ht, -hl,  hw, -ht,
    -hl, -hw,  ht,  hl, -hw,  ht,  hl,  hw,  ht, -hl,  hw,  ht
  ];

  // Transform to position and rotation
  const transformed = transformVertices(vertices, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, thickness / 2, angle * 180 / Math.PI);

  const indices = [
    0, 1, 2,  2, 3, 0,  // Front
    4, 7, 6,  6, 5, 4,  // Back
    0, 3, 7,  7, 4, 0,  // Left
    1, 5, 6,  6, 2, 1,  // Right
    3, 2, 6,  6, 7, 3,  // Top
    0, 4, 5,  5, 1, 0   // Bottom
  ];

  return {
    vertices: transformed,
    indices,
    material: "copper_trace"
  };
}

function getComponentMaterialName(footprint: string): string {
  const fp = footprint.toLowerCase();
  
  if (fp.includes("0603") || fp.includes("0805") || fp.includes("1206")) return "resistor_ceramic";
  if (fp.includes("soic") || fp.includes("qfn") || fp.includes("tqfp")) return "ic_plastic";
  if (fp.includes("dip")) return "ic_ceramic";
  if (fp.includes("led")) return "led_plastic";
  
  return "component_generic";
}

function getComponentMaterial(materialName: string): any {
  const materials: Record<string, any> = {
    resistor_ceramic: { baseColorFactor: [0.2, 0.15, 0.1, 1.0], metallicFactor: 0.0, roughnessFactor: 0.8 },
    ic_plastic: { baseColorFactor: [0.1, 0.1, 0.1, 1.0], metallicFactor: 0.0, roughnessFactor: 0.6 },
    ic_ceramic: { baseColorFactor: [0.9, 0.9, 0.8, 1.0], metallicFactor: 0.0, roughnessFactor: 0.4 },
    led_plastic: { baseColorFactor: [0.8, 0.2, 0.2, 1.0], metallicFactor: 0.0, roughnessFactor: 0.7 },
    component_generic: { baseColorFactor: [0.5, 0.5, 0.5, 1.0], metallicFactor: 0.1, roughnessFactor: 0.6 }
  };
  
  return materials[materialName] || materials.component_generic;
}