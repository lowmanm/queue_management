import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TasksModule } from './tasks';
import { GatewayModule } from './gateway';
import { ServicesModule } from './services';

@Module({
  imports: [TasksModule, GatewayModule, ServicesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
