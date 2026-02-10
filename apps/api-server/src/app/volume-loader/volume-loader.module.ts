import { Module, forwardRef } from '@nestjs/common';
import { VolumeLoaderController } from './volume-loader.controller';
import { VolumeLoaderService } from './volume-loader.service';
import { ServicesModule } from '../services/services.module';
import { PipelineModule } from '../pipelines/pipeline.module';

@Module({
  imports: [
    forwardRef(() => ServicesModule),
    forwardRef(() => PipelineModule),
  ],
  controllers: [VolumeLoaderController],
  providers: [VolumeLoaderService],
  exports: [VolumeLoaderService],
})
export class VolumeLoaderModule {}
