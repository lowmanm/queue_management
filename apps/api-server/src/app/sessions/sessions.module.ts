import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { ServicesModule } from '../services';

@Module({
  imports: [ServicesModule],
  controllers: [SessionsController],
})
export class SessionsModule {}
