import { Module } from '@nestjs/common';
import { QueuesController } from './queues.controller';
import { ServicesModule } from '../services';

@Module({
  imports: [ServicesModule],
  controllers: [QueuesController],
})
export class QueuesModule {}
