import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hasRole, hasProjectRole, ROLES, PROJECT_ROLES } from '../server/auth/rbac';
import { prisma } from '../server/db/client';

// Mock prisma
vi.mock('../server/db/client', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    projectMember: {
      findUnique: vi.fn(),
    },
    apiKey: {
      findFirst: vi.fn(),
      update: vi.fn(),
    }
  }
}));

describe('RBAC Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Role Hierarchy', () => {
    it('should grant admin role all permissions', () => {
      const adminRoles = [ROLES.ADMIN];
      
      expect(hasRole(adminRoles, ROLES.USER)).toBe(true);
      expect(hasRole(adminRoles, ROLES.VIEWER)).toBe(true);
      expect(hasRole(adminRoles, ROLES.ADMIN)).toBe(true);
    });

    it('should respect user role permissions', () => {
      const userRoles = [ROLES.USER];
      
      expect(hasRole(userRoles, ROLES.USER)).toBe(true);
      expect(hasRole(userRoles, ROLES.VIEWER)).toBe(false);
      expect(hasRole(userRoles, ROLES.ADMIN)).toBe(false);
    });

    it('should handle multiple roles', () => {
      const multipleRoles = [ROLES.USER, ROLES.VIEWER];
      
      expect(hasRole(multipleRoles, ROLES.USER)).toBe(true);
      expect(hasRole(multipleRoles, ROLES.VIEWER)).toBe(true);
      expect(hasRole(multipleRoles, ROLES.ADMIN)).toBe(false);
    });

    it('should handle empty roles array', () => {
      const emptyRoles: any[] = [];
      
      expect(hasRole(emptyRoles, ROLES.USER)).toBe(false);
      expect(hasRole(emptyRoles, ROLES.ADMIN)).toBe(false);
    });
  });

  describe('Project Role Hierarchy', () => {
    const mockUserId = 'user123';
    const mockProjectId = 'project456';

    it('should grant global admin access to all projects', async () => {
      const mockPrismaUser = vi.mocked(prisma.user);
      mockPrismaUser.findUnique.mockResolvedValueOnce({
        id: mockUserId,
        email: 'admin@test.com',
        roles: JSON.stringify([ROLES.ADMIN]),
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: null
      });

      const result = await hasProjectRole(mockUserId, mockProjectId, PROJECT_ROLES.VIEWER);
      
      expect(result).toBe(true);
      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { id: mockUserId }
      });
    });

    it('should check project membership for non-admin users', async () => {
      const mockPrismaUser = vi.mocked(prisma.user);
      const mockPrismaProjectMember = vi.mocked(prisma.projectMember);

      mockPrismaUser.findUnique.mockResolvedValueOnce({
        id: mockUserId,
        email: 'user@test.com',
        roles: JSON.stringify([ROLES.USER]),
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: null
      });

      mockPrismaProjectMember.findUnique.mockResolvedValueOnce({
        id: 'membership123',
        projectId: mockProjectId,
        userId: mockUserId,
        role: PROJECT_ROLES.EDITOR
      });

      const result = await hasProjectRole(mockUserId, mockProjectId, PROJECT_ROLES.EDITOR);
      
      expect(result).toBe(true);
      expect(mockPrismaProjectMember.findUnique).toHaveBeenCalledWith({
        where: {
          projectId_userId: {
            projectId: mockProjectId,
            userId: mockUserId
          }
        }
      });
    });

    it('should respect project role hierarchy', async () => {
      const mockPrismaUser = vi.mocked(prisma.user);
      const mockPrismaProjectMember = vi.mocked(prisma.projectMember);

      mockPrismaUser.findUnique.mockResolvedValue({
        id: mockUserId,
        email: 'user@test.com',
        roles: JSON.stringify([ROLES.USER]),
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: null
      });

      // Editor role should grant viewer permissions
      mockPrismaProjectMember.findUnique.mockResolvedValue({
        id: 'membership123',
        projectId: mockProjectId,
        userId: mockUserId,
        role: PROJECT_ROLES.EDITOR
      });

      expect(await hasProjectRole(mockUserId, mockProjectId, PROJECT_ROLES.VIEWER)).toBe(true);
      expect(await hasProjectRole(mockUserId, mockProjectId, PROJECT_ROLES.EDITOR)).toBe(true);
      expect(await hasProjectRole(mockUserId, mockProjectId, PROJECT_ROLES.ADMIN)).toBe(false);
    });

    it('should deny access to non-members', async () => {
      const mockPrismaUser = vi.mocked(prisma.user);
      const mockPrismaProjectMember = vi.mocked(prisma.projectMember);

      mockPrismaUser.findUnique.mockResolvedValueOnce({
        id: mockUserId,
        email: 'user@test.com',
        roles: JSON.stringify([ROLES.USER]),
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: null
      });

      mockPrismaProjectMember.findUnique.mockResolvedValueOnce(null);

      const result = await hasProjectRole(mockUserId, mockProjectId, PROJECT_ROLES.VIEWER);
      
      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      const mockPrismaUser = vi.mocked(prisma.user);
      mockPrismaUser.findUnique.mockRejectedValueOnce(new Error('Database error'));

      const result = await hasProjectRole(mockUserId, mockProjectId, PROJECT_ROLES.VIEWER);
      
      expect(result).toBe(false);
    });

    it('should handle missing user', async () => {
      const mockPrismaUser = vi.mocked(prisma.user);
      mockPrismaUser.findUnique.mockResolvedValueOnce(null);

      const result = await hasProjectRole(mockUserId, mockProjectId, PROJECT_ROLES.VIEWER);
      
      expect(result).toBe(false);
    });
  });

  describe('Role Constants', () => {
    it('should have correct role values', () => {
      expect(ROLES.ADMIN).toBe('admin');
      expect(ROLES.USER).toBe('user');
      expect(ROLES.VIEWER).toBe('viewer');
    });

    it('should have correct project role values', () => {
      expect(PROJECT_ROLES.ADMIN).toBe('admin');
      expect(PROJECT_ROLES.EDITOR).toBe('editor');
      expect(PROJECT_ROLES.VIEWER).toBe('viewer');
    });
  });
});