import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { ServicesModule } from '../services';

@Module({
  imports: [ServicesModule],
  controllers: [MetricsController],
})
export class MetricsModule {}
