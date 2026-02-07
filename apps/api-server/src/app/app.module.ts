import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TasksModule } from './tasks';
import { GatewayModule } from './gateway';
import { ServicesModule } from './services';
import { RulesModule } from './rules';
import { TaskSourcesModule } from './task-sources';
import { DispositionsModule } from './dispositions';
import { RbacModule } from './rbac';
import { AgentsModule } from './agents/agents.module';
import { QueuesModule } from './queues/queues.module';
import { MetricsModule } from './metrics/metrics.module';
import { RoutingModule } from './routing/routing.module';

@Module({
  imports: [
    ServicesModule,
    TasksModule,
    GatewayModule,
    RulesModule,
    TaskSourcesModule,
    DispositionsModule,
    RbacModule,
    AgentsModule,
    QueuesModule,
    MetricsModule,
    RoutingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
