import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TasksModule } from './tasks';
import { GatewayModule } from './gateway';
import { ServicesModule } from './services';
import { RulesModule } from './rules';

@Module({
  imports: [TasksModule, GatewayModule, ServicesModule, RulesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
