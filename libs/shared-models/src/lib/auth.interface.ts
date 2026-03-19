/**
 * Authentication Interfaces
 *
 * Defines request/response structures for JWT-based authentication
 * (Phase 4: Real Authentication). Used by both the NestJS AuthModule
 * and the Angular AuthService.
 */

import type { Permission, User, UserRole } from './rbac.interface';

/**
 * Login request body sent to POST /api/auth/login.
 */
export interface LoginRequest {
  /** Username (not email) */
  username: string;

  /** Plain-text password (compared against bcrypt hash on server) */
  password: string;
}

/**
 * Successful login response from POST /api/auth/login.
 */
export interface LoginResponse {
  /** Short-lived JWT access token (15-minute TTL) */
  accessToken: string;

  /** Long-lived refresh token (7-day TTL) used to obtain new access tokens */
  refreshToken: string;

  /** Number of seconds until the access token expires */
  expiresIn: number;

  /** Authenticated user profile (without password hash) */
  user: User;
}

/**
 * Request body for POST /api/auth/refresh.
 */
export interface RefreshRequest {
  /** The refresh token obtained during login */
  refreshToken: string;
}

/**
 * Claims embedded in a JWT access token payload.
 * Decoded by the frontend to determine user role/permissions without
 * an additional API call.
 */
export interface JwtPayload {
  /** Subject — the authenticated user's ID */
  sub: string;

  /** Username for display */
  username: string;

  /** User's assigned role */
  role: UserRole;

  /** Effective permissions (role permissions + additional - denied) */
  permissions: Permission[];

  /** Issued-at timestamp (Unix epoch seconds) */
  iat: number;

  /** Expiry timestamp (Unix epoch seconds) */
  exp: number;
}

/**
 * A pair of access + refresh tokens returned after login or token refresh.
 */
export interface TokenPair {
  /** Short-lived JWT access token */
  accessToken: string;

  /** Long-lived refresh token */
  refreshToken: string;

  /** Seconds until the access token expires */
  expiresIn: number;
}
