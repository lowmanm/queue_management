import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhooksService],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  describe('createEndpoint', () => {
    it('returns endpoint with unique token and secret', () => {
      const ep = service.createEndpoint('pipeline-1', 'My Webhook');
      expect(ep.id).toBeDefined();
      expect(ep.token).toHaveLength(64); // 32 bytes as hex
      expect(ep.secret).toHaveLength(64);
      expect(ep.pipelineId).toBe('pipeline-1');
      expect(ep.name).toBe('My Webhook');
      expect(ep.status).toBe('active');
      expect(ep.deliveryCount).toBe(0);
    });

    it('generates unique tokens across multiple endpoints', () => {
      const ep1 = service.createEndpoint('p1', 'EP1');
      const ep2 = service.createEndpoint('p1', 'EP2');
      expect(ep1.token).not.toBe(ep2.token);
      expect(ep1.id).not.toBe(ep2.id);
    });
  });

  describe('lookupByToken', () => {
    it('returns correct endpoint for a valid token', () => {
      const ep = service.createEndpoint('pipeline-2', 'Lookup Test');
      const found = service.lookupByToken(ep.token);
      expect(found).toBeDefined();
      expect(found?.id).toBe(ep.id);
    });

    it('returns undefined for unknown token', () => {
      const found = service.lookupByToken('nonexistent-token');
      expect(found).toBeUndefined();
    });
  });

  describe('verifySignature', () => {
    it('returns true for a valid HMAC signature', () => {
      const { createHmac } = require('crypto');
      const secret = 'test-secret';
      const body = JSON.stringify({ hello: 'world' });
      const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
      expect(service.verifySignature(secret, body, sig)).toBe(true);
    });

    it('returns false for a tampered body', () => {
      const { createHmac } = require('crypto');
      const secret = 'test-secret';
      const originalBody = JSON.stringify({ hello: 'world' });
      const tamperedBody = JSON.stringify({ hello: 'evil' });
      const sig = 'sha256=' + createHmac('sha256', secret).update(originalBody).digest('hex');
      expect(service.verifySignature(secret, tamperedBody, sig)).toBe(false);
    });

    it('returns false for an invalid signature format', () => {
      expect(service.verifySignature('secret', 'body', 'bad-sig')).toBe(false);
    });
  });

  describe('regenerateToken', () => {
    it('old token no longer resolves; new token does', () => {
      const ep = service.createEndpoint('p1', 'Regen Test');
      const oldToken = ep.token;

      const updated = service.regenerateToken(ep.id);

      expect(service.lookupByToken(oldToken)).toBeUndefined();
      expect(service.lookupByToken(updated.token)).toBeDefined();
      expect(updated.token).not.toBe(oldToken);
    });
  });

  describe('deleteEndpoint', () => {
    it('removes endpoint and its token from index', () => {
      const ep = service.createEndpoint('p1', 'Delete Test');
      const { token } = ep;

      service.deleteEndpoint(ep.id);

      expect(service.getEndpoint(ep.id)).toBeUndefined();
      expect(service.lookupByToken(token)).toBeUndefined();
    });
  });

  describe('logDelivery / getDeliveries', () => {
    it('records delivery and increments endpoint delivery count', () => {
      const ep = service.createEndpoint('p1', 'Log Test');
      service.logDelivery(ep.id, {
        webhookId: ep.id,
        receivedAt: new Date().toISOString(),
        payloadBytes: 128,
        status: 'QUEUED',
        orchestrationStatus: 'QUEUED',
        processingMs: 12,
      });

      const updated = service.getEndpoint(ep.id);
      expect(updated?.deliveryCount).toBe(1);

      const { items, total } = service.getDeliveries(ep.id, 1, 10);
      expect(total).toBe(1);
      expect(items[0].status).toBe('QUEUED');
    });
  });
});
