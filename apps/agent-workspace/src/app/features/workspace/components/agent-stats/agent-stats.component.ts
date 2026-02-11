import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subject, takeUntil, combineLatest, map } from 'rxjs';
import { AgentSessionStats, formatDuration } from '@nexus-queue/shared-models';
import { AgentStatsService } from '../../../../core/services/agent-stats.service';
import { QueueService } from '../../../../core/services/queue.service';

interface FormattedStats {
  tasksCompleted: number;
  tasksTransferred: number;
  tasksRejected: number;
  tasksPerHour: number;
  avgHandleTime: string;
  avgWrapUpTime: string;
  totalLoggedInTime: string;
  totalIdleTime: string;
  totalActiveTime: string;
  totalWrapUpTime: string;
  totalPausedTime: string;
  occupancyRate: number;
}

@Component({
  selector: 'app-agent-stats',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './agent-stats.component.html',
  styleUrl: './agent-stats.component.scss',
})
export class AgentStatsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private agentStatsService = inject(AgentStatsService);
  private queueService = inject(QueueService);

  stats$!: Observable<FormattedStats>;
  expanded = true;

  ngOnInit(): void {
    this.stats$ = this.agentStatsService.stats$.pipe(
      takeUntil(this.destroy$),
      map((stats) => this.formatStats(stats))
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }

  private formatStats(stats: AgentSessionStats): FormattedStats {
    const totalLoggedInTime =
      stats.totalIdleTime + stats.totalActiveTime + stats.totalPausedTime;

    return {
      tasksCompleted: stats.tasksCompleted,
      tasksTransferred: stats.tasksTransferred,
      tasksRejected: stats.tasksRejected,
      tasksPerHour: stats.tasksPerHour,
      avgHandleTime: this.formatTime(stats.averageHandleTime),
      avgWrapUpTime: this.formatTime(stats.averageWrapUpTime),
      totalLoggedInTime: this.formatTime(totalLoggedInTime),
      totalIdleTime: this.formatTime(stats.totalIdleTime),
      totalActiveTime: this.formatTime(stats.totalActiveTime),
      totalWrapUpTime: this.formatTime(stats.totalWrapUpTime),
      totalPausedTime: this.formatTime(stats.totalPausedTime),
      occupancyRate: Math.round(stats.occupancyRate * 100),
    };
  }

  private formatTime(seconds: number): string {
    return formatDuration(seconds);
  }
}
