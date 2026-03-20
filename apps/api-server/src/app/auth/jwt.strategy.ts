import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RbacService } from '../services/rbac.service';
import { User } from '@nexus-queue/shared-models';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  permissions: string[];
  type?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly rbacService: RbacService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env['JWT_SECRET'] ?? 'nexus-dev-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = this.rbacService.getUserById(payload.sub);
    if (!user || !user.active) {
      throw new UnauthorizedException('User not found or inactive');
    }
    return user;
  }
}
