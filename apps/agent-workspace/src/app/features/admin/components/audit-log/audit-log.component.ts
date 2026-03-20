import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import {
  AuditLogResponse,
  AuditEvent,
  AuditEventType,
} from '@nexus-queue/shared-models';
import { environment } from '../../../../../environments/environment';

/**
 * AuditLogComponent — admin-only view of the domain event store.
 *
 * Displays a paginated, filterable timeline of all task and agent
 * lifecycle events emitted across the platform.
 *
 * Route: /admin/audit-log (adminGuard)
 */
@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly destroy$ = new Subject<void>();

  /** Filter state */
  filterAggregateType = signal<string>('');
  filterEventType = signal<string>('');
  filterAggregateId = signal<string>('');
  filterStartDate = signal<string>('');
  filterEndDate = signal<string>('');

  /** Pagination */
  currentPage = signal(1);
  readonly pageLimit = signal(50);

  /** Results */
  events = signal<AuditEvent[]>([]);
  totalEvents = signal(0);
  loading = signal(false);
  error = signal<string | null>(null);

  /** Rows with expanded payload JSON */
  expandedRows = signal<Set<string>>(new Set());

  /** Replay state */
  replayingAggregateId = signal<string | null>(null);
  replayData = signal<{ events: AuditEvent[]; reconstructedState: Record<string, unknown> } | null>(null);
  replayError = signal('');
  isReplaying = signal(false);

  readonly eventTypes: AuditEventType[] = [
    'task.ingested',
    'task.queued',
    'task.assigned',
    'task.accepted',
    'task.rejected',
    'task.completed',
    'task.dlq',
    'task.retried',
    'agent.state_changed',
    'sla.warning',
    'sla.breach',
  ];

  ngOnInit(): void {
    this.loadEvents();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadEvents(): void {
    this.loading.set(true);
    this.error.set(null);

    let params = new HttpParams()
      .set('page', String(this.currentPage()))
      .set('limit', String(this.pageLimit()));

    if (this.filterAggregateType()) {
      params = params.set('aggregateType', this.filterAggregateType());
    }
    if (this.filterEventType()) {
      params = params.set('eventType', this.filterEventType());
    }
    if (this.filterAggregateId()) {
      params = params.set('aggregateId', this.filterAggregateId());
    }
    if (this.filterStartDate()) {
      params = params.set('startDate', this.filterStartDate());
    }
    if (this.filterEndDate()) {
      params = params.set('endDate', this.filterEndDate());
    }

    this.http
      .get<AuditLogResponse>(`${environment.apiUrl}/audit-log`, { params })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.events.set(response.events);
          this.totalEvents.set(response.total);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load audit events. Please try again.');
          this.loading.set(false);
        },
      });
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadEvents();
  }

  clearFilters(): void {
    this.filterAggregateType.set('');
    this.filterEventType.set('');
    this.filterAggregateId.set('');
    this.filterStartDate.set('');
    this.filterEndDate.set('');
    this.currentPage.set(1);
    this.loadEvents();
  }

  nextPage(): void {
    if (this.hasNextPage) {
      this.currentPage.update((p) => p + 1);
      this.loadEvents();
    }
  }

  prevPage(): void {
    if (this.hasPrevPage) {
      this.currentPage.update((p) => p - 1);
      this.loadEvents();
    }
  }

  togglePayload(eventId: string): void {
    this.expandedRows.update((rows) => {
      const next = new Set(rows);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }

  isExpanded(eventId: string): boolean {
    return this.expandedRows().has(eventId);
  }

  formatPayload(payload: Record<string, unknown>): string {
    return JSON.stringify(payload, null, 2);
  }

  get startIndex(): number {
    return (this.currentPage() - 1) * this.pageLimit() + 1;
  }

  get endIndex(): number {
    return Math.min(
      this.currentPage() * this.pageLimit(),
      this.totalEvents(),
    );
  }

  get hasPrevPage(): boolean {
    return this.currentPage() > 1;
  }

  get hasNextPage(): boolean {
    return this.currentPage() * this.pageLimit() < this.totalEvents();
  }

  // ============================================================
  // REPLAY
  // ============================================================

  startReplay(aggregateId: string): void {
    this.replayingAggregateId.set(aggregateId);
    this.replayData.set(null);
    this.replayError.set('');
    this.isReplaying.set(true);

    this.http
      .get<{ events: AuditEvent[]; reconstructedState: Record<string, unknown> }>(
        `${environment.apiUrl}/audit-log/replay/${aggregateId}`,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.replayData.set(data);
          this.isReplaying.set(false);
        },
        error: () => {
          this.replayError.set('Failed to load replay data. Please try again.');
          this.isReplaying.set(false);
        },
      });
  }

  closeReplay(): void {
    this.replayingAggregateId.set(null);
    this.replayData.set(null);
    this.replayError.set('');
    this.isReplaying.set(false);
  }

  formatState(state: Record<string, unknown>): string {
    return JSON.stringify(state, null, 2);
  }

  /** Returns unique task aggregate IDs from the current event list (task aggregates only) */
  get taskAggregates(): string[] {
    const seen = new Set<string>();
    return this.events()
      .filter((e) => e.aggregateType === 'task')
      .map((e) => e.aggregateId)
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  }
}
