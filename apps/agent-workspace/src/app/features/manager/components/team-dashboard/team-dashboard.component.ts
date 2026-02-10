import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, interval, takeUntil, BehaviorSubject, switchMap, startWith, combineLatest, map } from 'rxjs';
import { AgentStateType, formatDuration } from '@nexus-queue/shared-models';
import { ManagerApiService, AgentWithMetrics, TeamSummary as ApiTeamSummary } from '../../../../core/services/manager-api.service';

interface AgentDisplay {
  id: string;
  name: string;
  state: AgentStateType;
  stateLabel: string;
  stateClass: string;
  timeInState: string;
  tasksCompleted: number;
  avgHandleTime: string;
  tasksPerHour: number;
  currentTask?: string;
}

interface TeamSummary {
  totalAgents: number;
  onlineAgents: number;
  activeAgents: number;
  idleAgents: number;
  pausedAgents: number;
  totalTasksCompleted: number;
  avgHandleTime: string;
  avgTasksPerHour: number;
}

@Component({
  selector: 'app-team-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './team-dashboard.component.html',
  styleUrl: './team-dashboard.component.scss',
})
export class TeamDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private managerApi = inject(ManagerApiService);

  agents$ = new BehaviorSubject<AgentDisplay[]>([]);
  summary$ = new BehaviorSubject<TeamSummary>({
    totalAgents: 0,
    onlineAgents: 0,
    activeAgents: 0,
    idleAgents: 0,
    pausedAgents: 0,
    totalTasksCompleted: 0,
    avgHandleTime: '0:00',
    avgTasksPerHour: 0,
  });

  selectedFilter: 'all' | 'online' | 'active' | 'idle' | 'paused' = 'all';
  private allAgents: AgentDisplay[] = [];

  ngOnInit(): void {
    // Fetch agents from API every 5 seconds
    interval(5000)
      .pipe(
        startWith(0),
        takeUntil(this.destroy$),
        switchMap(() => this.managerApi.getAllAgents())
      )
      .subscribe((agents) => {
        this.allAgents = agents.map((a) => this.transformAgent(a));
        this.applyFilter();
        this.calculateSummary();
      });

    // Update time in state every second
    interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateTimeInState());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setFilter(filter: 'all' | 'online' | 'active' | 'idle' | 'paused'): void {
    this.selectedFilter = filter;
    this.applyFilter();
  }

  private transformAgent(agent: AgentWithMetrics): AgentDisplay {
    return {
      id: agent.agentId,
      name: agent.name,
      state: agent.state,
      stateLabel: this.getStateLabel(agent.state),
      stateClass: this.getStateClass(agent.state),
      timeInState: this.formatSeconds(agent.timeInState),
      tasksCompleted: agent.metrics.tasksCompleted,
      avgHandleTime: this.formatSeconds(agent.metrics.avgHandleTime),
      tasksPerHour: agent.metrics.tasksPerHour,
      currentTask: agent.currentTaskId,
    };
  }

  private getStateLabel(state: AgentStateType): string {
    const labels: Record<AgentStateType, string> = {
      OFFLINE: 'Offline',
      IDLE: 'Ready',
      RESERVED: 'Task Pending',
      ACTIVE: 'Working',
      WRAP_UP: 'Wrap-Up',
      PAUSED: 'Paused',
      BREAK: 'Break',
      LUNCH: 'Lunch',
      TRAINING: 'Training',
      MEETING: 'Meeting',
    };
    return labels[state] || state;
  }

  private getStateClass(state: AgentStateType): string {
    const classes: Record<AgentStateType, string> = {
      OFFLINE: 'state-offline',
      IDLE: 'state-idle',
      RESERVED: 'state-reserved',
      ACTIVE: 'state-active',
      WRAP_UP: 'state-wrap-up',
      PAUSED: 'state-paused',
      BREAK: 'state-paused',
      LUNCH: 'state-paused',
      TRAINING: 'state-paused',
      MEETING: 'state-paused',
    };
    return classes[state] || 'state-offline';
  }

  private formatSeconds(seconds: number): string {
    if (seconds < 60) {
      return `0:${seconds.toString().padStart(2, '0')}`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private applyFilter(): void {
    let filtered = [...this.allAgents];

    switch (this.selectedFilter) {
      case 'online':
        filtered = filtered.filter((a) => a.state !== 'OFFLINE');
        break;
      case 'active':
        filtered = filtered.filter((a) =>
          ['ACTIVE', 'WRAP_UP', 'RESERVED'].includes(a.state)
        );
        break;
      case 'idle':
        filtered = filtered.filter((a) => a.state === 'IDLE');
        break;
      case 'paused':
        filtered = filtered.filter((a) =>
          ['BREAK', 'LUNCH', 'TRAINING', 'MEETING', 'PAUSED'].includes(a.state)
        );
        break;
    }

    this.agents$.next(filtered);
  }

  private calculateSummary(): void {
    const agents = this.allAgents;
    const online = agents.filter((a) => a.state !== 'OFFLINE');
    const active = agents.filter((a) =>
      ['ACTIVE', 'WRAP_UP', 'RESERVED'].includes(a.state)
    );
    const idle = agents.filter((a) => a.state === 'IDLE');
    const paused = agents.filter((a) =>
      ['BREAK', 'LUNCH', 'TRAINING', 'MEETING', 'PAUSED'].includes(a.state)
    );

    const totalTasks = agents.reduce((sum, a) => sum + a.tasksCompleted, 0);
    const avgTPH =
      online.length > 0
        ? online.reduce((sum, a) => sum + a.tasksPerHour, 0) / online.length
        : 0;

    // Calculate average handle time from all agent data
    const totalAHT = agents.reduce((sum, a) => {
      const parts = a.avgHandleTime.split(':');
      return sum + parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }, 0);
    const avgAHT = agents.length > 0 ? Math.floor(totalAHT / agents.length) : 0;

    this.summary$.next({
      totalAgents: agents.length,
      onlineAgents: online.length,
      activeAgents: active.length,
      idleAgents: idle.length,
      pausedAgents: paused.length,
      totalTasksCompleted: totalTasks,
      avgHandleTime: this.formatSeconds(avgAHT),
      avgTasksPerHour: Math.round(avgTPH * 10) / 10,
    });
  }

  private updateTimeInState(): void {
    // Increment time in state locally between API refreshes
    const agents = this.agents$.value.map((agent) => ({
      ...agent,
      timeInState: this.incrementTime(agent.timeInState),
    }));
    this.agents$.next(agents);
  }

  private incrementTime(time: string): string {
    const parts = time.split(':');
    let minutes = parseInt(parts[0], 10);
    let seconds = parseInt(parts[1], 10);

    seconds++;
    if (seconds >= 60) {
      seconds = 0;
      minutes++;
    }

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  getStateIcon(state: AgentStateType): string {
    const icons: Record<AgentStateType, string> = {
      OFFLINE: '○',
      IDLE: '●',
      RESERVED: '◐',
      ACTIVE: '▶',
      WRAP_UP: '✎',
      PAUSED: '⏸',
      BREAK: '☕',
      LUNCH: '🍽',
      TRAINING: '📚',
      MEETING: '👥',
    };
    return icons[state] || '○';
  }
}
