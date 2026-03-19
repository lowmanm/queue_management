import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, BehaviorSubject } from 'rxjs';
import { DLQEntry, Pipeline, PipelineQueue } from '@nexus-queue/shared-models';
import { DlqApiService, DlqFilter, DlqStats } from '../../services/dlq-api.service';
import { PipelineApiService } from '../../../admin/services/pipeline.service';

@Component({
  selector: 'app-dlq-monitor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dlq-monitor.component.html',
  styleUrl: './dlq-monitor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DlqMonitorComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private dlqApi = inject(DlqApiService);
  private pipelineApi = inject(PipelineApiService);
  private router = inject(Router);

  dlqEntries$ = new BehaviorSubject<DLQEntry[]>([]);
  dlqStats$ = new BehaviorSubject<DlqStats | null>(null);
  filters$ = new BehaviorSubject<DlqFilter>({});
  pipelines$ = new BehaviorSubject<Pipeline[]>([]);
  queues$ = new BehaviorSubject<PipelineQueue[]>([]);
  isLoading = false;
  rerouteTaskId: string | null = null;
  rerouteTargetQueueId = '';
  expandedTaskIds = new Set<string>();
  selectedTaskIds = new Set<string>();
  bulkActionInProgress = false;

  readonly pageSize = 20;
  currentPage = 0;

  readonly reasonOptions = [
    { value: '', label: 'All Reasons' },
    { value: 'routing_failed', label: 'Routing Failed' },
    { value: 'sla_expired', label: 'SLA Expired' },
    { value: 'max_retries_exceeded', label: 'Max Retries Exceeded' },
  ];

  ngOnInit(): void {
    this.pipelineApi.getAllPipelines()
      .pipe(takeUntil(this.destroy$))
      .subscribe((pipelines) => this.pipelines$.next(pipelines));

    this.pipelineApi.getAllQueues()
      .pipe(takeUntil(this.destroy$))
      .subscribe((queues) => this.queues$.next(queues));

    this.filters$
      .pipe(takeUntil(this.destroy$))
      .subscribe((filters) => this.loadEntries(filters));

    this.loadStats();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadEntries(filters: DlqFilter): void {
    this.isLoading = true;
    const pagedFilters: DlqFilter = {
      ...filters,
      limit: this.pageSize,
      offset: this.currentPage * this.pageSize,
    };
    this.dlqApi
      .getDlqTasks(pagedFilters)
      .pipe(takeUntil(this.destroy$))
      .subscribe((entries) => {
        this.dlqEntries$.next(entries);
        this.isLoading = false;
      });
  }

  private loadStats(): void {
    this.dlqApi
      .getDlqStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe((stats) => this.dlqStats$.next(stats));
  }

  refresh(): void {
    this.loadEntries(this.filters$.value);
    this.loadStats();
  }

  onFilterChange(patch: Partial<DlqFilter>): void {
    this.currentPage = 0;
    this.selectedTaskIds.clear();
    this.filters$.next({ ...this.filters$.value, ...patch });
  }

  clearFilter(key: keyof DlqFilter): void {
    const current = { ...this.filters$.value };
    delete current[key];
    this.currentPage = 0;
    this.filters$.next(current);
  }

  nextPage(): void {
    this.currentPage++;
    this.loadEntries(this.filters$.value);
  }

  prevPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadEntries(this.filters$.value);
    }
  }

  toggleExpand(taskId: string): void {
    if (this.expandedTaskIds.has(taskId)) {
      this.expandedTaskIds.delete(taskId);
    } else {
      this.expandedTaskIds.add(taskId);
    }
  }

  isExpanded(taskId: string): boolean {
    return this.expandedTaskIds.has(taskId);
  }

  toggleSelect(taskId: string): void {
    if (this.selectedTaskIds.has(taskId)) {
      this.selectedTaskIds.delete(taskId);
    } else {
      this.selectedTaskIds.add(taskId);
    }
  }

  isSelected(taskId: string): boolean {
    return this.selectedTaskIds.has(taskId);
  }

  toggleSelectAll(): void {
    const entries = this.dlqEntries$.value;
    if (this.selectedTaskIds.size === entries.length) {
      this.selectedTaskIds.clear();
    } else {
      entries.forEach((e) => this.selectedTaskIds.add(e.taskId));
    }
  }

  get allSelected(): boolean {
    const entries = this.dlqEntries$.value;
    return entries.length > 0 && this.selectedTaskIds.size === entries.length;
  }

  retryTask(taskId: string): void {
    this.dlqApi
      .retryTask(taskId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const updated = this.dlqEntries$.value.filter((e) => e.taskId !== taskId);
        this.dlqEntries$.next(updated);
        this.selectedTaskIds.delete(taskId);
        this.loadStats();
      });
  }

  openReroute(taskId: string): void {
    this.rerouteTaskId = taskId;
    this.rerouteTargetQueueId = '';
  }

  confirmReroute(taskId: string): void {
    if (!this.rerouteTargetQueueId) return;
    this.dlqApi
      .rerouteTask(taskId, this.rerouteTargetQueueId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const updated = this.dlqEntries$.value.filter((e) => e.taskId !== taskId);
        this.dlqEntries$.next(updated);
        this.rerouteTaskId = null;
        this.rerouteTargetQueueId = '';
        this.loadStats();
      });
  }

  cancelReroute(): void {
    this.rerouteTaskId = null;
    this.rerouteTargetQueueId = '';
  }

  discardTask(taskId: string): void {
    if (!confirm('Permanently discard this task? This cannot be undone.')) return;
    this.dlqApi
      .discardTask(taskId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const updated = this.dlqEntries$.value.filter((e) => e.taskId !== taskId);
        this.dlqEntries$.next(updated);
        this.selectedTaskIds.delete(taskId);
        this.loadStats();
      });
  }

  retryAllSelected(): void {
    const ids = Array.from(this.selectedTaskIds);
    if (!ids.length) return;
    this.bulkActionInProgress = true;
    let remaining = ids.length;
    ids.forEach((taskId) => {
      this.dlqApi
        .retryTask(taskId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            const updated = this.dlqEntries$.value.filter((e) => e.taskId !== taskId);
            this.dlqEntries$.next(updated);
            this.selectedTaskIds.delete(taskId);
            remaining--;
            if (remaining === 0) {
              this.bulkActionInProgress = false;
              this.loadStats();
            }
          },
          error: () => {
            remaining--;
            if (remaining === 0) {
              this.bulkActionInProgress = false;
            }
          },
        });
    });
  }

  discardAllSelected(): void {
    const ids = Array.from(this.selectedTaskIds);
    if (!ids.length) return;
    if (!confirm(`Permanently discard ${ids.length} task(s)? This cannot be undone.`)) return;
    this.bulkActionInProgress = true;
    let remaining = ids.length;
    ids.forEach((taskId) => {
      this.dlqApi
        .discardTask(taskId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            const updated = this.dlqEntries$.value.filter((e) => e.taskId !== taskId);
            this.dlqEntries$.next(updated);
            this.selectedTaskIds.delete(taskId);
            remaining--;
            if (remaining === 0) {
              this.bulkActionInProgress = false;
              this.loadStats();
            }
          },
          error: () => {
            remaining--;
            if (remaining === 0) {
              this.bulkActionInProgress = false;
            }
          },
        });
    });
  }

  getReasonClass(reason: string): string {
    const map: Record<string, string> = {
      routing_failed: 'badge-error',
      sla_expired: 'badge-warning',
      max_retries_exceeded: 'badge-caution',
    };
    return map[reason] ?? 'badge-default';
  }

  getReasonLabel(reason: string): string {
    const map: Record<string, string> = {
      routing_failed: 'Routing Failed',
      sla_expired: 'SLA Expired',
      max_retries_exceeded: 'Max Retries',
    };
    return map[reason] ?? reason;
  }

  formatRelativeTime(isoDate: string): string {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  truncate(value: string, maxLength = 20): string {
    return value.length > maxLength ? `${value.substring(0, maxLength)}…` : value;
  }

  getPipelineName(pipelineId: string | undefined): string {
    if (!pipelineId) return '—';
    const pipeline = this.pipelines$.value.find((p) => p.id === pipelineId);
    return pipeline?.name ?? pipelineId;
  }

  getQueueName(queueId: string): string {
    const queue = this.queues$.value.find((q) => q.id === queueId);
    return queue?.name ?? queueId;
  }

  getFilteredQueues(pipelineId: string | undefined): PipelineQueue[] {
    if (!pipelineId) return this.queues$.value;
    return this.queues$.value.filter((q) => q.pipelineId === pipelineId);
  }

  taskPayloadJson(entry: DLQEntry): string {
    return JSON.stringify(entry.task, null, 2);
  }
}
