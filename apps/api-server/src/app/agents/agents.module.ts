import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { ServicesModule } from '../services';

@Module({
  imports: [ServicesModule],
  controllers: [AgentsController],
})
export class AgentsModule {}
