import {
  Controller,
  Post,
  Get,
  Body,
  Request,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService, LoginResponse, TokenPair } from './auth.service';
import { Public } from './public.decorator';
import { User } from '@nexus-queue/shared-models';

interface LoginRequest {
  username: string;
  password: string;
}

interface RefreshRequest {
  refreshToken: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Authenticate with username/password — returns JWT access + refresh tokens. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginRequest): Promise<LoginResponse> {
    const user = await this.authService.validateUser(body.username, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(user);
  }

  /** Exchange a refresh token for a new access token. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: RefreshRequest): Promise<TokenPair> {
    return this.authService.refreshToken(body.refreshToken);
  }

  /** Return the currently authenticated user (requires Bearer token). */
  @Get('me')
  getMe(@Request() req: { user: User }): User {
    return req.user;
  }
}
