import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../server/db/client';
import BulkOperations from '../server/db/bulk';

describe('Bulk Database Operations', () => {
  let testProjectId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create test project
    const project = await prisma.project.create({
      data: {
        title: 'Bulk Operations Test',
        description: 'Test project for bulk operations',
        status: 'draft'
      }
    });
    testProjectId = project.id;
  });

  afterEach(async () => {
    // Cleanup
    if (testProjectId) {
      await prisma.project.delete({
        where: { id: testProjectId }
      }).catch(() => {}); // Ignore if already deleted
    }
  });

  describe('BOM Items Bulk Operations', () => {
    it('should outperform individual creates by ≥50% for 1000 items', async () => {
      const itemCount = 1000;
      const testItems = Array.from({ length: itemCount }, (_, index) => ({
        category: 'resistor',
        partNumber: `R${index}`,
        description: `Test resistor ${index}`,
        quantity: Math.floor(Math.random() * 100) + 1,
        unitCost: Math.random() * 10,
        extendedCost: Math.random() * 100
      }));

      // Test individual creates (legacy approach)
      const legacyStartTime = Date.now();
      
      await prisma.bomItem.deleteMany({ where: { projectId: testProjectId } });
      
      for (const item of testItems.slice(0, 100)) { // Only test 100 for comparison
        await prisma.bomItem.create({
          data: {
            projectId: testProjectId,
            ...item
          }
        });
      }
      
      const legacyDuration = Date.now() - legacyStartTime;

      // Test bulk operations (optimized approach)
      const bulkStartTime = Date.now();
      
      await BulkOperations.replaceBomItems(testProjectId, testItems);
      
      const bulkDuration = Date.now() - bulkStartTime;

      // Verify all items were created
      const createdItems = await prisma.bomItem.count({
        where: { projectId: testProjectId }
      });
      
      expect(createdItems).toBe(itemCount);

      // Calculate performance improvement
      const legacyPer100 = legacyDuration;
      const legacyProjected = (legacyPer100 / 100) * itemCount;
      const improvement = ((legacyProjected - bulkDuration) / legacyProjected) * 100;

      console.log(`📊 BOM Performance:
        - Legacy (100 items): ${legacyDuration}ms
        - Legacy (projected 1000): ${legacyProjected}ms  
        - Bulk (1000 items): ${bulkDuration}ms
        - Improvement: ${improvement.toFixed(1)}%`);

      // Should be at least 50% faster
      expect(improvement).toBeGreaterThanOrEqual(50);
    }, 30000);

    it('should handle transaction rollback on error', async () => {
      const validItems = [
        {
          category: 'resistor',
          partNumber: 'R1',
          description: 'Valid resistor',
          quantity: 10
        }
      ];

      // This should succeed
      await BulkOperations.replaceBomItems(testProjectId, validItems);
      
      let count = await prisma.bomItem.count({
        where: { projectId: testProjectId }
      });
      expect(count).toBe(1);

      // Test with invalid data that should cause rollback
      const invalidItems = [
        {
          category: 'resistor',
          partNumber: 'R2',
          description: 'Valid item',
          quantity: 10
        },
        {
          category: 'capacitor',
          partNumber: null as any, // This should cause an error
          description: 'Invalid item',
          quantity: 5
        }
      ];

      // This should fail and rollback
      try {
        await BulkOperations.replaceBomItems(testProjectId, invalidItems);
        expect.fail('Should have thrown an error');
      } catch (error) {
        // Expected to fail
      }

      // Original data should still be there (no partial state)
      count = await prisma.bomItem.count({
        where: { projectId: testProjectId }
      });
      expect(count).toBe(1);
      
      const remainingItem = await prisma.bomItem.findFirst({
        where: { projectId: testProjectId }
      });
      expect(remainingItem?.partNumber).toBe('R1');
    });
  });

  describe('Supplier Links Bulk Operations', () => {
    it('should replace supplier links efficiently', async () => {
      const supplierLinks = Array.from({ length: 500 }, (_, index) => ({
        partNumber: `PART${index}`,
        supplier: `Supplier ${index % 10}`,
        availability: index % 2 === 0 ? 'In Stock' : 'Limited',
        datasheetUrl: `https://example.com/datasheet${index}.pdf`,
        purchaseUrl: `https://supplier${index % 10}.com/part${index}`,
        altPartsJson: JSON.stringify([`ALT${index}A`, `ALT${index}B`])
      }));

      const startTime = Date.now();
      
      await BulkOperations.replaceSupplierLinks(testProjectId, supplierLinks);
      
      const duration = Date.now() - startTime;

      // Verify all links were created
      const createdLinks = await prisma.supplierLink.count({
        where: { projectId: testProjectId }
      });
      
      expect(createdLinks).toBe(500);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds

      console.log(`📊 Supplier Links: 500 items in ${duration}ms`);
    });
  });

  describe('Module Operations', () => {
    it('should create modules in batches efficiently', async () => {
      const modules = Array.from({ length: 200 }, (_, index) => ({
        projectId: testProjectId,
        kind: index % 2 === 0 ? 'electronics' : 'mechanical',
        label: `Module ${index}`,
        componentRef: `COMP${index}`,
        detailsMd: `Details for module ${index}`,
        metadata: JSON.stringify({ index, type: 'test' })
      }));

      const startTime = Date.now();
      
      const moduleIds = await BulkOperations.createModules(modules);
      
      const duration = Date.now() - startTime;

      expect(moduleIds).toHaveLength(200);
      expect(moduleIds.every(id => typeof id === 'string')).toBe(true);

      // Verify modules exist in database
      const createdModules = await prisma.module.count({
        where: { projectId: testProjectId }
      });
      
      expect(createdModules).toBe(200);
      
      console.log(`📊 Modules: 200 items in ${duration}ms`);
    });

    it('should update firmware efficiently', async () => {
      // First create some modules
      const modules = await BulkOperations.createModules([
        {
          projectId: testProjectId,
          kind: 'electronics',
          label: 'MCU Module 1',
          componentRef: 'MCU1'
        },
        {
          projectId: testProjectId,
          kind: 'electronics',
          label: 'MCU Module 2', 
          componentRef: 'MCU2'
        }
      ]);

      const firmwareUpdates = modules.map(id => ({
        id,
        firmwareCode: `void setup() { /* Module ${id} */ }`
      }));

      const startTime = Date.now();
      
      await BulkOperations.updateModuleFirmware(firmwareUpdates);
      
      const duration = Date.now() - startTime;

      // Verify firmware was updated
      const updatedModules = await prisma.module.findMany({
        where: { 
          id: { in: modules },
          firmwareCode: { not: null }
        }
      });

      expect(updatedModules).toHaveLength(2);
      expect(updatedModules.every(m => m.firmwareCode?.includes('void setup()'))).toBe(true);
      
      console.log(`📊 Firmware Updates: 2 modules in ${duration}ms`);
    });
  });

  describe('Full Context Queries', () => {
    it('should retrieve project with all relations in single query', async () => {
      // Setup test data
      await BulkOperations.replaceBomItems(testProjectId, [
        { category: 'resistor', partNumber: 'R1', description: 'Test resistor', quantity: 10 }
      ]);
      
      await BulkOperations.replaceSupplierLinks(testProjectId, [
        { partNumber: 'R1', supplier: 'Test Supplier', availability: 'In Stock' }
      ]);

      const moduleIds = await BulkOperations.createModules([
        { projectId: testProjectId, kind: 'electronics', label: 'Test Module' }
      ]);

      await prisma.connection.create({
        data: {
          projectId: testProjectId,
          fromModuleId: moduleIds[0],
          toModuleId: moduleIds[0],
          type: 'signal',
          label: 'Test connection'
        }
      });

      // Test the optimized query
      const startTime = Date.now();
      
      const project = await BulkOperations.getProjectWithFullContext(testProjectId);
      
      const duration = Date.now() - startTime;

      expect(project).toBeDefined();
      expect(project?.modules).toHaveLength(1);
      expect(project?.bomItems).toHaveLength(1);
      expect(project?.supplierLinks).toHaveLength(1);
      expect(project?.connections).toHaveLength(1);
      
      console.log(`📊 Full Context Query: ${duration}ms`);
    });
  });
});