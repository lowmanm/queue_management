import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TasksModule } from './tasks';
import { GatewayModule } from './gateway';
import { ServicesModule } from './services';
import { RulesModule } from './rules';
import { TaskSourcesModule } from './task-sources';
import { DispositionsModule } from './dispositions';

@Module({
  imports: [
    TasksModule,
    GatewayModule,
    ServicesModule,
    RulesModule,
    TaskSourcesModule,
    DispositionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
