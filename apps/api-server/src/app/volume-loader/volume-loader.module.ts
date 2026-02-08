import { Module } from '@nestjs/common';
import { VolumeLoaderController } from './volume-loader.controller';
import { VolumeLoaderService } from './volume-loader.service';

@Module({
  controllers: [VolumeLoaderController],
  providers: [VolumeLoaderService],
  exports: [VolumeLoaderService],
})
export class VolumeLoaderModule {}
