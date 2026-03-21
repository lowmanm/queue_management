import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { ServicesModule } from '../services';
import { MonitoringModule } from '../monitoring/metrics.module';

@Module({
  imports: [ServicesModule, MonitoringModule],
  controllers: [MetricsController],
})
export class MetricsModule {}
