import { Module } from '@nestjs/common';
import { RulesController } from './rules.controller';
import { ServicesModule } from '../services';

@Module({
  imports: [ServicesModule],
  controllers: [RulesController],
})
export class RulesModule {}
