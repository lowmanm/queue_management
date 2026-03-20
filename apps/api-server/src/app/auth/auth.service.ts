import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RbacService } from '../services/rbac.service';
import { User, getUserPermissions } from '@nexus-queue/shared-models';
import { JwtPayload } from './jwt.strategy';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export interface TokenPair {
  accessToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly rbacService: RbacService,
    private readonly jwtService: JwtService
  ) {}

  /**
   * Validate username/password credentials.
   * Returns the User if valid, null otherwise.
   */
  async validateUser(username: string, password: string): Promise<User | null> {
    const user = this.rbacService.getUserByUsername(username);
    if (!user || !user.active) {
      return null;
    }

    const passwordHash = await this.rbacService.getUserPasswordHash(user.id);
    if (!passwordHash) {
      return null;
    }

    const isValid = await bcrypt.compare(password, passwordHash);
    return isValid ? user : null;
  }

  /**
   * Issue access and refresh tokens for an authenticated user.
   */
  async login(user: User): Promise<LoginResponse> {
    const permissions = getUserPermissions(user);
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      permissions,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: '7d' }
    );

    return { accessToken, refreshToken, expiresIn: 900, user };
  }

  /**
   * Exchange a valid refresh token for a new access token.
   */
  async refreshToken(token: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }

    const user = this.rbacService.getUserById(payload.sub);
    if (!user || !user.active) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const permissions = getUserPermissions(user);
    const newPayload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      permissions,
    };

    const accessToken = this.jwtService.sign(newPayload, { expiresIn: '15m' });
    return { accessToken, expiresIn: 900 };
  }
}
