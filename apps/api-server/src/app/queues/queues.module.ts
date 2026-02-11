import { Module } from '@nestjs/common';
import { ServicesModule } from '../services';

/**
 * QueuesModule now delegates all /queues routes to the QueueController
 * in PipelineModule (pipeline.controller.ts) which bridges PipelineService
 * (queue config) and QueueManagerService (live task data).
 *
 * The legacy QueuesController was removed to eliminate the duplicate
 * @Controller('queues') route collision.
 */
@Module({
  imports: [ServicesModule],
})
export class QueuesModule {}
