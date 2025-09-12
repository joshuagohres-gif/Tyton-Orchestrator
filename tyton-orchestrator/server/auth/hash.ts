import argon2 from 'argon2';
import crypto from 'crypto';

const API_KEY_HASH_SALT = process.env.API_KEY_HASH_SALT || 'dev-default-salt-for-testing-only';
if (!process.env.API_KEY_HASH_SALT) {
  console.warn('API_KEY_HASH_SALT not configured - using default salt (not secure for production)');
}

/**
 * Hash a password using Argon2
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });
  } catch (error) {
    throw new Error(`Password hashing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

/**
 * Generate a secure API key
 */
export function generateApiKey(): string {
  // Generate 32 random bytes (256 bits) and encode as base64url
  const randomBytes = crypto.randomBytes(32);
  return randomBytes.toString('base64url');
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(apiKey: string): string {
  const hash = crypto.createHmac('sha256', API_KEY_HASH_SALT);
  hash.update(apiKey);
  return hash.digest('hex');
}

/**
 * Verify an API key against its hash
 */
export function verifyApiKey(apiKey: string, hashedKey: string): boolean {
  try {
    const computedHash = hashApiKey(apiKey);
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(hashedKey, 'hex')
    );
  } catch (error) {
    console.error('API key verification error:', error);
    return false;
  }
}

/**
 * Generate a secure random string for tokens
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Hash any string with salt for consistent hashing
 */
export function hashWithSalt(input: string, salt: string): string {
  const hash = crypto.createHmac('sha256', salt);
  hash.update(input);
  return hash.digest('hex');
}

/**
 * Generate a secure session ID
 */
export function generateSessionId(): string {
  return generateSecureToken(48); // 384 bits
}

/**
 * Check password strength
 */
export interface PasswordStrength {
  isValid: boolean;
  errors: string[];
  score: number; // 0-100
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const errors: string[] = [];
  let score = 0;

  // Length checks
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else if (password.length >= 12) {
    score += 20;
  } else {
    score += 10;
  }

  // Character variety checks
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  } else {
    score += 20;
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  } else {
    score += 20;
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  } else {
    score += 20;
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  } else {
    score += 20;
  }

  // Common password checks
  const commonPasswords = [
    'password', '123456', '123456789', 'qwerty', 'abc123',
    'password123', 'admin', 'letmein', 'welcome', 'monkey'
  ];
  
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common');
    score = Math.max(0, score - 50);
  }

  return {
    isValid: errors.length === 0 && score >= 60,
    errors,
    score
  };
}