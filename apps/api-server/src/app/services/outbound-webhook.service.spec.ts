import { Test, TestingModule } from '@nestjs/testing';
import { OutboundWebhookService } from './outbound-webhook.service';
import { EventStoreService } from './event-store.service';
import { PipelineService } from '../pipelines/pipeline.service';
import { AuditEvent, Pipeline } from '@nexus-queue/shared-models';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'ev-1',
    eventType: 'task.completed',
    aggregateId: 'task-1',
    aggregateType: 'task',
    payload: {},
    occurredAt: new Date(),
    pipelineId: 'pipe-1',
    sequenceNum: 1,
    ...overrides,
  };
}

function makePipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    id: 'pipe-1',
    name: 'Test Pipeline',
    enabled: true,
    allowedWorkTypes: [],
    defaults: { priority: 5, reservationTimeoutSeconds: 30, autoAccept: false },
    routingRules: [],
    defaultRouting: { behavior: 'reject' },
    stats: {
      totalTasksProcessed: 0,
      tasksInQueue: 0,
      tasksActive: 0,
      avgHandleTime: 0,
      avgQueueWaitTime: 0,
      currentServiceLevel: 100,
      lastUpdated: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    callbackUrl: 'https://example.com/callback',
    callbackEvents: ['task.completed'],
    ...overrides,
  };
}

describe('OutboundWebhookService', () => {
  let service: OutboundWebhookService;
  let pipelineService: { getPipelineById: ReturnType<typeof vi.fn> };
  let eventStore: { emit: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    pipelineService = { getPipelineById: vi.fn() };
    eventStore = { emit: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboundWebhookService,
        { provide: PipelineService, useValue: pipelineService },
        { provide: EventStoreService, useValue: eventStore },
      ],
    }).compile();

    service = module.get<OutboundWebhookService>(OutboundWebhookService);
    vi.clearAllMocks();
  });

  describe('onEvent', () => {
    it('POSTs to callbackUrl when pipeline has matching callbackEvent', async () => {
      pipelineService.getPipelineById.mockReturnValue(makePipeline());
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 200 });

      await service.onEvent(makeEvent());

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const [url, payload] = (mockedAxios.post as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('https://example.com/callback');
      expect(payload.taskId).toBe('task-1');
      expect(payload.eventType).toBe('task.completed');
    });

    it('does not POST when pipeline has no callbackUrl', async () => {
      pipelineService.getPipelineById.mockReturnValue(makePipeline({ callbackUrl: undefined }));

      await service.onEvent(makeEvent());

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('does not POST when pipeline is not subscribed to the event type', async () => {
      pipelineService.getPipelineById.mockReturnValue(
        makePipeline({ callbackEvents: ['task.dlq'] })
      );

      await service.onEvent(makeEvent({ eventType: 'task.completed' }));

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('appends outbound.webhook.failed after all retries exhausted', async () => {
      pipelineService.getPipelineById.mockReturnValue(makePipeline());
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('connection refused'));

      // Override sleep to 0ms so tests run fast
      vi.spyOn(service as never, 'sleep').mockResolvedValue(undefined);

      await service.onEvent(makeEvent());

      expect(eventStore.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'outbound.webhook.failed' })
      );
    });

    it('appends outbound.webhook.sent on first successful delivery', async () => {
      pipelineService.getPipelineById.mockReturnValue(makePipeline());
      (mockedAxios.post as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 200 });

      await service.onEvent(makeEvent());

      expect(eventStore.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'outbound.webhook.sent' })
      );
    });

    it('skips non-task aggregate events (e.g. agent events)', async () => {
      await service.onEvent(makeEvent({ aggregateType: 'agent', eventType: 'agent.state_changed' }));

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });
});
