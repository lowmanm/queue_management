import { Module } from '@nestjs/common';
import { PipelineController, QueueController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

@Module({
  controllers: [PipelineController, QueueController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
