import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil, BehaviorSubject } from 'rxjs';
import { PipelineMetricsSummary, PipelineMetrics } from '@nexus-queue/shared-models';
import { SocketService } from '../../../../core/services/socket.service';
import { PipelineApiService } from '../../../admin/services/pipeline.service';

@Component({
  selector: 'app-pipeline-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pipeline-status.component.html',
  styleUrl: './pipeline-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelineStatusDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private socketService = inject(SocketService);
  private pipelineApi = inject(PipelineApiService);
  private router = inject(Router);

  metrics$ = new BehaviorSubject<PipelineMetricsSummary | null>(null);
  lastUpdated$ = new BehaviorSubject<Date | null>(null);

  ngOnInit(): void {
    // Initial load via HTTP
    this.pipelineApi
      .getAllPipelineMetrics()
      .pipe(takeUntil(this.destroy$))
      .subscribe((summary) => {
        this.metrics$.next(summary);
        this.lastUpdated$.next(new Date());
      });

    // Real-time updates via WebSocket
    this.socketService.pipelineMetrics$
      .pipe(takeUntil(this.destroy$))
      .subscribe((summary) => {
        if (summary) {
          this.metrics$.next(summary);
          this.lastUpdated$.next(new Date());
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get activeCount(): number {
    return this.metrics$.value?.pipelines.filter((p) => p.status === 'active').length ?? 0;
  }

  get inactiveCount(): number {
    return this.metrics$.value?.pipelines.filter((p) => p.status === 'inactive').length ?? 0;
  }

  get errorCount(): number {
    return this.metrics$.value?.pipelines.filter((p) => p.status === 'error').length ?? 0;
  }

  get overallSlaCompliance(): number {
    const active = this.metrics$.value?.pipelines.filter((p) => p.status === 'active') ?? [];
    if (!active.length) return 0;
    const sum = active.reduce((acc, p) => acc + p.slaCompliancePercent, 0);
    return Math.round(sum / active.length);
  }

  getSlaClass(percent: number): string {
    if (percent >= 95) return 'sla-good';
    if (percent >= 80) return 'sla-warning';
    return 'sla-critical';
  }

  getErrorRateClass(percent: number): string {
    if (percent < 1) return 'rate-good';
    if (percent <= 5) return 'rate-warning';
    return 'rate-critical';
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      active: 'status-active',
      inactive: 'status-inactive',
      error: 'status-error',
    };
    return map[status] ?? 'status-inactive';
  }

  getStatusLabel(status: string): string {
    return status.toUpperCase();
  }

  formatLastUpdated(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  }

  viewDlq(pipeline: PipelineMetrics): void {
    this.router.navigate(['/manager/dlq'], {
      queryParams: { pipelineId: pipeline.pipelineId },
    });
  }

  viewQueues(pipeline: PipelineMetrics): void {
    this.router.navigate(['/manager/queues'], {
      queryParams: { pipelineId: pipeline.pipelineId },
    });
  }
}
