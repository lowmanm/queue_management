import { Module, forwardRef } from '@nestjs/common';
import { PipelineController, QueueController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [forwardRef(() => ServicesModule)],
  controllers: [PipelineController, QueueController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
