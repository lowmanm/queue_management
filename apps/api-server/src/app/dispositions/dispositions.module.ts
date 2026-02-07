import { Module } from '@nestjs/common';
import { DispositionsController } from './dispositions.controller';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [ServicesModule],
  controllers: [DispositionsController],
})
export class DispositionsModule {}
