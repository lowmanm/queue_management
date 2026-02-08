import { Module, forwardRef } from '@nestjs/common';
import { VolumeLoaderController } from './volume-loader.controller';
import { VolumeLoaderService } from './volume-loader.service';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [forwardRef(() => ServicesModule)],
  controllers: [VolumeLoaderController],
  providers: [VolumeLoaderService],
  exports: [VolumeLoaderService],
})
export class VolumeLoaderModule {}
