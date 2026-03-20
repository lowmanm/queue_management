import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { MetricsService } from './metrics.service';
import { MonitoringMetricsController } from './metrics.controller';
import { HealthController } from './health.controller';
import { RedisModule } from '../redis';

@Module({
  imports: [TerminusModule, RedisModule],
  controllers: [MonitoringMetricsController, HealthController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MonitoringModule {}
