import { Module } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [ServicesModule],
  providers: [AgentGateway],
  exports: [AgentGateway],
})
export class GatewayModule {}
