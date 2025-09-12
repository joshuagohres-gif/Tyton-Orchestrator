import { NextRequest, NextResponse } from 'next/server';
import { authenticate, requireAuth, requireRole, requireProjectRole, type AuthenticatedRequest, type Role, type ProjectRole } from '@/server/auth/rbac';

/**
 * Middleware composition utility
 */
export type Middleware = (request: NextRequest) => Promise<NextResponse | null>;

/**
 * Compose multiple middleware functions
 */
export function composeMiddleware(...middlewares: Middleware[]): Middleware {
  return async (request: NextRequest) => {
    for (const middleware of middlewares) {
      const response = await middleware(request);
      if (response) {
        return response; // Short-circuit on error response
      }
    }
    return null; // All middleware passed
  };
}

/**
 * Apply middleware to a route handler
 */
export function withMiddleware(
  handler: (request: AuthenticatedRequest, context?: any) => Promise<Response>,
  middleware: Middleware
) {
  return async (request: NextRequest, context?: any) => {
    // Apply middleware
    const middlewareResponse = await middleware(request);
    if (middlewareResponse) {
      return middlewareResponse; // Return error response
    }

    // Call the actual handler
    return handler(request as AuthenticatedRequest, context);
  };
}

/**
 * CORS middleware
 */
export function corsMiddleware(options: {
  origin?: string | string[];
  methods?: string[];
  credentials?: boolean;
} = {}): Middleware {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials = false
  } = options;

  return async (request: NextRequest) => {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': methods.join(', '),
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
        'Access-Control-Max-Age': '86400' // 24 hours
      };

      if (typeof origin === 'string') {
        headers['Access-Control-Allow-Origin'] = origin;
      } else if (Array.isArray(origin)) {
        const requestOrigin = request.headers.get('origin');
        if (requestOrigin && origin.includes(requestOrigin)) {
          headers['Access-Control-Allow-Origin'] = requestOrigin;
        }
      }

      if (credentials) {
        headers['Access-Control-Allow-Credentials'] = 'true';
      }

      return new NextResponse(null, { status: 200, headers });
    }

    return null; // Continue with request
  };
}

/**
 * Request logging middleware
 */
export function loggingMiddleware(): Middleware {
  return async (request: NextRequest) => {
    const start = Date.now();
    const method = request.method;
    const url = request.url;
    const userAgent = request.headers.get('user-agent') || '';
    
    console.log(`[${new Date().toISOString()}] ${method} ${url} - User-Agent: ${userAgent}`);
    
    // Store timing info for potential use in response headers
    (request as any).__startTime = start;
    
    return null;
  };
}

/**
 * Content-Type validation middleware
 */
export function validateContentType(expectedTypes: string[]): Middleware {
  return async (request: NextRequest) => {
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentType = request.headers.get('content-type');
      
      if (!contentType) {
        return NextResponse.json(
          { error: 'Content-Type header is required' },
          { status: 400 }
        );
      }

      const isValidType = expectedTypes.some(type => 
        contentType.includes(type)
      );

      if (!isValidType) {
        return NextResponse.json(
          { 
            error: 'Invalid Content-Type',
            expected: expectedTypes,
            received: contentType
          },
          { status: 400 }
        );
      }
    }

    return null;
  };
}

/**
 * Request size limit middleware
 */
export function requestSizeLimit(maxSizeBytes: number): Middleware {
  return async (request: NextRequest) => {
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentLength = request.headers.get('content-length');
      
      if (contentLength && parseInt(contentLength) > maxSizeBytes) {
        return NextResponse.json(
          { 
            error: 'Request too large',
            max_size: maxSizeBytes,
            received_size: parseInt(contentLength)
          },
          { status: 413 }
        );
      }
    }

    return null;
  };
}

/**
 * API key extraction middleware
 */
export function extractApiKey(): Middleware {
  return async (request: NextRequest) => {
    const apiKey = request.headers.get('x-api-key');
    if (apiKey) {
      // Store for later use
      (request as any).__apiKey = apiKey;
    }
    return null;
  };
}

/**
 * User context extraction middleware (must run after auth)
 */
export function extractUserContext(): Middleware {
  return async (request: NextRequest) => {
    const authRequest = request as AuthenticatedRequest;
    if (authRequest.user) {
      // Add user context to request headers for downstream processing
      const userContext = {
        userId: authRequest.user.id,
        email: authRequest.user.email,
        roles: authRequest.user.roles
      };
      
      (request as any).__userContext = userContext;
    }
    
    return null;
  };
}

/**
 * Project ID extraction from URL middleware
 */
export function extractProjectId(): Middleware {
  return async (request: NextRequest) => {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    
    // Look for project ID in common patterns
    // /api/projects/{projectId}/...
    // /api/orchestrator/{projectId}/...
    const projectIndex = pathSegments.findIndex(segment => 
      segment === 'projects' || segment === 'orchestrator'
    );
    
    if (projectIndex !== -1 && pathSegments[projectIndex + 1]) {
      const projectId = pathSegments[projectIndex + 1];
      (request as any).__projectId = projectId;
    }
    
    return null;
  };
}

/**
 * Common middleware combinations
 */
export const commonMiddleware = composeMiddleware(
  corsMiddleware(),
  loggingMiddleware(),
  validateContentType(['application/json']),
  requestSizeLimit(10 * 1024 * 1024) // 10MB limit
);

export const authMiddleware = composeMiddleware(
  commonMiddleware,
  requireAuth(),
  extractUserContext()
);

export const adminMiddleware = composeMiddleware(
  commonMiddleware,
  requireRole('admin'),
  extractUserContext()
);

/**
 * Project-specific middleware factory
 */
export function createProjectMiddleware(role: ProjectRole) {
  return (projectId: string) => composeMiddleware(
    commonMiddleware,
    extractProjectId(),
    requireProjectRole(projectId, role),
    extractUserContext()
  );
}

/**
 * Helper to create project editor middleware
 */
export const createProjectEditorMiddleware = createProjectMiddleware('editor');

/**
 * Helper to create project viewer middleware  
 */
export const createProjectViewerMiddleware = createProjectMiddleware('viewer');