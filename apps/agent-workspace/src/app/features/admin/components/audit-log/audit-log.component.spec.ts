import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuditLogComponent } from './audit-log.component';
import { AuditLogResponse } from '@nexus-queue/shared-models';

const mockResponse: AuditLogResponse = {
  events: [
    {
      id: 'evt-1',
      eventType: 'task.queued',
      aggregateId: 'task-abc123',
      aggregateType: 'task',
      payload: { queueId: 'q-sales' },
      occurredAt: new Date('2024-01-01T10:00:00Z'),
      sequenceNum: 1,
    },
    {
      id: 'evt-2',
      eventType: 'task.assigned',
      aggregateId: 'task-abc123',
      aggregateType: 'task',
      payload: { agentId: 'agent-007' },
      occurredAt: new Date('2024-01-01T10:01:00Z'),
      sequenceNum: 2,
    },
  ],
  total: 2,
  page: 1,
  limit: 50,
};

const emptyResponse: AuditLogResponse = {
  events: [],
  total: 0,
  page: 1,
  limit: 50,
};

describe('AuditLogComponent', () => {
  let component: AuditLogComponent;
  let fixture: ComponentFixture<AuditLogComponent>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuditLogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditLogComponent);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function initAndFlush(response: AuditLogResponse = mockResponse): void {
    fixture.detectChanges(); // triggers ngOnInit -> loadEvents -> HTTP
    httpTesting
      .expectOne((r) => r.url.includes('/audit-log'))
      .flush(response);
    fixture.detectChanges();
  }

  it('should create', () => {
    initAndFlush();
    expect(component).toBeTruthy();
  });

  it('should load events on init', () => {
    initAndFlush();
    expect(component.events().length).toBe(2);
    expect(component.totalEvents()).toBe(2);
    expect(component.loading()).toBe(false);
  });

  it('should render event rows in the table', () => {
    initAndFlush();
    const rows = fixture.nativeElement.querySelectorAll('tr.event-row');
    expect(rows.length).toBe(2);
  });

  it('should show empty state when no events match', () => {
    initAndFlush(emptyResponse);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-state')).toBeTruthy();
    expect(compiled.querySelector('.events-table-wrapper')).toBeFalsy();
  });

  it('should show error state on HTTP failure', () => {
    fixture.detectChanges();
    httpTesting
      .expectOne((r) => r.url.includes('/audit-log'))
      .error(new ProgressEvent('network-error'));
    fixture.detectChanges();

    expect(component.error()).toBeTruthy();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.error-state')).toBeTruthy();
  });

  it('should reset to page 1 when applying filters', () => {
    initAndFlush();

    component.currentPage.set(5);
    component.applyFilters();

    httpTesting
      .expectOne((r) => r.url.includes('/audit-log'))
      .flush(mockResponse);

    expect(component.currentPage()).toBe(1);
  });

  it('should reset all filters and page on clearFilters', () => {
    initAndFlush();

    component.filterAggregateType.set('task');
    component.filterEventType.set('task.queued');
    component.currentPage.set(3);
    component.clearFilters();

    httpTesting
      .expectOne((r) => r.url.includes('/audit-log'))
      .flush(emptyResponse);

    expect(component.filterAggregateType()).toBe('');
    expect(component.filterEventType()).toBe('');
    expect(component.currentPage()).toBe(1);
  });

  it('should toggle payload expansion for a row', () => {
    initAndFlush();

    expect(component.isExpanded('evt-1')).toBe(false);
    component.togglePayload('evt-1');
    expect(component.isExpanded('evt-1')).toBe(true);
    component.togglePayload('evt-1');
    expect(component.isExpanded('evt-1')).toBe(false);
  });

  it('should expand different rows independently', () => {
    initAndFlush();

    component.togglePayload('evt-1');
    component.togglePayload('evt-2');

    expect(component.isExpanded('evt-1')).toBe(true);
    expect(component.isExpanded('evt-2')).toBe(true);

    component.togglePayload('evt-1');
    expect(component.isExpanded('evt-1')).toBe(false);
    expect(component.isExpanded('evt-2')).toBe(true);
  });

  it('hasPrevPage should be false on page 1', () => {
    initAndFlush();
    expect(component.hasPrevPage).toBe(false);
  });

  it('hasNextPage should be false when all events fit on one page', () => {
    initAndFlush(); // total=2, limit=50 → fits on one page
    expect(component.hasNextPage).toBe(false);
  });

  it('hasNextPage should be true when more pages exist', () => {
    const manyEvents: AuditLogResponse = { ...mockResponse, total: 200 };
    initAndFlush(manyEvents);
    expect(component.hasNextPage).toBe(true);
  });

  it('should compute correct startIndex and endIndex', () => {
    initAndFlush(); // page=1, limit=50, total=2
    expect(component.startIndex).toBe(1);
    expect(component.endIndex).toBe(2);
  });

  it('formatPayload should return indented JSON string', () => {
    initAndFlush();
    const result = component.formatPayload({ key: 'value', num: 42 });
    expect(result).toContain('"key"');
    expect(result).toContain('"value"');
  });
});
