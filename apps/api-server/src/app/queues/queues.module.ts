import { Module } from '@nestjs/common';
import { ServicesModule } from '../services';
import { DlqController } from './dlq.controller';
import { DlqAutoRetryService } from './dlq-auto-retry.service';

/**
 * QueuesModule — registered before PipelineModule in AppModule so that
 * /queues/dlq routes resolve before /queues/:id in the pipeline QueueController.
 *
 * All /queues CRUD routes are handled by QueueController in PipelineModule.
 * DLQ inspection and recovery is handled here by DlqController.
 * DLQ automatic retry scheduling is handled by DlqAutoRetryService.
 */
@Module({
  imports: [ServicesModule],
  controllers: [DlqController],
  providers: [DlqAutoRetryService],
})
export class QueuesModule {}
