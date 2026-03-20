import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { WebhooksService } from './webhooks.service';
import { WebhooksController, WebhookThrottlerGuard } from './webhooks.controller';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [
    ServicesModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookThrottlerGuard],
  exports: [WebhooksService],
})
export class WebhooksModule {}
