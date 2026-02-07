import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, interval, takeUntil, BehaviorSubject, switchMap, startWith } from 'rxjs';
import { ManagerApiService, QueueStats, QueuesSummary } from '../../../../core/services/manager-api.service';

@Component({
  selector: 'app-queue-monitor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './queue-monitor.component.html',
  styleUrl: './queue-monitor.component.scss',
})
export class QueueMonitorComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private managerApi = inject(ManagerApiService);

  queues$ = new BehaviorSubject<QueueStats[]>([]);
  summary$ = new BehaviorSubject<QueuesSummary>({
    totalQueues: 0,
    totalWaiting: 0,
    totalInProgress: 0,
    avgServiceLevel: 0,
    healthyQueues: 0,
    warningQueues: 0,
    criticalQueues: 0,
  });

  selectedFilter: 'all' | 'healthy' | 'warning' | 'critical' = 'all';
  private allQueues: QueueStats[] = [];

  ngOnInit(): void {
    // Fetch queue stats from API every 5 seconds
    interval(5000)
      .pipe(
        startWith(0),
        takeUntil(this.destroy$),
        switchMap(() => this.managerApi.getQueueStats())
      )
      .subscribe((queues) => {
        this.allQueues = queues;
        this.applyFilter();
      });

    // Fetch summary
    interval(5000)
      .pipe(
        startWith(0),
        takeUntil(this.destroy$),
        switchMap(() => this.managerApi.getQueuesSummary())
      )
      .subscribe((summary) => {
        this.summary$.next(summary);
      });

    // Update queue ages every second (local increment)
    interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateQueueAges());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setFilter(filter: 'all' | 'healthy' | 'warning' | 'critical'): void {
    this.selectedFilter = filter;
    this.applyFilter();
  }

  formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) {
      return `${minutes}m ${secs}s`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  getServiceLevelClass(percent: number): string {
    if (percent >= 85) return 'sl-good';
    if (percent >= 70) return 'sl-warning';
    return 'sl-critical';
  }

  getStatusIcon(status: 'healthy' | 'warning' | 'critical'): string {
    const icons = {
      healthy: '✓',
      warning: '!',
      critical: '✕',
    };
    return icons[status];
  }

  private applyFilter(): void {
    let filtered = [...this.allQueues];

    if (this.selectedFilter !== 'all') {
      filtered = filtered.filter((q) => q.status === this.selectedFilter);
    }

    // Sort: critical first, then warning, then healthy
    filtered.sort((a, b) => {
      const priority = { critical: 0, warning: 1, healthy: 2 };
      return priority[a.status] - priority[b.status];
    });

    this.queues$.next(filtered);
  }

  private updateQueueAges(): void {
    // Increment oldest task age locally between API refreshes
    const queues = this.queues$.value.map((queue) => ({
      ...queue,
      oldestTaskAge: queue.tasksWaiting > 0 ? queue.oldestTaskAge + 1 : 0,
    }));
    this.queues$.next(queues);
  }
}
