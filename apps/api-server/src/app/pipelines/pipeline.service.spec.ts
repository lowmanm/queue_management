import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PipelineService } from './pipeline.service';
import { PipelineEntity } from '../entities/pipeline.entity';
import { PipelineQueueEntity } from '../entities/pipeline-queue.entity';
import { Pipeline, PipelineBundle, PipelineQueue } from '@nexus-queue/shared-models';

function makePipelineEntity(id: string, name: string, enabled = true): PipelineEntity {
  const e = new PipelineEntity();
  e.id = id;
  e.name = name;
  e.enabled = enabled;
  e.allowedWorkTypes = [];
  e.defaults = { priority: 5, reservationTimeoutSeconds: 30, autoAccept: false } as unknown as Record<string, unknown>;
  e.routingRules = [];
  e.defaultRouting = { behavior: 'route_to_queue', holdTimeoutSeconds: 300, holdTimeoutAction: 'reject' } as unknown as Record<string, unknown>;
  e.stats = { totalTasksProcessed: 0, tasksInQueue: 0, tasksActive: 0, avgHandleTime: 0, avgQueueWaitTime: 0, currentServiceLevel: 100, lastUpdated: new Date().toISOString() } as unknown as Record<string, unknown>;
  e.createdAt = new Date();
  e.updatedAt = new Date();
  return e;
}

function makeQueueEntity(id: string, pipelineId: string, name: string, priority = 1): PipelineQueueEntity {
  const e = new PipelineQueueEntity();
  e.id = id;
  e.pipelineId = pipelineId;
  e.name = name;
  e.enabled = true;
  e.priority = priority;
  e.maxCapacity = 0;
  e.requiredSkills = [];
  e.stats = { tasksWaiting: 0, tasksActive: 0, tasksCompletedToday: 0, avgWaitTime: 0, avgHandleTime: 0, longestWait: 0, availableAgents: 0, lastUpdated: new Date().toISOString() } as unknown as Record<string, unknown>;
  e.createdAt = new Date();
  e.updatedAt = new Date();
  return e;
}

describe('PipelineService — portability', () => {
  let service: PipelineService;
  let pipelineRepo: { find: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let queueRepo: { find: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const pipeline1 = makePipelineEntity('p-1', 'Alpha Pipeline');
    const queue1 = makeQueueEntity('q-1', 'p-1', 'Priority', 1);
    const queue2 = makeQueueEntity('q-2', 'p-1', 'Standard', 2);

    pipelineRepo = {
      find: vi.fn().mockResolvedValue([pipeline1]),
      save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    queueRepo = {
      find: vi.fn().mockResolvedValue([queue1, queue2]),
      save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineService,
        { provide: getRepositoryToken(PipelineEntity), useValue: pipelineRepo },
        { provide: getRepositoryToken(PipelineQueueEntity), useValue: queueRepo },
      ],
    }).compile();

    service = module.get<PipelineService>(PipelineService);
    await service.onModuleInit();
  });

  describe('exportPipeline', () => {
    it('returns null for unknown pipeline', () => {
      expect(service.exportPipeline('unknown')).toBeNull();
    });

    it('bundle contains correct queue names (not IDs)', () => {
      const bundle = service.exportPipeline('p-1');
      expect(bundle).not.toBeNull();
      expect(bundle!.exportVersion).toBe('1');
      expect(bundle!.pipeline.name).toBe('Alpha Pipeline');
      const queueNames = bundle!.queues.map((q) => q.name);
      expect(queueNames).toContain('Priority');
      expect(queueNames).toContain('Standard');
    });
  });

  describe('importPipeline', () => {
    it('valid bundle creates new pipeline and returns success with pipelineId', async () => {
      const bundle: PipelineBundle = {
        exportVersion: '1',
        exportedAt: new Date().toISOString(),
        pipeline: { name: 'Imported Pipeline', workTypes: [], dataSchema: [] },
        queues: [{ name: 'Imported Q', priority: 1, requiredSkills: [] }],
        routingRules: [],
        ruleSets: [],
      };

      const result = await service.importPipeline(bundle);
      expect(result.success).toBe(true);
      expect(result.pipelineId).toBeTruthy();
      expect(pipelineRepo.save).toHaveBeenCalled();
    });

    it('missing pipeline name returns validation error', async () => {
      const bundle = {
        exportVersion: '1',
        exportedAt: new Date().toISOString(),
        pipeline: { name: '', workTypes: [], dataSchema: [] },
        queues: [],
        routingRules: [],
        ruleSets: [],
      } as unknown as PipelineBundle;

      const result = await service.importPipeline(bundle);
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'pipeline.name' })]),
      );
    });
  });

  describe('clonePipeline', () => {
    it('returns error for unknown pipeline', async () => {
      const result = await service.clonePipeline('unknown');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('cloned pipeline has "(Copy)" suffix and is inactive', async () => {
      const result = await service.clonePipeline('p-1');
      expect(result.success).toBe(true);
      expect(result.pipeline!.name).toBe('Alpha Pipeline (Copy)');
      expect(result.pipeline!.enabled).toBe(false);
      expect(result.pipeline!.id).not.toBe('p-1');
    });
  });
});
