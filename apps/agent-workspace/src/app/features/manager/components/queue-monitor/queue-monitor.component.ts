import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, interval, takeUntil, BehaviorSubject } from 'rxjs';

interface QueueDisplay {
  id: string;
  name: string;
  description?: string;
  tasksWaiting: number;
  tasksInProgress: number;
  oldestTaskAge: number;
  avgWaitTime: number;
  completedToday: number;
  serviceLevelPercent: number;
  slaTarget: number;
  agentsAssigned: number;
  agentsAvailable: number;
  status: 'healthy' | 'warning' | 'critical';
}

interface QueueSummary {
  totalQueues: number;
  totalWaiting: number;
  totalInProgress: number;
  avgServiceLevel: number;
  healthyQueues: number;
  warningQueues: number;
  criticalQueues: number;
}

@Component({
  selector: 'app-queue-monitor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './queue-monitor.component.html',
  styleUrl: './queue-monitor.component.scss',
})
export class QueueMonitorComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  queues$ = new BehaviorSubject<QueueDisplay[]>([]);
  summary$ = new BehaviorSubject<QueueSummary>({
    totalQueues: 0,
    totalWaiting: 0,
    totalInProgress: 0,
    avgServiceLevel: 0,
    healthyQueues: 0,
    warningQueues: 0,
    criticalQueues: 0,
  });

  selectedFilter: 'all' | 'healthy' | 'warning' | 'critical' = 'all';

  // Mock data for demo
  private mockQueues: QueueDisplay[] = [
    {
      id: 'queue-001',
      name: 'Order Processing',
      description: 'New orders and order modifications',
      tasksWaiting: 5,
      tasksInProgress: 3,
      oldestTaskAge: 180,
      avgWaitTime: 120,
      completedToday: 145,
      serviceLevelPercent: 92,
      slaTarget: 300,
      agentsAssigned: 4,
      agentsAvailable: 2,
      status: 'healthy',
    },
    {
      id: 'queue-002',
      name: 'Returns & Refunds',
      description: 'Return requests and refund processing',
      tasksWaiting: 12,
      tasksInProgress: 4,
      oldestTaskAge: 420,
      avgWaitTime: 280,
      completedToday: 87,
      serviceLevelPercent: 78,
      slaTarget: 300,
      agentsAssigned: 3,
      agentsAvailable: 1,
      status: 'warning',
    },
    {
      id: 'queue-003',
      name: 'Claims Processing',
      description: 'Insurance and warranty claims',
      tasksWaiting: 25,
      tasksInProgress: 5,
      oldestTaskAge: 900,
      avgWaitTime: 520,
      completedToday: 42,
      serviceLevelPercent: 45,
      slaTarget: 600,
      agentsAssigned: 2,
      agentsAvailable: 0,
      status: 'critical',
    },
    {
      id: 'queue-004',
      name: 'Escalations',
      description: 'Escalated issues requiring supervisor attention',
      tasksWaiting: 3,
      tasksInProgress: 2,
      oldestTaskAge: 240,
      avgWaitTime: 180,
      completedToday: 28,
      serviceLevelPercent: 88,
      slaTarget: 600,
      agentsAssigned: 2,
      agentsAvailable: 1,
      status: 'healthy',
    },
    {
      id: 'queue-005',
      name: 'Customer Updates',
      description: 'Address changes, account updates',
      tasksWaiting: 8,
      tasksInProgress: 2,
      oldestTaskAge: 350,
      avgWaitTime: 200,
      completedToday: 65,
      serviceLevelPercent: 72,
      slaTarget: 300,
      agentsAssigned: 2,
      agentsAvailable: 0,
      status: 'warning',
    },
  ];

  ngOnInit(): void {
    this.loadQueues();
    this.calculateSummary();

    // Update queue ages every second
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
    this.loadQueues();
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

  private loadQueues(): void {
    let filtered = [...this.mockQueues];

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

  private calculateSummary(): void {
    const queues = this.mockQueues;
    const healthy = queues.filter((q) => q.status === 'healthy');
    const warning = queues.filter((q) => q.status === 'warning');
    const critical = queues.filter((q) => q.status === 'critical');

    const totalWaiting = queues.reduce((sum, q) => sum + q.tasksWaiting, 0);
    const totalInProgress = queues.reduce(
      (sum, q) => sum + q.tasksInProgress,
      0
    );
    const avgSL =
      queues.reduce((sum, q) => sum + q.serviceLevelPercent, 0) / queues.length;

    this.summary$.next({
      totalQueues: queues.length,
      totalWaiting,
      totalInProgress,
      avgServiceLevel: Math.round(avgSL),
      healthyQueues: healthy.length,
      warningQueues: warning.length,
      criticalQueues: critical.length,
    });
  }

  private updateQueueAges(): void {
    const queues = this.queues$.value.map((queue) => ({
      ...queue,
      oldestTaskAge: queue.tasksWaiting > 0 ? queue.oldestTaskAge + 1 : 0,
    }));
    this.queues$.next(queues);
  }
}
