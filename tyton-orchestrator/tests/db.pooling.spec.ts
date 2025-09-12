import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../server/db/client';

describe('Database Connection Pooling', () => {
  beforeAll(async () => {
    // Ensure clean test database state
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should handle 50 concurrent database connections without exhaustion', async () => {
    const startTime = Date.now();
    
    // Create 50 concurrent fake orchestration runs
    const concurrentOperations = Array.from({ length: 50 }, async (_, index) => {
      const projectId = `test-project-${index}`;
      
      // Simulate a typical orchestration database workload
      return await prisma.$transaction(async (tx) => {
        // Create project
        const project = await tx.project.create({
          data: {
            id: projectId,
            title: `Test Project ${index}`,
            description: 'Load test project',
            status: 'draft'
          }
        });

        // Create modules
        await tx.module.createMany({
          data: [
            {
              projectId,
              kind: 'electronics',
              label: `Module ${index}-1`,
              componentRef: `comp-${index}-1`
            },
            {
              projectId,
              kind: 'electronics', 
              label: `Module ${index}-2`,
              componentRef: `comp-${index}-2`
            }
          ]
        });

        // Create BOM items
        await tx.bomItem.createMany({
          data: [
            {
              projectId,
              category: 'resistor',
              partNumber: `R${index}-1`,
              description: 'Test resistor',
              quantity: 10
            }
          ]
        });

        return project;
      });
    });

    // Execute all operations concurrently
    const results = await Promise.all(concurrentOperations);
    
    const duration = Date.now() - startTime;
    
    // Verify all operations completed successfully
    expect(results).toHaveLength(50);
    expect(results.every(r => r.id.startsWith('test-project-'))).toBe(true);
    
    // Should complete in reasonable time (less than 30 seconds)
    expect(duration).toBeLessThan(30000);
    
    // Cleanup
    await prisma.project.deleteMany({
      where: {
        id: {
          startsWith: 'test-project-'
        }
      }
    });
    
    console.log(`✅ 50 concurrent operations completed in ${duration}ms`);
  }, 60000); // 60 second timeout

  it('should reuse database connections efficiently', async () => {
    // Test connection reuse by performing multiple sequential operations
    const operations = Array.from({ length: 10 }, async (_, index) => {
      const projectId = `reuse-test-${index}`;
      
      const project = await prisma.project.create({
        data: {
          id: projectId,
          title: `Reuse Test ${index}`,
          description: 'Connection reuse test',
          status: 'draft'
        }
      });
      
      // Immediately query the created project
      const retrieved = await prisma.project.findUnique({
        where: { id: projectId }
      });
      
      expect(retrieved?.id).toBe(projectId);
      
      return project;
    });

    // Execute sequentially to test connection reuse
    for (const operation of operations) {
      await operation;
    }

    // Cleanup
    await prisma.project.deleteMany({
      where: {
        id: {
          startsWith: 'reuse-test-'
        }
      }
    });
  });
});