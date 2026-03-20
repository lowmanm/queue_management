import { Module } from '@nestjs/common';
import { ServicesModule } from '../services';
import { DlqController } from './dlq.controller';
import { QueuesController } from './queues.controller';
import { DlqAutoRetryService } from './dlq-auto-retry.service';

/**
 * QueuesModule — registered before PipelineModule in AppModule so that
 * /queues/dlq routes resolve before /queues/:id in the pipeline QueueController.
 *
 * DLQ inspection and recovery: DlqController
 * Bulk queue operations: QueuesController (POST /queues/bulk)
 * DLQ automatic retry scheduling: DlqAutoRetryService
 */
@Module({
  imports: [ServicesModule],
  controllers: [DlqController, QueuesController],
  providers: [DlqAutoRetryService],
})
export class QueuesModule {}
