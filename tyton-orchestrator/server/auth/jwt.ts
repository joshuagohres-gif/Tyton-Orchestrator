import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Convert string secret to Uint8Array for JOSE
const secret = new TextEncoder().encode(JWT_SECRET);

export interface UserJWTPayload extends JWTPayload {
  userId: string;
  email: string;
  roles: string[];
}

/**
 * Sign a JWT token with user information
 */
export async function signJWT(payload: {
  userId: string;
  email: string;
  roles: string[];
}): Promise<string> {
  return await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    roles: payload.roles
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h') // 24 hour expiration
    .setIssuer('tyton-orchestrator')
    .setAudience('tyton-users')
    .sign(secret);
}

/**
 * Verify and decode a JWT token
 */
export async function verifyJWT(token: string): Promise<UserJWTPayload> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'tyton-orchestrator',
      audience: 'tyton-users'
    });

    return payload as UserJWTPayload;
  } catch (error) {
    throw new Error(`JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a refresh token (longer expiration)
 */
export async function signRefreshToken(payload: {
  userId: string;
  email: string;
}): Promise<string> {
  return await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    type: 'refresh'
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d') // 7 day expiration
    .setIssuer('tyton-orchestrator')
    .setAudience('tyton-users')
    .sign(secret);
}

/**
 * Verify a refresh token
 */
export async function verifyRefreshToken(token: string): Promise<{
  userId: string;
  email: string;
}> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'tyton-orchestrator',
      audience: 'tyton-users'
    });

    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return {
      userId: payload.userId as string,
      email: payload.email as string
    };
  } catch (error) {
    throw new Error(`Refresh token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract JWT from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Get token expiration time in seconds
 */
export function getTokenExpiration(token: string): number | null {
  try {
    // Simple base64 decode of JWT payload (not cryptographically secure, just for exp check)
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp || null;
  } catch {
    return null;
  }
}

/**
 * Check if token is expired or will expire soon
 */
export function isTokenExpiringSoon(token: string, bufferMinutes: number = 5): boolean {
  const exp = getTokenExpiration(token);
  if (!exp) return true;
  
  const now = Math.floor(Date.now() / 1000);
  const bufferSeconds = bufferMinutes * 60;
  
  return (exp - now) <= bufferSeconds;
}