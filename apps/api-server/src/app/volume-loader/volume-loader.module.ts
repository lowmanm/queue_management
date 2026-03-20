import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VolumeLoaderController } from './volume-loader.controller';
import { VolumeLoaderService } from './volume-loader.service';
import { ServicesModule } from '../services/services.module';
import { PipelineModule } from '../pipelines/pipeline.module';
import { VolumeLoaderEntity } from '../entities/volume-loader.entity';
import { VolumeLoaderRunEntity } from '../entities/volume-loader-run.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([VolumeLoaderEntity, VolumeLoaderRunEntity]),
    forwardRef(() => ServicesModule),
    forwardRef(() => PipelineModule),
  ],
  controllers: [VolumeLoaderController],
  providers: [VolumeLoaderService],
  exports: [VolumeLoaderService],
})
export class VolumeLoaderModule {}
