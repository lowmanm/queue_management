import { Test, TestingModule } from '@nestjs/testing';
import { PipelineOrchestratorService, TaskIngestionInput } from './pipeline-orchestrator.service';
import { TaskStoreService } from './task-store.service';
import { QueueManagerService } from './queue-manager.service';
import { RuleEngineService } from './rule-engine.service';
import { PipelineService } from '../pipelines/pipeline.service';
import { EventStoreService } from './event-store.service';
import { Pipeline, Task } from '@nexus-queue/shared-models';

function makePipeline(id: string, overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    id,
    name: `Pipeline ${id}`,
    enabled: true,
    allowedWorkTypes: [],
    defaults: { priority: 5, reservationTimeoutSeconds: 30, autoAccept: false },
    routingRules: [],
    defaultRouting: { behavior: 'route_to_queue', defaultQueueId: 'q-default' },
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
    ...overrides,
  };
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    workType: 'GENERAL',
    title: 'Test Task',
    payloadUrl: '',
    priority: 5,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    pipelineHops: 0,
    metadata: {},
    ...overrides,
  };
}

function makeInput(pipelineId: string, overrides: Partial<TaskIngestionInput> = {}): TaskIngestionInput {
  return {
    pipelineId,
    taskData: {
      externalId: 'ext-1',
      workType: 'GENERAL',
      title: 'Test Task',
      priority: 5,
      payloadUrl: '',
      metadata: {},
    },
    source: 'api',
    ...overrides,
  };
}

describe('PipelineOrchestratorService — cross-pipeline routing', () => {
  let service: PipelineOrchestratorService;
  let taskStore: { [key: string]: ReturnType<typeof vi.fn> };
  let queueManager: { [key: string]: ReturnType<typeof vi.fn> };
  let ruleEngine: { evaluateTask: ReturnType<typeof vi.fn> };
  let pipelineService: { getPipelineById: ReturnType<typeof vi.fn>; routeTask: ReturnType<typeof vi.fn> };
  let eventStore: { emit: ReturnType<typeof vi.fn> };

  let pipelineMap: Map<string, Pipeline>;

  beforeEach(async () => {
    pipelineMap = new Map();

    taskStore = {
      generateTaskId: vi.fn().mockReturnValue('task-new'),
      create: vi.fn().mockImplementation((t: Task) => Promise.resolve(t)),
      update: vi.fn().mockImplementation((id: string, t: Task) => Promise.resolve(t)),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      hasExternalId: vi.fn().mockResolvedValue(false),
    };

    queueManager = {
      enqueue: vi.fn().mockResolvedValue({}),
      moveToDLQ: vi.fn().mockResolvedValue(undefined),
    };

    ruleEngine = {
      evaluateTask: vi.fn().mockImplementation((task: Task) => ({
        task,
        results: [],
      })),
    };

    pipelineService = {
      getPipelineById: vi.fn().mockImplementation((id: string) => pipelineMap.get(id)),
      routeTask: vi.fn().mockReturnValue({ queueId: 'q-default' }),
    };

    eventStore = { emit: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineOrchestratorService,
        { provide: TaskStoreService, useValue: taskStore },
        { provide: QueueManagerService, useValue: queueManager },
        { provide: RuleEngineService, useValue: ruleEngine },
        { provide: PipelineService, useValue: pipelineService },
        { provide: EventStoreService, useValue: eventStore },
      ],
    }).compile();

    service = module.get<PipelineOrchestratorService>(PipelineOrchestratorService);
  });

  describe('cross-pipeline routing', () => {
    it('re-ingests task into target pipeline when a cross-pipeline rule matches', async () => {
      const pipelineA = makePipeline('pipe-a');
      const pipelineB = makePipeline('pipe-b');
      pipelineMap.set('pipe-a', pipelineA);
      pipelineMap.set('pipe-b', pipelineB);

      pipelineService.routeTask
        .mockReturnValueOnce({ queueId: null, targetPipelineId: 'pipe-b', ruleId: 'r1', ruleName: 'Transfer' })
        .mockReturnValueOnce({ queueId: 'q-b' });

      const result = await service.ingestTask(makeInput('pipe-a'));

      expect(result.success).toBe(true);
      expect(result.status).toBe('QUEUED');
      expect(pipelineService.routeTask).toHaveBeenCalledTimes(2);
      expect(eventStore.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'task.pipeline_transferred' })
      );
    });

    it('sends task to DLQ with hop_limit_exceeded when hops reach MAX_PIPELINE_HOPS (3)', async () => {
      const pipelineA = makePipeline('pipe-a');
      const pipelineB = makePipeline('pipe-b');
      pipelineMap.set('pipe-a', pipelineA);
      pipelineMap.set('pipe-b', pipelineB);

      // Task already has 2 hops — one more brings it to 3 (= MAX_PIPELINE_HOPS)
      const existingTask = makeTask('task-hop', { pipelineHops: 2 });
      taskStore.create.mockResolvedValue(existingTask);

      pipelineService.routeTask.mockReturnValue({
        queueId: null,
        targetPipelineId: 'pipe-b',
        ruleId: 'r1',
        ruleName: 'Transfer',
      });

      const result = await service.ingestTask(makeInput('pipe-a'));

      expect(result.status).toBe('DLQ');
      expect(queueManager.moveToDLQ).toHaveBeenCalledWith(
        expect.anything(),
        'hop_limit_exceeded'
      );
      expect(eventStore.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'task.dlq' })
      );
    });

    it('normal rule with targetQueueId still routes to queue', async () => {
      const pipelineA = makePipeline('pipe-a');
      pipelineMap.set('pipe-a', pipelineA);

      pipelineService.routeTask.mockReturnValue({ queueId: 'q-target', ruleId: 'r1', ruleName: 'To Queue' });

      const result = await service.ingestTask(makeInput('pipe-a'));

      expect(result.success).toBe(true);
      expect(result.status).toBe('QUEUED');
      expect(result.queueId).toBe('q-target');
      expect(queueManager.enqueue).toHaveBeenCalledWith('q-target', expect.anything());
    });
  });
});
