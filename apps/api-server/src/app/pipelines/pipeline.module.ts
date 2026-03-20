import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PipelineController, QueueController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { PipelineVersionService } from './pipeline-version.service';
import { ServicesModule } from '../services/services.module';
import { PipelineEntity, PipelineQueueEntity } from '../entities';

@Module({
  imports: [
    forwardRef(() => ServicesModule),
    TypeOrmModule.forFeature([PipelineEntity, PipelineQueueEntity]),
  ],
  controllers: [PipelineController, QueueController],
  providers: [PipelineService, PipelineVersionService],
  exports: [PipelineService, PipelineVersionService],
})
export class PipelineModule {}
