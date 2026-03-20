import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';
import { RedisService } from '../redis';

/** Health check endpoint at GET /api/health — usable by load balancers and k8s probes. */
@Controller('')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redisService: RedisService
  ) {}

  @Public()
  @Get('health')
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () =>
        Promise.resolve({
          redis: {
            status: this.redisService.isConnected() ? 'up' : 'down',
          },
        }),
    ]);
  }
}
