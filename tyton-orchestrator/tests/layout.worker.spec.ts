import { vi } from 'vitest';

// Mock elkjs for testing
const mockElk = {
  layout: vi.fn()
};

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: vi.fn(() => mockElk)
}));

// Extract the layout computation function for testing
// (In a real implementation, this would be extracted to a separate module)
async function computeLayoutInWorker(specV12: any): Promise<{nodes:any[]; edges:any[]; warnings?:string[]}> {
  try {
    // Lazy import elkjs in the worker
    const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
    const elk = new ELK();
    
    // Convert specV12 → ELK graph
    const graph = {
      id: "root",
      layoutOptions: { 
        "elk.direction": "RIGHT",
        "elk.padding": "[top=25,left=25,bottom=25,right=25]",
        "elk.spacing.nodeNode": "25",
        "elk.layered.spacing.nodeNodeBetweenLayers": "50"
      },
      children: specV12?.modules?.map((module: any, index: number) => ({
        id: module.id || `module-${index}`,
        width: 200,
        height: 150,
        labels: [{ text: module.title || module.type || `Module ${index + 1}` }]
      })) || [],
      edges: specV12?.connections?.map((conn: any, index: number) => ({
        id: `edge-${index}`,
        sources: [conn.from],
        targets: [conn.to]
      })) || []
    };
    
    const layout = await elk.layout(graph, { 
      layoutOptions: { "elk.direction":"RIGHT" }
    });
    
    // Map layout → nodes/edges for React Flow
    const nodes = layout.children?.map((child) => ({
      id: child.id,
      type: 'custom',
      position: { x: child.x || 0, y: child.y || 0 },
      data: { 
        label: child.labels?.[0]?.text || child.id,
        width: child.width,
        height: child.height
      }
    })) || [];
    
    const edges = layout.edges?.map((edge) => ({
      id: edge.id,
      source: Array.isArray(edge.sources) ? edge.sources[0] : edge.sources,
      target: Array.isArray(edge.targets) ? edge.targets[0] : edge.targets,
      type: 'smoothstep'
    })) || [];
    
    return { nodes, edges };
  } catch (e:any) {
    return { nodes: [], edges: [], warnings: [String(e?.message||e)] };
  }
}

describe('Layout Worker Computation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computeLayoutInWorker', () => {
    it('should handle empty spec gracefully', async () => {
      mockElk.layout.mockResolvedValue({
        children: [],
        edges: []
      });

      const result = await computeLayoutInWorker({});
      
      expect(result).toEqual({
        nodes: [],
        edges: []
      });
    });

    it('should handle null spec gracefully', async () => {
      mockElk.layout.mockResolvedValue({
        children: [],
        edges: []
      });

      const result = await computeLayoutInWorker(null);
      
      expect(result).toEqual({
        nodes: [],
        edges: []
      });
    });

    it('should convert modules to ELK graph correctly', async () => {
      const specV12 = {
        modules: [
          { id: 'mod1', title: 'Module 1', type: 'electronics' },
          { id: 'mod2', title: 'Module 2', type: 'mechanical' }
        ],
        connections: [
          { from: 'mod1', to: 'mod2' }
        ]
      };

      mockElk.layout.mockResolvedValue({
        children: [
          { id: 'mod1', x: 0, y: 0, width: 200, height: 150, labels: [{ text: 'Module 1' }] },
          { id: 'mod2', x: 250, y: 0, width: 200, height: 150, labels: [{ text: 'Module 2' }] }
        ],
        edges: [
          { id: 'edge-0', sources: 'mod1', targets: 'mod2' }
        ]
      });

      const result = await computeLayoutInWorker(specV12);

      // Verify ELK was called with correct graph structure
      expect(mockElk.layout).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "root",
          children: expect.arrayContaining([
            expect.objectContaining({
              id: 'mod1',
              width: 200,
              height: 150,
              labels: [{ text: 'Module 1' }]
            }),
            expect.objectContaining({
              id: 'mod2',
              width: 200,
              height: 150,
              labels: [{ text: 'Module 2' }]
            })
          ]),
          edges: expect.arrayContaining([
            expect.objectContaining({
              id: 'edge-0',
              sources: ['mod1'],
              targets: ['mod2']
            })
          ])
        }),
        expect.any(Object)
      );

      // Verify result structure
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      
      expect(result.nodes[0]).toMatchObject({
        id: 'mod1',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: expect.objectContaining({
          label: 'Module 1',
          width: 200,
          height: 150
        })
      });

      expect(result.edges[0]).toMatchObject({
        id: 'edge-0',
        source: 'mod1',
        target: 'mod2',
        type: 'smoothstep'
      });
    });

    it('should handle modules without IDs by generating them', async () => {
      const specV12 = {
        modules: [
          { title: 'Module A' },
          { title: 'Module B' }
        ]
      };

      mockElk.layout.mockResolvedValue({
        children: [
          { id: 'module-0', x: 0, y: 0, width: 200, height: 150, labels: [{ text: 'Module A' }] },
          { id: 'module-1', x: 250, y: 0, width: 200, height: 150, labels: [{ text: 'Module B' }] }
        ],
        edges: []
      });

      const result = await computeLayoutInWorker(specV12);

      expect(mockElk.layout).toHaveBeenCalledWith(
        expect.objectContaining({
          children: expect.arrayContaining([
            expect.objectContaining({ id: 'module-0' }),
            expect.objectContaining({ id: 'module-1' })
          ])
        }),
        expect.any(Object)
      );

      expect(result.nodes).toHaveLength(2);
    });

    it('should handle modules without titles by generating them', async () => {
      const specV12 = {
        modules: [
          { id: 'mod1', type: 'electronics' },
          { id: 'mod2' } // No title or type
        ]
      };

      mockElk.layout.mockResolvedValue({
        children: [
          { id: 'mod1', x: 0, y: 0, width: 200, height: 150, labels: [{ text: 'electronics' }] },
          { id: 'mod2', x: 250, y: 0, width: 200, height: 150, labels: [{ text: 'Module 2' }] }
        ],
        edges: []
      });

      const result = await computeLayoutInWorker(specV12);

      expect(mockElk.layout).toHaveBeenCalledWith(
        expect.objectContaining({
          children: expect.arrayContaining([
            expect.objectContaining({
              id: 'mod1',
              labels: [{ text: 'electronics' }]
            }),
            expect.objectContaining({
              id: 'mod2',
              labels: [{ text: 'Module 2' }]
            })
          ])
        }),
        expect.any(Object)
      );
    });

    it('should handle ELK errors gracefully', async () => {
      mockElk.layout.mockRejectedValue(new Error('ELK layout failed'));

      const specV12 = {
        modules: [{ id: 'mod1', title: 'Module 1' }]
      };

      const result = await computeLayoutInWorker(specV12);

      expect(result).toEqual({
        nodes: [],
        edges: [],
        warnings: ['ELK layout failed']
      });
    });

    it('should handle edge sources/targets as arrays or strings', async () => {
      const specV12 = {
        modules: [
          { id: 'mod1', title: 'Module 1' },
          { id: 'mod2', title: 'Module 2' }
        ],
        connections: [
          { from: 'mod1', to: 'mod2' }
        ]
      };

      // Test with sources/targets as arrays
      mockElk.layout.mockResolvedValue({
        children: [
          { id: 'mod1', x: 0, y: 0, width: 200, height: 150, labels: [{ text: 'Module 1' }] },
          { id: 'mod2', x: 250, y: 0, width: 200, height: 150, labels: [{ text: 'Module 2' }] }
        ],
        edges: [
          { id: 'edge-0', sources: ['mod1'], targets: ['mod2'] }
        ]
      });

      let result = await computeLayoutInWorker(specV12);
      expect(result.edges[0].source).toBe('mod1');
      expect(result.edges[0].target).toBe('mod2');

      // Test with sources/targets as strings
      mockElk.layout.mockResolvedValue({
        children: [
          { id: 'mod1', x: 0, y: 0, width: 200, height: 150, labels: [{ text: 'Module 1' }] },
          { id: 'mod2', x: 250, y: 0, width: 200, height: 150, labels: [{ text: 'Module 2' }] }
        ],
        edges: [
          { id: 'edge-0', sources: 'mod1', targets: 'mod2' }
        ]
      });

      result = await computeLayoutInWorker(specV12);
      expect(result.edges[0].source).toBe('mod1');
      expect(result.edges[0].target).toBe('mod2');
    });

    it('should include ELK layout options', async () => {
      const specV12 = {
        modules: [{ id: 'mod1', title: 'Module 1' }]
      };

      mockElk.layout.mockResolvedValue({
        children: [],
        edges: []
      });

      await computeLayoutInWorker(specV12);

      expect(mockElk.layout).toHaveBeenCalledWith(
        expect.objectContaining({
          layoutOptions: expect.objectContaining({
            "elk.direction": "RIGHT",
            "elk.padding": "[top=25,left=25,bottom=25,right=25]",
            "elk.spacing.nodeNode": "25",
            "elk.layered.spacing.nodeNodeBetweenLayers": "50"
          })
        }),
        expect.objectContaining({
          layoutOptions: { "elk.direction": "RIGHT" }
        })
      );
    });
  });

  describe('Performance and Non-blocking', () => {
    it('should complete layout computation within reasonable time', async () => {
      const largeSpec = {
        modules: Array.from({ length: 50 }, (_, i) => ({
          id: `mod${i}`,
          title: `Module ${i}`
        })),
        connections: Array.from({ length: 49 }, (_, i) => ({
          from: `mod${i}`,
          to: `mod${i + 1}`
        }))
      };

      mockElk.layout.mockResolvedValue({
        children: largeSpec.modules.map((mod, i) => ({
          id: mod.id,
          x: i * 250,
          y: 0,
          width: 200,
          height: 150,
          labels: [{ text: mod.title }]
        })),
        edges: largeSpec.connections.map((conn, i) => ({
          id: `edge-${i}`,
          sources: conn.from,
          targets: conn.to
        }))
      });

      const startTime = Date.now();
      const result = await computeLayoutInWorker(largeSpec);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(result.nodes).toHaveLength(50);
      expect(result.edges).toHaveLength(49);
    });

    it('should handle concurrent layout computations', async () => {
      const spec1 = { modules: [{ id: 'mod1', title: 'Module 1' }] };
      const spec2 = { modules: [{ id: 'mod2', title: 'Module 2' }] };

      mockElk.layout
        .mockResolvedValueOnce({
          children: [{ id: 'mod1', x: 0, y: 0, width: 200, height: 150, labels: [{ text: 'Module 1' }] }],
          edges: []
        })
        .mockResolvedValueOnce({
          children: [{ id: 'mod2', x: 0, y: 0, width: 200, height: 150, labels: [{ text: 'Module 2' }] }],
          edges: []
        });

      const [result1, result2] = await Promise.all([
        computeLayoutInWorker(spec1),
        computeLayoutInWorker(spec2)
      ]);

      expect(result1.nodes[0].id).toBe('mod1');
      expect(result2.nodes[0].id).toBe('mod2');
      expect(mockElk.layout).toHaveBeenCalledTimes(2);
    });
  });
});