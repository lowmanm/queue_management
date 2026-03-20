import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { PipelinePortabilityComponent } from './pipeline-portability.component';
import { PipelineApiService } from '../../services/pipeline.service';
import { Pipeline, PipelineBundle, PipelineImportResult } from '@nexus-queue/shared-models';

const mockBundle: PipelineBundle = {
  exportVersion: '1',
  exportedAt: '2026-01-01T00:00:00Z',
  pipeline: { name: 'My Pipeline', workTypes: [], dataSchema: [] },
  queues: [],
  routingRules: [],
  ruleSets: [],
};

const mockClonedPipeline: Pipeline = {
  id: 'p-clone',
  name: 'My Pipeline (Copy)',
  enabled: false,
  allowedWorkTypes: [],
  defaults: { priority: 5, reservationTimeoutSeconds: 30, autoAccept: false },
  routingRules: [],
  defaultRouting: { behavior: 'route_to_queue' },
  stats: { totalTasksProcessed: 0, tasksInQueue: 0, tasksActive: 0, avgHandleTime: 0, avgQueueWaitTime: 0, currentServiceLevel: 100, lastUpdated: '' },
  createdAt: '',
  updatedAt: '',
};

const mockPipelineService = {
  exportPipeline: vi.fn(),
  importPipeline: vi.fn(),
  clonePipeline: vi.fn(),
  downloadBundle: vi.fn(),
};

describe('PipelinePortabilityComponent', () => {
  let component: PipelinePortabilityComponent;
  let fixture: ComponentFixture<PipelinePortabilityComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [PipelinePortabilityComponent],
      providers: [
        provideHttpClient(),
        { provide: PipelineApiService, useValue: mockPipelineService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PipelinePortabilityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('startExport: calls exportPipeline and downloadBundle', () => {
    mockPipelineService.exportPipeline.mockReturnValue(of(mockBundle));
    mockPipelineService.downloadBundle.mockImplementation(() => undefined);

    fixture.componentRef.setInput('pipelineId', 'p-1');
    fixture.componentRef.setInput('pipelineName', 'My Pipeline');
    fixture.detectChanges();

    component.startExport();

    expect(mockPipelineService.exportPipeline).toHaveBeenCalledWith('p-1');
    expect(mockPipelineService.downloadBundle).toHaveBeenCalledWith(mockBundle, 'My Pipeline');
    expect(component.exportSuccess()).toBe(true);
  });

  it('startClone: calls clonePipeline and emits cloned output', () => {
    mockPipelineService.clonePipeline.mockReturnValue(of(mockClonedPipeline));

    fixture.componentRef.setInput('pipelineId', 'p-1');
    fixture.detectChanges();

    const clonedValues: Pipeline[] = [];
    component.cloned.subscribe((p) => clonedValues.push(p));

    component.startClone();

    expect(mockPipelineService.clonePipeline).toHaveBeenCalledWith('p-1');
    expect(clonedValues).toHaveLength(1);
    expect(clonedValues[0].name).toBe('My Pipeline (Copy)');
    expect(component.cloning()).toBe(false);
  });

  it('importBundle signal: setting bundle marks it as ready for import', () => {
    expect(component.importBundle()).toBeNull();
    component.importBundle.set(mockBundle);
    expect(component.importBundle()).toEqual(mockBundle);
    expect(component.parseError()).toBe('');
  });

  it('submitImport: service returns errors → importErrors signal is populated', () => {
    const failResult: PipelineImportResult = {
      success: false,
      errors: [{ field: 'pipeline.name', message: 'Name is required' }],
    };
    mockPipelineService.importPipeline.mockReturnValue(of(failResult));
    component.importBundle.set(mockBundle);

    component.submitImport();

    expect(component.importErrors()).toHaveLength(1);
    expect(component.importErrors()[0].field).toBe('pipeline.name');
    expect(component.importing()).toBe(false);
  });

  it('submitImport: service error sets generic error message', () => {
    mockPipelineService.importPipeline.mockReturnValue(throwError(() => new Error('Network error')));
    component.importBundle.set(mockBundle);

    component.submitImport();

    expect(component.importErrors()).toHaveLength(1);
    expect(component.importErrors()[0].field).toBe('request');
    expect(component.importing()).toBe(false);
  });
});
