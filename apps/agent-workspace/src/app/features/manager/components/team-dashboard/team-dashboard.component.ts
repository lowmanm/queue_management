import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, interval, takeUntil, BehaviorSubject } from 'rxjs';
import {
  AgentStateType,
  formatDuration,
  TeamStats,
  AgentSessionStats,
} from '@nexus-queue/shared-models';

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

  // Mock data for demo - in production this would come from a real-time service
  private mockAgents: AgentDisplay[] = [
    {
      id: 'agent-001',
      name: 'John Smith',
      state: 'ACTIVE',
      stateLabel: 'Working',
      stateClass: 'state-active',
      timeInState: '12:34',
      tasksCompleted: 15,
      avgHandleTime: '4:32',
      tasksPerHour: 8.2,
      currentTask: 'ORD-2024-1234',
    },
    {
      id: 'agent-002',
      name: 'Sarah Johnson',
      state: 'IDLE',
      stateLabel: 'Ready',
      stateClass: 'state-idle',
      timeInState: '2:15',
      tasksCompleted: 12,
      avgHandleTime: '5:15',
      tasksPerHour: 7.1,
    },
    {
      id: 'agent-003',
      name: 'Mike Davis',
      state: 'WRAP_UP',
      stateLabel: 'Wrap-Up',
      stateClass: 'state-wrap-up',
      timeInState: '1:45',
      tasksCompleted: 18,
      avgHandleTime: '3:58',
      tasksPerHour: 9.4,
      currentTask: 'RET-2024-5678',
    },
    {
      id: 'agent-004',
      name: 'Emily Chen',
      state: 'BREAK',
      stateLabel: 'Break',
      stateClass: 'state-paused',
      timeInState: '8:30',
      tasksCompleted: 10,
      avgHandleTime: '4:45',
      tasksPerHour: 6.8,
    },
    {
      id: 'agent-005',
      name: 'James Wilson',
      state: 'ACTIVE',
      stateLabel: 'Working',
      stateClass: 'state-active',
      timeInState: '5:22',
      tasksCompleted: 14,
      avgHandleTime: '4:12',
      tasksPerHour: 8.8,
      currentTask: 'CLM-2024-9012',
    },
    {
      id: 'agent-006',
      name: 'Lisa Brown',
      state: 'RESERVED',
      stateLabel: 'Task Pending',
      stateClass: 'state-reserved',
      timeInState: '0:12',
      tasksCompleted: 11,
      avgHandleTime: '5:30',
      tasksPerHour: 6.5,
    },
    {
      id: 'agent-007',
      name: 'David Lee',
      state: 'OFFLINE',
      stateLabel: 'Offline',
      stateClass: 'state-offline',
      timeInState: '45:00',
      tasksCompleted: 0,
      avgHandleTime: '0:00',
      tasksPerHour: 0,
    },
    {
      id: 'agent-008',
      name: 'Amanda Taylor',
      state: 'LUNCH',
      stateLabel: 'Lunch',
      stateClass: 'state-paused',
      timeInState: '25:00',
      tasksCompleted: 8,
      avgHandleTime: '4:55',
      tasksPerHour: 7.2,
    },
  ];

  ngOnInit(): void {
    this.loadAgents();
    this.calculateSummary();

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
    this.loadAgents();
  }

  private loadAgents(): void {
    let filtered = [...this.mockAgents];

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
    const agents = this.mockAgents;
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

    this.summary$.next({
      totalAgents: agents.length,
      onlineAgents: online.length,
      activeAgents: active.length,
      idleAgents: idle.length,
      pausedAgents: paused.length,
      totalTasksCompleted: totalTasks,
      avgHandleTime: '4:35',
      avgTasksPerHour: Math.round(avgTPH * 10) / 10,
    });
  }

  private updateTimeInState(): void {
    // In production, this would update based on real timestamps
    // For demo, we just increment the mock times
    const agents = this.agents$.value.map((agent) => ({
      ...agent,
      timeInState: this.incrementTime(agent.timeInState),
    }));
    this.agents$.next(agents);
  }

  private incrementTime(time: string): string {
    const parts = time.split(':');
    let seconds = 0;
    let minutes = 0;

    if (parts.length === 2) {
      minutes = parseInt(parts[0], 10);
      seconds = parseInt(parts[1], 10);
    } else if (parts.length === 3) {
      minutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      seconds = parseInt(parts[2], 10);
    }

    seconds++;
    if (seconds >= 60) {
      seconds = 0;
      minutes++;
    }

    const totalMins = Math.floor(minutes);
    const secs = seconds;

    return `${totalMins}:${secs.toString().padStart(2, '0')}`;
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
