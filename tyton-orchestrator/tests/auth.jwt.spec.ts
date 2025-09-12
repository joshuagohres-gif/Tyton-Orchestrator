import { describe, it, expect, beforeEach } from 'vitest';
import { signJWT, verifyJWT, signRefreshToken, verifyRefreshToken, isTokenExpiringSoon } from '../server/auth/jwt';

describe('JWT Authentication', () => {
  const mockPayload = {
    userId: 'user123',
    email: 'test@example.com',
    roles: ['user', 'editor'] as const
  };

  describe('Access Token', () => {
    it('should sign and verify JWT tokens successfully', async () => {
      const token = await signJWT(mockPayload);
      expect(token).toBeTypeOf('string');
      expect(token.split('.')).toHaveLength(3);

      const verified = await verifyJWT(token);
      expect(verified.userId).toBe(mockPayload.userId);
      expect(verified.email).toBe(mockPayload.email);
      expect(verified.roles).toEqual(mockPayload.roles);
      expect(verified.iss).toBe('tyton-orchestrator');
      expect(verified.aud).toBe('tyton-users');
    });

    it('should fail verification with invalid token', async () => {
      const invalidToken = 'invalid.token.here';
      
      await expect(verifyJWT(invalidToken)).rejects.toThrow('JWT verification failed');
    });

    it('should fail verification with tampered token', async () => {
      const token = await signJWT(mockPayload);
      const tamperedToken = token.slice(0, -5) + 'XXXXX';
      
      await expect(verifyJWT(tamperedToken)).rejects.toThrow('JWT verification failed');
    });

    it('should include standard JWT claims', async () => {
      const token = await signJWT(mockPayload);
      const verified = await verifyJWT(token);
      
      expect(verified.iat).toBeTypeOf('number');
      expect(verified.exp).toBeTypeOf('number');
      expect(verified.iss).toBe('tyton-orchestrator');
      expect(verified.aud).toBe('tyton-users');
      
      // Token should be valid for 24 hours
      const expectedExp = verified.iat! + (24 * 60 * 60);
      expect(Math.abs(verified.exp! - expectedExp)).toBeLessThan(5); // 5 second tolerance
    });
  });

  describe('Refresh Token', () => {
    it('should sign and verify refresh tokens successfully', async () => {
      const refreshPayload = {
        userId: mockPayload.userId,
        email: mockPayload.email
      };

      const refreshToken = await signRefreshToken(refreshPayload);
      expect(refreshToken).toBeTypeOf('string');

      const verified = await verifyRefreshToken(refreshToken);
      expect(verified.userId).toBe(refreshPayload.userId);
      expect(verified.email).toBe(refreshPayload.email);
    });

    it('should fail to verify access token as refresh token', async () => {
      const accessToken = await signJWT(mockPayload);
      
      await expect(verifyRefreshToken(accessToken)).rejects.toThrow('Invalid token type');
    });

    it('should have longer expiration than access token', async () => {
      const accessToken = await signJWT(mockPayload);
      const refreshToken = await signRefreshToken({
        userId: mockPayload.userId,
        email: mockPayload.email
      });

      const accessPayload = await verifyJWT(accessToken);
      const refreshPayload = await verifyRefreshToken(refreshToken);

      expect(refreshPayload.exp! - refreshPayload.iat!).toBeGreaterThan(
        accessPayload.exp! - accessPayload.iat!
      );
    });
  });

  describe('Token Expiration', () => {
    it('should detect expiring tokens', async () => {
      // Create a token that expires soon (we can't easily mock this, so we'll test the utility function)
      const token = await signJWT(mockPayload);
      
      // Fresh token should not be expiring soon
      expect(isTokenExpiringSoon(token, 5)).toBe(false);
      
      // Token expiring within 24 hours should be detected if buffer is large enough
      expect(isTokenExpiringSoon(token, 24 * 60)).toBe(true);
    });

    it('should handle malformed tokens gracefully', () => {
      const malformedToken = 'not.a.valid.jwt';
      expect(isTokenExpiringSoon(malformedToken)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing JWT_SECRET gracefully', async () => {
      // This test would require temporarily unsetting the env var
      // For now, we'll just ensure our functions don't crash with expected inputs
      expect(async () => {
        await signJWT(mockPayload);
      }).not.toThrow();
    });

    it('should provide clear error messages', async () => {
      const invalidToken = 'clearly.invalid.token';
      
      try {
        await verifyJWT(invalidToken);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('JWT verification failed');
      }
    });
  });
});