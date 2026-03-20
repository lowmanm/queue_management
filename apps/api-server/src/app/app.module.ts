import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database';
import { RedisModule } from './redis';
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
import { SessionsModule } from './sessions';
import { VolumeLoaderModule } from './volume-loader/volume-loader.module';
import { PipelineModule } from './pipelines/pipeline.module';
import { ProxyModule } from './proxy/proxy.module';
import { AuditLogModule } from './audit-log';
import { AuthModule } from './auth';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    AuthModule,
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
    SessionsModule,
    VolumeLoaderModule,
    PipelineModule,
    ProxyModule,
    AuditLogModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
