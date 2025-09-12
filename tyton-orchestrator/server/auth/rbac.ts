import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyJWT, extractBearerToken, type UserJWTPayload } from './jwt';
import { verifyApiKey } from './hash';

// Define available roles
export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer'
} as const;

// Define project-specific roles
export const PROJECT_ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer'
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];
export type ProjectRole = typeof PROJECT_ROLES[keyof typeof PROJECT_ROLES];

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string;
    email: string;
    roles: Role[];
  };
  apiKey?: {
    id: string;
    name: string;
    userId: string;
  };
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    roles: Role[];
  };
  apiKey?: {
    id: string;
    name: string;
    userId: string;
  };
  error?: string;
}

/**
 * Authenticate request using JWT or API key
 */
export async function authenticate(request: NextRequest): Promise<AuthResult> {
  try {
    // Try JWT authentication first
    const authHeader = request.headers.get('authorization');
    const bearerToken = extractBearerToken(authHeader);
    
    if (bearerToken) {
      try {
        const payload = await verifyJWT(bearerToken);
        return {
          success: true,
          user: {
            id: payload.userId,
            email: payload.email,
            roles: payload.roles as Role[]
          }
        };
      } catch (error) {
        console.warn('JWT authentication failed:', error instanceof Error ? error.message : 'Unknown error');
      }
    }

    // Try API key authentication
    const apiKeyHeader = request.headers.get('x-api-key');
    if (apiKeyHeader) {
      try {
        const apiKey = await prisma.apiKey.findFirst({
          where: {
            hashedKey: apiKeyHeader // In real implementation, this would be hashed
          },
          include: {
            user: true
          }
        });

        if (!apiKey) {
          return { success: false, error: 'Invalid API key' };
        }

        // Verify the API key hash
        if (!verifyApiKey(apiKeyHeader, apiKey.hashedKey)) {
          return { success: false, error: 'Invalid API key' };
        }

        // Update last used timestamp
        await prisma.apiKey.update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() }
        });

        const userRoles = JSON.parse(apiKey.user.roles || '["user"]') as Role[];

        return {
          success: true,
          apiKey: {
            id: apiKey.id,
            name: apiKey.name,
            userId: apiKey.userId
          },
          user: {
            id: apiKey.user.id,
            email: apiKey.user.email,
            roles: userRoles
          }
        };
      } catch (error) {
        console.error('API key authentication failed:', error);
        return { success: false, error: 'API key authentication failed' };
      }
    }

    return { success: false, error: 'No authentication credentials provided' };
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, error: 'Authentication failed' };
  }
}

/**
 * Check if user has required role
 */
export function hasRole(userRoles: Role[], requiredRole: Role): boolean {
  if (userRoles.includes(ROLES.ADMIN)) {
    return true; // Admin has all permissions
  }
  return userRoles.includes(requiredRole);
}

/**
 * Check if user has project-specific role
 */
export async function hasProjectRole(
  userId: string, 
  projectId: string, 
  requiredRole: ProjectRole
): Promise<boolean> {
  try {
    // Check if user is admin (global admin has access to all projects)
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return false;

    const userRoles = JSON.parse(user.roles || '["user"]') as Role[];
    if (userRoles.includes(ROLES.ADMIN)) {
      return true;
    }

    // Check project membership
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      }
    });

    if (!membership) return false;

    // Check role hierarchy
    switch (requiredRole) {
      case PROJECT_ROLES.VIEWER:
        return [PROJECT_ROLES.VIEWER, PROJECT_ROLES.EDITOR, PROJECT_ROLES.ADMIN].includes(membership.role as ProjectRole);
      case PROJECT_ROLES.EDITOR:
        return [PROJECT_ROLES.EDITOR, PROJECT_ROLES.ADMIN].includes(membership.role as ProjectRole);
      case PROJECT_ROLES.ADMIN:
        return membership.role === PROJECT_ROLES.ADMIN;
      default:
        return false;
    }
  } catch (error) {
    console.error('Project role check failed:', error);
    return false;
  }
}

/**
 * Middleware to require authentication
 */
export function requireAuth() {
  return async (request: NextRequest) => {
    const authResult = await authenticate(request);
    
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Authentication required', details: authResult.error },
        { status: 401 }
      );
    }

    // Attach user info to request
    (request as AuthenticatedRequest).user = authResult.user;
    (request as AuthenticatedRequest).apiKey = authResult.apiKey;

    return null; // Allow request to continue
  };
}

/**
 * Middleware to require specific role
 */
export function requireRole(role: Role) {
  return async (request: NextRequest) => {
    const authResult = await authenticate(request);
    
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required', details: authResult.error },
        { status: 401 }
      );
    }

    if (!hasRole(authResult.user.roles, role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions', required_role: role },
        { status: 403 }
      );
    }

    // Attach user info to request
    (request as AuthenticatedRequest).user = authResult.user;
    (request as AuthenticatedRequest).apiKey = authResult.apiKey;

    return null;
  };
}

/**
 * Middleware to require project role
 */
export function requireProjectRole(projectId: string, role: ProjectRole) {
  return async (request: NextRequest) => {
    const authResult = await authenticate(request);
    
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required', details: authResult.error },
        { status: 401 }
      );
    }

    const hasPermission = await hasProjectRole(authResult.user.id, projectId, role);
    
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient project permissions', required_role: role, project_id: projectId },
        { status: 403 }
      );
    }

    // Attach user info to request
    (request as AuthenticatedRequest).user = authResult.user;
    (request as AuthenticatedRequest).apiKey = authResult.apiKey;

    return null;
  };
}

/**
 * Get user's project permissions
 */
export async function getUserProjectPermissions(userId: string, projectId: string): Promise<{
  isMember: boolean;
  role?: ProjectRole;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canAdmin: boolean;
  };
}> {
  try {
    // Check if user is global admin
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return {
        isMember: false,
        permissions: { canView: false, canEdit: false, canAdmin: false }
      };
    }

    const userRoles = JSON.parse(user.roles || '["user"]') as Role[];
    if (userRoles.includes(ROLES.ADMIN)) {
      return {
        isMember: true,
        role: PROJECT_ROLES.ADMIN,
        permissions: { canView: true, canEdit: true, canAdmin: true }
      };
    }

    // Check project membership
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      }
    });

    if (!membership) {
      return {
        isMember: false,
        permissions: { canView: false, canEdit: false, canAdmin: false }
      };
    }

    const projectRole = membership.role as ProjectRole;
    return {
      isMember: true,
      role: projectRole,
      permissions: {
        canView: [PROJECT_ROLES.VIEWER, PROJECT_ROLES.EDITOR, PROJECT_ROLES.ADMIN].includes(projectRole),
        canEdit: [PROJECT_ROLES.EDITOR, PROJECT_ROLES.ADMIN].includes(projectRole),
        canAdmin: projectRole === PROJECT_ROLES.ADMIN
      }
    };
  } catch (error) {
    console.error('Failed to get user project permissions:', error);
    return {
      isMember: false,
      permissions: { canView: false, canEdit: false, canAdmin: false }
    };
  }
}