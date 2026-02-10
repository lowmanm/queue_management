import { Module } from '@nestjs/common';
import { RbacController } from './rbac.controller';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [ServicesModule],
  controllers: [RbacController],
})
export class RbacModule {}
