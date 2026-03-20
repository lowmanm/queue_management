import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { PipelineApiService } from './pipeline.service';
import { Pipeline, PipelineBundle, PipelineImportResult } from '@nexus-queue/shared-models';

const mockBundle: PipelineBundle = {
  exportVersion: '1',
  exportedAt: '2026-01-01T00:00:00Z',
  pipeline: { name: 'Test Pipeline', workTypes: ['GENERAL'], dataSchema: [] },
  queues: [{ name: 'Main Queue', priority: 1, requiredSkills: [] }],
  routingRules: [],
  ruleSets: [],
};

const mockPipeline: Pipeline = {
  id: 'p-new',
  name: 'Test Pipeline (Copy)',
  enabled: false,
  allowedWorkTypes: [],
  defaults: { priority: 5, reservationTimeoutSeconds: 30, autoAccept: false },
  routingRules: [],
  defaultRouting: { behavior: 'route_to_queue' },
  stats: { totalTasksProcessed: 0, tasksInQueue: 0, tasksActive: 0, avgHandleTime: 0, avgQueueWaitTime: 0, currentServiceLevel: 100, lastUpdated: '' },
  createdAt: '',
  updatedAt: '',
};

describe('PipelineApiService — portability', () => {
  let service: PipelineApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PipelineApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PipelineApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('exportPipeline: calls GET /pipelines/:id/export', () => {
    service.exportPipeline('p-1').subscribe((bundle) => {
      expect(bundle).toEqual(mockBundle);
    });

    const req = httpTesting.expectOne((r) => r.url.includes('/pipelines/p-1/export') && r.method === 'GET');
    req.flush(mockBundle);
  });

  it('importPipeline: calls POST /pipelines/import with bundle body', () => {
    const importResult: PipelineImportResult = { success: true, pipelineId: 'p-new' };

    service.importPipeline(mockBundle).subscribe((result) => {
      expect(result).toEqual(importResult);
    });

    const req = httpTesting.expectOne((r) => r.url.includes('/pipelines/import') && r.method === 'POST');
    expect(req.request.body).toEqual(mockBundle);
    req.flush(importResult);
  });

  it('clonePipeline: calls POST /pipelines/:id/clone', () => {
    service.clonePipeline('p-1').subscribe((pipeline) => {
      expect(pipeline).toEqual(mockPipeline);
    });

    const req = httpTesting.expectOne((r) => r.url.includes('/pipelines/p-1/clone') && r.method === 'POST');
    req.flush(mockPipeline);
  });
});
