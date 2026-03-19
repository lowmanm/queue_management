import { Module } from '@nestjs/common';
import { ServicesModule } from '../services';
import { DlqController } from './dlq.controller';

/**
 * QueuesModule — registered before PipelineModule in AppModule so that
 * /queues/dlq routes resolve before /queues/:id in the pipeline QueueController.
 *
 * All /queues CRUD routes are handled by QueueController in PipelineModule.
 * DLQ inspection and recovery is handled here by DlqController.
 */
@Module({
  imports: [ServicesModule],
  controllers: [DlqController],
})
export class QueuesModule {}
