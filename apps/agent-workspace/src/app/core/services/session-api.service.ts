import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError } from 'rxjs';
import {
  AgentSession,
  AgentWorkState,
  StateChangeEvent,
  WorkStateConfig,
  AgentSessionSummary,
  TeamSessionSummary,
  StateChangeTrigger,
  CreateWorkStateRequest,
  UpdateWorkStateRequest,
} from '@nexus-queue/shared-models';

const API_BASE = 'http://localhost:3000/api/sessions';

export interface LoginRequest {
  agentId: string;
  agentName: string;
  teamId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface StateChangeRequest {
  requestedState: AgentWorkState;
  reason?: string;
  expectedDuration?: number;
  trigger?: StateChangeTrigger;
  taskId?: string;
  managerApproved?: boolean;
  approvedBy?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SessionApiService {
  private http = inject(HttpClient);

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  /**
   * Get all active sessions
   */
  getAllActiveSessions(): Observable<AgentSession[]> {
    return this.http.get<AgentSession[]>(API_BASE).pipe(
      catchError((err) => {
        console.error('Failed to fetch active sessions:', err);
        return of([]);
      })
    );
  }

  /**
   * Get session for a specific agent
   */
  getAgentSession(agentId: string): Observable<AgentSession | null> {
    return this.http.get<AgentSession>(`${API_BASE}/agent/${agentId}`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Login - create a new session
   */
  login(request: LoginRequest): Observable<AgentSession> {
    return this.http.post<AgentSession>(`${API_BASE}/login`, request);
  }

  /**
   * Logout - end the current session
   */
  logout(agentId: string): Observable<AgentSession> {
    return this.http.post<AgentSession>(`${API_BASE}/logout`, { agentId });
  }

  /**
   * Get session summary for an agent
   */
  getAgentSessionSummary(agentId: string): Observable<AgentSessionSummary | null> {
    return this.http.get<AgentSessionSummary>(`${API_BASE}/agent/${agentId}/summary`).pipe(
      catchError(() => of(null))
    );
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  /**
   * Get current state for an agent
   */
  getAgentState(agentId: string): Observable<{ state: AgentWorkState }> {
    return this.http.get<{ state: AgentWorkState }>(`${API_BASE}/agent/${agentId}/state`).pipe(
      catchError(() => of({ state: 'LOGGED_OUT' as AgentWorkState }))
    );
  }

  /**
   * Change agent state
   */
  changeState(agentId: string, request: StateChangeRequest): Observable<AgentSession> {
    return this.http.post<AgentSession>(`${API_BASE}/agent/${agentId}/state`, request);
  }

  /**
   * Set agent to ready state
   */
  setReady(agentId: string): Observable<AgentSession> {
    return this.http.post<AgentSession>(`${API_BASE}/agent/${agentId}/ready`, {});
  }

  // ==========================================================================
  // STATE HISTORY
  // ==========================================================================

  /**
   * Get state history for an agent
   */
  getAgentHistory(agentId: string, limit?: number): Observable<StateChangeEvent[]> {
    const url = `${API_BASE}/agent/${agentId}/history`;
    const options = limit ? { params: { limit: limit.toString() } } : {};
    return this.http.get<StateChangeEvent[]>(url, options).pipe(
      catchError(() => of([] as StateChangeEvent[]))
    );
  }

  /**
   * Get today's state history across all agents
   */
  getTodayHistory(): Observable<StateChangeEvent[]> {
    return this.http.get<StateChangeEvent[]>(`${API_BASE}/history/today`).pipe(
      catchError(() => of([]))
    );
  }

  // ==========================================================================
  // TEAM SUMMARIES
  // ==========================================================================

  /**
   * Get team session summary
   */
  getTeamSummary(teamId: string): Observable<TeamSessionSummary | null> {
    return this.http.get<TeamSessionSummary>(`${API_BASE}/team/${teamId}/summary`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Get all team summaries
   */
  getAllTeamSummaries(): Observable<TeamSessionSummary[]> {
    return this.http.get<TeamSessionSummary[]>(`${API_BASE}/teams/summary`).pipe(
      catchError(() => of([]))
    );
  }

  // ==========================================================================
  // WORK STATE CONFIG
  // ==========================================================================

  /**
   * Get all work state configurations
   */
  getAllWorkStates(): Observable<WorkStateConfig[]> {
    return this.http.get<WorkStateConfig[]>(`${API_BASE}/work-states`).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Get system work states (immutable)
   */
  getSystemStates(): Observable<WorkStateConfig[]> {
    return this.http.get<WorkStateConfig[]>(`${API_BASE}/work-states/system`).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Get custom work states (configurable)
   */
  getCustomStates(): Observable<WorkStateConfig[]> {
    return this.http.get<WorkStateConfig[]>(`${API_BASE}/work-states/custom`).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Get work state configuration by ID
   */
  getWorkState(stateId: string): Observable<WorkStateConfig | null> {
    return this.http.get<WorkStateConfig>(`${API_BASE}/work-states/${stateId}`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Get agent-selectable states
   */
  getSelectableStates(): Observable<WorkStateConfig[]> {
    return this.http.get<WorkStateConfig[]>(`${API_BASE}/work-states/selectable`).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Create a new custom work state
   */
  createWorkState(request: CreateWorkStateRequest): Observable<WorkStateConfig> {
    return this.http.post<WorkStateConfig>(`${API_BASE}/work-states`, request);
  }

  /**
   * Update a custom work state
   */
  updateWorkState(stateId: string, updates: UpdateWorkStateRequest): Observable<WorkStateConfig> {
    return this.http.put<WorkStateConfig>(`${API_BASE}/work-states/${stateId}`, updates);
  }

  /**
   * Delete a custom work state
   */
  deleteWorkState(stateId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${API_BASE}/work-states/${stateId}`);
  }

  /**
   * Toggle work state active status
   */
  toggleWorkState(stateId: string): Observable<WorkStateConfig> {
    return this.http.post<WorkStateConfig>(`${API_BASE}/work-states/${stateId}/toggle`, {});
  }

  /**
   * Reorder custom work states
   */
  reorderWorkStates(stateIds: string[]): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${API_BASE}/work-states/reorder`, { stateIds });
  }
}
