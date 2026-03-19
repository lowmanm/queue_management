import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { PipelineStatusDashboardComponent } from './pipeline-status.component';
import { SocketService } from '../../../../core/services/socket.service';
import { PipelineApiService } from '../../../admin/services/pipeline.service';
import { PipelineMetricsSummary } from '@nexus-queue/shared-models';

const mockSummary: PipelineMetricsSummary = {
  pipelines: [
    {
      pipelineId: 'p1',
      pipelineName: 'Credit Cards',
      status: 'active',
      tasksIngested: 1240,
      tasksCompleted: 1198,
      tasksInQueue: 42,
      tasksFailed: 8,
      slaCompliancePercent: 96.5,
      avgHandleTimeMs: 120000,
      errorRatePercent: 0.6,
      lastUpdated: new Date().toISOString(),
    },
    {
      pipelineId: 'p2',
      pipelineName: 'Loans',
      status: 'inactive',
      tasksIngested: 430,
      tasksCompleted: 410,
      tasksInQueue: 20,
      tasksFailed: 6,
      slaCompliancePercent: 78,
      avgHandleTimeMs: 90000,
      errorRatePercent: 6.5,
      lastUpdated: new Date().toISOString(),
    },
  ],
  totalIngested: 1670,
  totalCompleted: 1608,
  totalInQueue: 62,
  totalFailed: 14,
  lastUpdated: new Date().toISOString(),
};

const metricsSubject = new Subject<PipelineMetricsSummary | null>();

const mockSocketService = {
  pipelineMetrics$: metricsSubject.asObservable(),
};

const mockPipelineApi = {
  getAllPipelineMetrics: () => of(mockSummary),
};

describe('PipelineStatusDashboardComponent', () => {
  let component: PipelineStatusDashboardComponent;
  let fixture: ComponentFixture<PipelineStatusDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PipelineStatusDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: SocketService, useValue: mockSocketService },
        { provide: PipelineApiService, useValue: mockPipelineApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PipelineStatusDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load metrics from HTTP on init', () => {
    expect(component.metrics$.value).toEqual(mockSummary);
  });

  it('should set lastUpdated on load', () => {
    expect(component.lastUpdated$.value).toBeTruthy();
  });

  it('should render pipeline cards for each pipeline', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Credit Cards');
    expect(compiled.textContent).toContain('Loans');
  });

  it('should compute active count correctly', () => {
    expect(component.activeCount).toBe(1);
  });

  it('should compute inactive count correctly', () => {
    expect(component.inactiveCount).toBe(1);
  });

  it('should compute error count correctly', () => {
    expect(component.errorCount).toBe(0);
  });

  it('should compute overall SLA compliance from active pipelines only', () => {
    // Only Credit Cards (active) has slaCompliancePercent=96.5
    expect(component.overallSlaCompliance).toBe(97);
  });

  it('should return sla-good class for >= 95%', () => {
    expect(component.getSlaClass(96)).toBe('sla-good');
  });

  it('should return sla-warning class for 80-94%', () => {
    expect(component.getSlaClass(85)).toBe('sla-warning');
  });

  it('should return sla-critical class for < 80%', () => {
    expect(component.getSlaClass(78)).toBe('sla-critical');
  });

  it('should update metrics on WebSocket emission', () => {
    const updatedSummary: PipelineMetricsSummary = { ...mockSummary, totalFailed: 20 };
    metricsSubject.next(updatedSummary);
    expect(component.metrics$.value?.totalFailed).toBe(20);
    expect(component.lastUpdated$.value).toBeTruthy();
  });

  it('should not update metrics when WebSocket emits null', () => {
    const before = component.metrics$.value;
    metricsSubject.next(null);
    expect(component.metrics$.value).toEqual(before);
  });
});
