import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { DlqMonitorComponent } from './dlq-monitor.component';
import { DlqApiService, DlqStats } from '../../services/dlq-api.service';
import { PipelineApiService } from '../../../admin/services/pipeline.service';
import { DLQEntry } from '@nexus-queue/shared-models';

const mockEntry: DLQEntry = {
  taskId: 'task-001',
  task: {
    id: 'task-001',
    workType: 'ORDERS',
    title: 'Test Task',
    payloadUrl: 'http://example.com',
    priority: 5,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  },
  queueId: 'queue-001',
  pipelineId: 'pipeline-001',
  reason: 'routing_failed',
  movedAt: new Date().toISOString(),
  retryCount: 2,
};

const mockStats: DlqStats = {
  total: 3,
  byReason: { routing_failed: 2, sla_expired: 1 },
  byQueue: { 'queue-001': 3 },
  byPipeline: { 'pipeline-001': 3 },
};

const mockDlqApi = {
  getDlqTasks: vi.fn().mockReturnValue(of([mockEntry])),
  getDlqStats: vi.fn().mockReturnValue(of(mockStats)),
  retryTask: vi.fn().mockReturnValue(of(undefined)),
  rerouteTask: vi.fn().mockReturnValue(of(undefined)),
  discardTask: vi.fn().mockReturnValue(of(undefined)),
};

const mockPipelineApi = {
  getAllPipelines: vi.fn().mockReturnValue(of([])),
  getAllQueues: vi.fn().mockReturnValue(of([])),
};

describe('DlqMonitorComponent', () => {
  let component: DlqMonitorComponent;
  let fixture: ComponentFixture<DlqMonitorComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDlqApi.getDlqTasks.mockReturnValue(of([mockEntry]));
    mockDlqApi.getDlqStats.mockReturnValue(of(mockStats));

    await TestBed.configureTestingModule({
      imports: [DlqMonitorComponent],
      providers: [
        provideRouter([]),
        { provide: DlqApiService, useValue: mockDlqApi },
        { provide: PipelineApiService, useValue: mockPipelineApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DlqMonitorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load DLQ entries on init', () => {
    expect(mockDlqApi.getDlqTasks).toHaveBeenCalled();
    expect(component.dlqEntries$.value).toHaveLength(1);
    expect(component.dlqEntries$.value[0].taskId).toBe('task-001');
  });

  it('should load stats on init', () => {
    expect(mockDlqApi.getDlqStats).toHaveBeenCalled();
    expect(component.dlqStats$.value?.total).toBe(3);
  });

  it('should render stats bar with total count', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('3');
  });

  it('should reload entries on filter change', () => {
    component.onFilterChange({ pipelineId: 'pipeline-001' });
    expect(mockDlqApi.getDlqTasks).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineId: 'pipeline-001' })
    );
  });

  it('should toggle row expansion', () => {
    expect(component.isExpanded('task-001')).toBe(false);
    component.toggleExpand('task-001');
    expect(component.isExpanded('task-001')).toBe(true);
    component.toggleExpand('task-001');
    expect(component.isExpanded('task-001')).toBe(false);
  });

  it('should toggle task selection', () => {
    expect(component.isSelected('task-001')).toBe(false);
    component.toggleSelect('task-001');
    expect(component.isSelected('task-001')).toBe(true);
  });

  it('should call retryTask and remove entry on success', () => {
    component.retryTask('task-001');
    expect(mockDlqApi.retryTask).toHaveBeenCalledWith('task-001');
    expect(component.dlqEntries$.value).toHaveLength(0);
  });

  it('should call discardTask when confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.discardTask('task-001');
    expect(mockDlqApi.discardTask).toHaveBeenCalledWith('task-001');
    expect(component.dlqEntries$.value).toHaveLength(0);
  });

  it('should return correct reason class', () => {
    expect(component.getReasonClass('routing_failed')).toBe('badge-error');
    expect(component.getReasonClass('sla_expired')).toBe('badge-warning');
    expect(component.getReasonClass('max_retries_exceeded')).toBe('badge-caution');
  });

  it('should toggle select all', () => {
    component.toggleSelectAll();
    expect(component.selectedTaskIds.size).toBe(1);
    component.toggleSelectAll();
    expect(component.selectedTaskIds.size).toBe(0);
  });
});
