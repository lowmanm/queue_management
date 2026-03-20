import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { WebhooksController, WebhookThrottlerGuard } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';
import { WebhookEndpoint } from '@nexus-queue/shared-models';

function makeMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    ip: '127.0.0.1',
    headers: {},
    ...overrides,
  };
}

function makeEndpoint(overrides: Partial<WebhookEndpoint> = {}): WebhookEndpoint {
  return {
    id: 'ep-1',
    name: 'Test',
    pipelineId: 'pipe-1',
    token: 'valid-token',
    secret: 'secret',
    status: 'active',
    createdAt: new Date().toISOString(),
    deliveryCount: 0,
    ...overrides,
  };
}

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let webhooksService: WebhooksService;
  let orchestrator: Partial<PipelineOrchestratorService>;

  beforeEach(async () => {
    orchestrator = {
      ingestTask: vi.fn().mockResolvedValue({
        success: true,
        status: 'QUEUED',
        taskId: 'task-123',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [WebhooksController],
      providers: [
        WebhooksService,
        WebhookThrottlerGuard,
        { provide: PipelineOrchestratorService, useValue: orchestrator },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
    webhooksService = module.get<WebhooksService>(WebhooksService);
  });

  describe('receive — POST /webhooks/:token', () => {
    it('returns 202 + QUEUED for a valid token and body', async () => {
      const ep = webhooksService.createEndpoint('pipe-1', 'Test');
      const req = makeMockRequest();

      const result = await controller.receive(
        ep.token,
        { title: 'My Task', workType: 'ORDERS' },
        req as never,
      );

      expect(result).toEqual({ accepted: true, taskId: 'task-123', status: 'QUEUED' });
    });

    it('throws 403 for an unknown token', async () => {
      const req = makeMockRequest();
      await expect(
        controller.receive('unknown-token', {}, req as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws 403 for an inactive endpoint', async () => {
      const ep = webhooksService.createEndpoint('pipe-1', 'Test');
      webhooksService.toggleStatus(ep.id, 'inactive');
      const req = makeMockRequest();
      await expect(
        controller.receive(ep.token, {}, req as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws 400 for an invalid HMAC signature', async () => {
      const ep = webhooksService.createEndpoint('pipe-1', 'Test');
      const req = makeMockRequest({
        headers: { 'x-nexus-signature': 'sha256=invalid' },
      });
      await expect(
        controller.receive(ep.token, { title: 'Task' }, req as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts body with no signature header (signature optional)', async () => {
      const ep = webhooksService.createEndpoint('pipe-1', 'Test');
      const req = makeMockRequest();

      const result = await controller.receive(ep.token, { title: 'Task' }, req as never);
      expect(result.accepted).toBe(true);
    });

    it('returns accepted:false with DUPLICATE status from orchestrator', async () => {
      (orchestrator.ingestTask as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        status: 'DUPLICATE',
      });

      const ep = webhooksService.createEndpoint('pipe-1', 'Test');
      const req = makeMockRequest();

      const result = await controller.receive(ep.token, { title: 'Task' }, req as never);
      expect(result).toEqual({ accepted: false, status: 'DUPLICATE' });
    });
  });
});
