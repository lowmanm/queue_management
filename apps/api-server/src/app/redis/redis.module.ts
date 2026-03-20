import { Global, Module, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { REDIS_CLIENT } from './redis.constants';

const logger = new Logger('RedisModule');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis | null => {
        const redisUrl = process.env['REDIS_URL'];

        if (!redisUrl) {
          logger.warn(
            'REDIS_URL not set — Redis disabled. Agent state will use in-memory fallback. ' +
            'Set REDIS_URL=redis://localhost:6379 to enable Redis.'
          );
          return null;
        }

        const client = new Redis(redisUrl, {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          retryStrategy: (times: number) => {
            if (times > 3) {
              logger.warn(`Redis connection failed after ${times} attempts — giving up`);
              return null; // stop retrying
            }
            return Math.min(times * 200, 2000);
          },
        });

        client.on('connect', () => {
          logger.log(`Connected to Redis at ${redisUrl}`);
        });

        client.on('error', (err: Error) => {
          logger.warn(`Redis error (non-fatal): ${err.message}`);
        });

        client.connect().catch((err: Error) => {
          logger.warn(`Redis initial connect failed (non-fatal): ${err.message}`);
        });

        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
