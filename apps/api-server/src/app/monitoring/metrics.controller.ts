import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { MetricsService } from './metrics.service';

/** Exposes the Prometheus metrics endpoint at GET /api/metrics. */
@Controller('')
export class MonitoringMetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get('metrics')
  async getMetrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metricsService.getContentType());
    res.end(await this.metricsService.getMetrics());
  }
}
