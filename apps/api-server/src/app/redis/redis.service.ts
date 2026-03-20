import { Injectable, Logger, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * RedisService — typed helpers wrapping an ioredis client.
 *
 * All methods degrade gracefully when Redis is unavailable (REDIS_URL not set
 * or connection failed). The service logs a warning and returns safe defaults
 * so the rest of the system continues functioning in single-instance in-memory mode.
 */
@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private subscriberClient: Redis | null = null;

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis | null) {}

  /** Create and return a dedicated subscriber client (required by ioredis for pub/sub). */
  createSubscriberClient(): Redis | null {
    if (!this.client) return null;
    if (!this.subscriberClient) {
      this.subscriberClient = this.client.duplicate();
    }
    return this.subscriberClient;
  }

  // === Hash operations ===

  async hset(key: string, field: string, value: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.hset(key, field, value);
    } catch (err) {
      this.logger.warn(`Redis hset failed for ${key}.${field}: ${err}`);
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.hget(key, field);
    } catch (err) {
      this.logger.warn(`Redis hget failed for ${key}.${field}: ${err}`);
      return null;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) return {};
    try {
      return (await this.client.hgetall(key)) ?? {};
    } catch (err) {
      this.logger.warn(`Redis hgetall failed for ${key}: ${err}`);
      return {};
    }
  }

  async hdel(key: string, field: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.hdel(key, field);
    } catch (err) {
      this.logger.warn(`Redis hdel failed for ${key}.${field}: ${err}`);
    }
  }

  // === Key operations ===

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.warn(`Redis del failed for ${key}: ${err}`);
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.expire(key, ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis expire failed for ${key}: ${err}`);
    }
  }

  async set(key: string, value: string, options?: { ttl?: number }): Promise<void> {
    if (!this.client) return;
    try {
      if (options?.ttl) {
        await this.client.set(key, value, 'EX', options.ttl);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      this.logger.warn(`Redis set failed for ${key}: ${err}`);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.warn(`Redis get failed for ${key}: ${err}`);
      return null;
    }
  }

  /** SCAN for keys matching a pattern. Returns matching key names. */
  async scan(pattern: string): Promise<string[]> {
    if (!this.client) return [];
    try {
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [nextCursor, batch] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== '0');
      return keys;
    } catch (err) {
      this.logger.warn(`Redis scan failed for pattern ${pattern}: ${err}`);
      return [];
    }
  }

  /** MGET — fetch multiple keys in one round-trip. */
  async mget(keys: string[]): Promise<(string | null)[]> {
    if (!this.client || keys.length === 0) return [];
    try {
      return await this.client.mget(...keys);
    } catch (err) {
      this.logger.warn(`Redis mget failed: ${err}`);
      return keys.map(() => null);
    }
  }

  // === Pub/Sub ===

  async publish(channel: string, message: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.publish(channel, message);
    } catch (err) {
      this.logger.warn(`Redis publish failed on ${channel}: ${err}`);
    }
  }

  /**
   * Subscribe to a channel using the dedicated subscriber client.
   * If Redis is unavailable this is a no-op.
   */
  subscribe(channel: string, callback: (msg: string) => void): void {
    const sub = this.createSubscriberClient();
    if (!sub) return;
    sub.subscribe(channel).catch((err) => {
      this.logger.warn(`Redis subscribe failed for ${channel}: ${err}`);
    });
    sub.on('message', (ch: string, msg: string) => {
      if (ch === channel) {
        callback(msg);
      }
    });
  }

  /** Returns true if the Redis client is connected and healthy. */
  isConnected(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }
}
