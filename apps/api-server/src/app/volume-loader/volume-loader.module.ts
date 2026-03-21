import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VolumeLoaderController } from './volume-loader.controller';
import { VolumeLoaderService } from './volume-loader.service';
import { ServicesModule } from '../services/services.module';
import { PipelineModule } from '../pipelines/pipeline.module';
import { VolumeLoaderEntity } from '../entities/volume-loader.entity';
import { VolumeLoaderRunEntity } from '../entities/volume-loader-run.entity';
import {
  LocalConnectorService,
  HttpConnectorService,
  S3ConnectorService,
  GcsConnectorService,
  SftpConnectorService,
} from './connectors';

@Module({
  imports: [
    TypeOrmModule.forFeature([VolumeLoaderEntity, VolumeLoaderRunEntity]),
    forwardRef(() => ServicesModule),
    forwardRef(() => PipelineModule),
  ],
  controllers: [VolumeLoaderController],
  providers: [
    VolumeLoaderService,
    LocalConnectorService,
    HttpConnectorService,
    S3ConnectorService,
    GcsConnectorService,
    SftpConnectorService,
  ],
  exports: [VolumeLoaderService],
})
export class VolumeLoaderModule {}
