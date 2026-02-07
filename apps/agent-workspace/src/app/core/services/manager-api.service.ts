import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map, interval, switchMap, startWith } from 'rxjs';
import { AgentStateType } from '@nexus-queue/shared-models';

const API_BASE = 'http://localhost:3000/api';

export interface AgentWithMetrics {
  socketId: string;
  agentId: string;
  name: string;
  state: AgentStateType;
  currentTaskId?: string;
  connectedAt: string;
  lastStateChangeAt: string;
  teamId?: string;
  teamName?: string;
  metrics: {
    tasksCompleted: number;
    avgHandleTime: number;
    tasksPerHour: number;
  };
  timeInState: number;
}

export interface TeamSummary {
  totalAgents: number;
  onlineAgents: number;
  activeAgents: number;
  idleAgents: number;
  pausedAgents: number;
  totalTasksCompleted: number;
  avgHandleTime: number;
  avgTasksPerHour: number;
}

export interface QueueConfig {
  id: string;
  name: string;
  description: string;
  active: boolean;
  priority: number;
  slaTarget: number;
  maxWaitTime: number;
  requiredSkills: string[];
  workTypes: string[];
  routingMode: 'round-robin' | 'least-busy' | 'skill-based' | 'priority';
  createdAt: string;
  updatedAt: string;
}

export interface QueueStats {
  id: string;
  name: string;
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

export interface QueuesSummary {
  totalQueues: number;
  totalWaiting: number;
  totalInProgress: number;
  avgServiceLevel: number;
  healthyQueues: number;
  warningQueues: number;
  criticalQueues: number;
}

export interface SystemOverview {
  agents: {
    total: number;
    online: number;
    active: number;
    idle: number;
    paused: number;
  };
  queues: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
  };
  tasks: {
    pending: number;
    inProgress: number;
    completedToday: number;
  };
  performance: {
    avgServiceLevel: number;
    avgHandleTime: number;
    tasksPerHour: number;
  };
}

@Injectable({
  providedIn: 'root',
})
export class ManagerApiService {
  private http = inject(HttpClient);

  // ============ AGENTS API ============

  /**
   * Get all connected agents
   */
  getAllAgents(): Observable<AgentWithMetrics[]> {
    return this.http.get<AgentWithMetrics[]>(`${API_BASE}/agents`).pipe(
      catchError((err) => {
        console.error('Failed to fetch agents:', err);
        return of([]);
      })
    );
  }

  /**
   * Get agents for a specific team
   */
  getTeamAgents(teamId: string): Observable<AgentWithMetrics[]> {
    return this.http.get<AgentWithMetrics[]>(`${API_BASE}/agents/team/${teamId}`).pipe(
      catchError((err) => {
        console.error('Failed to fetch team agents:', err);
        return of([]);
      })
    );
  }

  /**
   * Get team summary statistics
   */
  getTeamSummary(teamId: string): Observable<TeamSummary> {
    return this.http.get<TeamSummary>(`${API_BASE}/agents/team/${teamId}/summary`).pipe(
      catchError((err) => {
        console.error('Failed to fetch team summary:', err);
        return of({
          totalAgents: 0,
          onlineAgents: 0,
          activeAgents: 0,
          idleAgents: 0,
          pausedAgents: 0,
          totalTasksCompleted: 0,
          avgHandleTime: 0,
          avgTasksPerHour: 0,
        });
      })
    );
  }

  /**
   * Get online agents with auto-refresh
   */
  getOnlineAgents$(refreshInterval = 5000): Observable<AgentWithMetrics[]> {
    return interval(refreshInterval).pipe(
      startWith(0),
      switchMap(() => this.http.get<AgentWithMetrics[]>(`${API_BASE}/agents/status/online`)),
      catchError((err) => {
        console.error('Failed to fetch online agents:', err);
        return of([]);
      })
    );
  }

  // ============ QUEUES API ============

  /**
   * Get all queues
   */
  getAllQueues(): Observable<QueueConfig[]> {
    return this.http.get<QueueConfig[]>(`${API_BASE}/queues`).pipe(
      catchError((err) => {
        console.error('Failed to fetch queues:', err);
        return of([]);
      })
    );
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): Observable<QueueStats[]> {
    return this.http.get<QueueStats[]>(`${API_BASE}/queues/stats`).pipe(
      catchError((err) => {
        console.error('Failed to fetch queue stats:', err);
        return of([]);
      })
    );
  }

  /**
   * Get queues summary
   */
  getQueuesSummary(): Observable<QueuesSummary> {
    return this.http.get<QueuesSummary>(`${API_BASE}/queues/summary`).pipe(
      catchError((err) => {
        console.error('Failed to fetch queues summary:', err);
        return of({
          totalQueues: 0,
          totalWaiting: 0,
          totalInProgress: 0,
          avgServiceLevel: 0,
          healthyQueues: 0,
          warningQueues: 0,
          criticalQueues: 0,
        });
      })
    );
  }

  /**
   * Get queue stats with auto-refresh
   */
  getQueueStats$(refreshInterval = 5000): Observable<QueueStats[]> {
    return interval(refreshInterval).pipe(
      startWith(0),
      switchMap(() => this.getQueueStats()),
      catchError(() => of([]))
    );
  }

  /**
   * Create a new queue
   */
  createQueue(data: Omit<QueueConfig, 'id' | 'createdAt' | 'updatedAt'>): Observable<QueueConfig> {
    return this.http.post<QueueConfig>(`${API_BASE}/queues`, data);
  }

  /**
   * Update a queue
   */
  updateQueue(id: string, data: Partial<QueueConfig>): Observable<QueueConfig> {
    return this.http.put<QueueConfig>(`${API_BASE}/queues/${id}`, data);
  }

  /**
   * Toggle queue active status
   */
  toggleQueue(id: string): Observable<QueueConfig> {
    return this.http.post<QueueConfig>(`${API_BASE}/queues/${id}/toggle`, {});
  }

  /**
   * Delete a queue
   */
  deleteQueue(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${API_BASE}/queues/${id}`);
  }

  // ============ METRICS API ============

  /**
   * Get system overview metrics
   */
  getSystemOverview(): Observable<SystemOverview> {
    return this.http.get<SystemOverview>(`${API_BASE}/metrics/overview`).pipe(
      catchError((err) => {
        console.error('Failed to fetch system overview:', err);
        return of({
          agents: { total: 0, online: 0, active: 0, idle: 0, paused: 0 },
          queues: { total: 0, healthy: 0, warning: 0, critical: 0 },
          tasks: { pending: 0, inProgress: 0, completedToday: 0 },
          performance: { avgServiceLevel: 0, avgHandleTime: 0, tasksPerHour: 0 },
        });
      })
    );
  }

  /**
   * Get system overview with auto-refresh
   */
  getSystemOverview$(refreshInterval = 5000): Observable<SystemOverview> {
    return interval(refreshInterval).pipe(
      startWith(0),
      switchMap(() => this.getSystemOverview()),
      catchError(() =>
        of({
          agents: { total: 0, online: 0, active: 0, idle: 0, paused: 0 },
          queues: { total: 0, healthy: 0, warning: 0, critical: 0 },
          tasks: { pending: 0, inProgress: 0, completedToday: 0 },
          performance: { avgServiceLevel: 0, avgHandleTime: 0, tasksPerHour: 0 },
        })
      )
    );
  }

  /**
   * Get system health
   */
  getHealth(): Observable<{ status: string; timestamp: string; uptime: number }> {
    return this.http.get<{ status: string; timestamp: string; uptime: number }>(
      `${API_BASE}/metrics/health`
    );
  }
}
