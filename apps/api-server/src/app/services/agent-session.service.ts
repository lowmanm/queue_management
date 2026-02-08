import { Injectable, Logger } from '@nestjs/common';
import {
  AgentWorkState,
  AgentSession,
  StateChangeEvent,
  StateChangeTrigger,
  StateChangeRequest,
  AgentSessionSummary,
  TeamSessionSummary,
  WorkStateConfig,
  CreateWorkStateRequest,
  UpdateWorkStateRequest,
  SYSTEM_WORK_STATES,
  DEFAULT_CUSTOM_STATES,
  generateWorkStateId,
  isValidStateTransition,
} from '@nexus-queue/shared-models';
import { RbacService } from './rbac.service';

@Injectable()
export class AgentSessionService {
  private readonly logger = new Logger(AgentSessionService.name);

  // In-memory storage
  private sessions = new Map<string, AgentSession>(); // agentId -> session
  private stateHistory: StateChangeEvent[] = [];
  private workStateConfigs = new Map<AgentWorkState, WorkStateConfig>();

  constructor(private readonly rbacService: RbacService) {
    this.initializeWorkStates();
  }

  private initializeWorkStates(): void {
    // Initialize system states (immutable)
    SYSTEM_WORK_STATES.forEach((config) => {
      this.workStateConfigs.set(config.id, config);
    });
    // Initialize default custom states
    DEFAULT_CUSTOM_STATES.forEach((config) => {
      this.workStateConfigs.set(config.id, config);
    });
    this.logger.log(`Initialized ${this.workStateConfigs.size} work state configurations`);
  }

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  /**
   * Create a new session (agent login)
   */
  createSession(
    agentId: string,
    agentName: string,
    options?: {
      teamId?: string;
      ipAddress?: string;
      userAgent?: string;
      socketId?: string;
    }
  ): AgentSession {
    // End any existing session
    const existing = this.sessions.get(agentId);
    if (existing && existing.isActive) {
      this.endSession(agentId, 'SYSTEM_AUTO');
    }

    const now = new Date().toISOString();
    const session: AgentSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      agentId,
      agentName,
      teamId: options?.teamId,
      currentState: 'LOGGED_IN',
      loginAt: now,
      isActive: true,
      lastStateChangeAt: now,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      socketId: options?.socketId,
    };

    this.sessions.set(agentId, session);

    // Record state change
    this.recordStateChange(session.id, agentId, 'LOGGED_OUT', 'LOGGED_IN', 'LOGIN');

    this.logger.log(`Session created for agent ${agentId} (${agentName})`);
    return session;
  }

  /**
   * End a session (agent logout)
   */
  endSession(agentId: string, trigger: StateChangeTrigger = 'LOGOUT'): AgentSession | null {
    const session = this.sessions.get(agentId);
    if (!session || !session.isActive) {
      return null;
    }

    const now = new Date().toISOString();
    const previousState = session.currentState;

    session.currentState = 'LOGGED_OUT';
    session.logoutAt = now;
    session.isActive = false;
    session.lastStateChangeAt = now;
    session.currentTaskId = undefined;
    session.socketId = undefined;

    // Record state change
    this.recordStateChange(session.id, agentId, previousState, 'LOGGED_OUT', trigger);

    this.logger.log(`Session ended for agent ${agentId}`);
    return session;
  }

  /**
   * Get active session for an agent
   */
  getSession(agentId: string): AgentSession | null {
    const session = this.sessions.get(agentId);
    return session?.isActive ? session : null;
  }

  /**
   * Get all active sessions
   */
  getAllActiveSessions(): AgentSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.isActive);
  }

  /**
   * Update socket ID for a session
   */
  updateSocketId(agentId: string, socketId: string): void {
    const session = this.sessions.get(agentId);
    if (session && session.isActive) {
      session.socketId = socketId;
    }
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  /**
   * Change agent work state
   */
  changeState(
    agentId: string,
    request: StateChangeRequest,
    trigger: StateChangeTrigger = 'AGENT_REQUEST',
    options?: {
      taskId?: string;
      managerApproved?: boolean;
      approvedBy?: string;
    }
  ): { success: boolean; session?: AgentSession; error?: string } {
    const session = this.sessions.get(agentId);
    if (!session || !session.isActive) {
      return { success: false, error: 'No active session' };
    }

    const fromState = session.currentState;
    const toState = request.requestedState;

    // Validate transition
    if (!isValidStateTransition(fromState, toState)) {
      return {
        success: false,
        error: `Invalid transition from ${fromState} to ${toState}`,
      };
    }

    // Check if approval is required
    const stateConfig = this.workStateConfigs.get(toState);
    if (stateConfig?.requiresApproval && !options?.managerApproved) {
      return {
        success: false,
        error: `State ${toState} requires manager approval`,
      };
    }

    const now = new Date().toISOString();
    session.currentState = toState;
    session.lastStateChangeAt = now;

    // Update task ID based on state
    if (toState === 'READY' || toState === 'LOGGED_OUT') {
      session.currentTaskId = undefined;
    }
    if (options?.taskId) {
      session.currentTaskId = options.taskId;
    }

    // Record state change
    this.recordStateChange(
      session.id,
      agentId,
      fromState,
      toState,
      trigger,
      options?.taskId,
      request.reason,
      options?.managerApproved,
      options?.approvedBy
    );

    this.logger.log(`Agent ${agentId} state changed: ${fromState} -> ${toState} (${trigger})`);
    return { success: true, session };
  }

  /**
   * Get current state for an agent
   */
  getCurrentState(agentId: string): AgentWorkState | null {
    const session = this.sessions.get(agentId);
    return session?.isActive ? session.currentState : null;
  }

  /**
   * Set agent to ready state
   */
  setReady(agentId: string): { success: boolean; session?: AgentSession; error?: string } {
    return this.changeState(agentId, { requestedState: 'READY' }, 'AGENT_REQUEST');
  }

  /**
   * Handle task assignment
   */
  handleTaskAssigned(agentId: string, taskId: string): { success: boolean; session?: AgentSession; error?: string } {
    return this.changeState(
      agentId,
      { requestedState: 'RESERVED' },
      'TASK_ASSIGNED',
      { taskId }
    );
  }

  /**
   * Handle task acceptance
   */
  handleTaskAccepted(agentId: string, taskId: string): { success: boolean; session?: AgentSession; error?: string } {
    return this.changeState(
      agentId,
      { requestedState: 'ACTIVE' },
      'TASK_ACCEPTED',
      { taskId }
    );
  }

  /**
   * Handle task rejection
   */
  handleTaskRejected(agentId: string): { success: boolean; session?: AgentSession; error?: string } {
    return this.changeState(agentId, { requestedState: 'READY' }, 'TASK_REJECTED');
  }

  /**
   * Handle task completion (move to wrap-up)
   */
  handleTaskCompleted(agentId: string, taskId: string): { success: boolean; session?: AgentSession; error?: string } {
    return this.changeState(
      agentId,
      { requestedState: 'WRAP_UP' },
      'TASK_COMPLETED',
      { taskId }
    );
  }

  /**
   * Handle disposition done (move to ready)
   */
  handleDispositionDone(agentId: string): { success: boolean; session?: AgentSession; error?: string } {
    return this.changeState(agentId, { requestedState: 'READY' }, 'DISPOSITION_DONE');
  }

  // ==========================================================================
  // STATE HISTORY
  // ==========================================================================

  private recordStateChange(
    sessionId: string,
    agentId: string,
    fromState: AgentWorkState,
    toState: AgentWorkState,
    trigger: StateChangeTrigger,
    taskId?: string,
    reason?: string,
    managerApproved?: boolean,
    approvedBy?: string
  ): void {
    const now = new Date().toISOString();

    // Calculate duration in previous state
    const lastEvent = this.stateHistory
      .filter((e) => e.agentId === agentId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    const durationInPreviousState = lastEvent
      ? Math.floor((new Date(now).getTime() - new Date(lastEvent.timestamp).getTime()) / 1000)
      : 0;

    const event: StateChangeEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      sessionId,
      agentId,
      fromState,
      toState,
      timestamp: now,
      durationInPreviousState,
      trigger,
      taskId,
      reason,
      managerApproved,
      approvedBy,
    };

    this.stateHistory.push(event);

    // Keep only last 10000 events to prevent memory issues
    if (this.stateHistory.length > 10000) {
      this.stateHistory = this.stateHistory.slice(-10000);
    }
  }

  /**
   * Get state history for an agent
   */
  getStateHistory(agentId: string, limit = 100): StateChangeEvent[] {
    return this.stateHistory
      .filter((e) => e.agentId === agentId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Get state history for a session
   */
  getSessionHistory(sessionId: string): StateChangeEvent[] {
    return this.stateHistory
      .filter((e) => e.sessionId === sessionId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Get all state history for today
   */
  getTodayHistory(): StateChangeEvent[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.stateHistory
      .filter((e) => new Date(e.timestamp) >= today)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // ==========================================================================
  // SUMMARIES & ANALYTICS
  // ==========================================================================

  /**
   * Get session summary for an agent
   */
  getAgentSessionSummary(agentId: string): AgentSessionSummary | null {
    const session = this.sessions.get(agentId);
    if (!session) return null;

    const stateConfig = this.workStateConfigs.get(session.currentState)!;
    const now = Date.now();
    const timeInCurrentState = Math.floor(
      (now - new Date(session.lastStateChangeAt).getTime()) / 1000
    );

    // Calculate time metrics from history
    const todayHistory = this.getStateHistory(agentId).filter((e) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return new Date(e.timestamp) >= today;
    });

    let totalLoggedInTime = 0;
    let totalProductiveTime = 0;
    let totalAvailableTime = 0;
    let totalUnavailableTime = 0;

    for (const event of todayHistory) {
      const config = this.workStateConfigs.get(event.fromState);
      if (!config) continue;

      totalLoggedInTime += event.durationInPreviousState;

      if (config.isProductive) {
        totalProductiveTime += event.durationInPreviousState;
      } else if (config.category === 'available') {
        totalAvailableTime += event.durationInPreviousState;
      } else if (config.category === 'unavailable') {
        totalUnavailableTime += event.durationInPreviousState;
      }
    }

    // Add current state time
    if (session.isActive) {
      totalLoggedInTime += timeInCurrentState;
      if (stateConfig.isProductive) {
        totalProductiveTime += timeInCurrentState;
      } else if (stateConfig.category === 'available') {
        totalAvailableTime += timeInCurrentState;
      } else if (stateConfig.category === 'unavailable') {
        totalUnavailableTime += timeInCurrentState;
      }
    }

    const isOverTime =
      stateConfig.maxDurationMinutes > 0 &&
      timeInCurrentState > stateConfig.maxDurationMinutes * 60;

    const utilizationPercent =
      totalLoggedInTime > 0
        ? Math.round((totalProductiveTime / totalLoggedInTime) * 100)
        : 0;

    return {
      agentId,
      agentName: session.agentName,
      teamId: session.teamId,
      currentState: session.currentState,
      stateConfig,
      timeInCurrentState,
      isOverTime,
      totalLoggedInTime,
      totalProductiveTime,
      totalAvailableTime,
      totalUnavailableTime,
      tasksCompletedToday: 0, // Would be populated from disposition service
      avgHandleTimeToday: 0,
      utilizationPercent,
    };
  }

  /**
   * Get team session summary
   */
  getTeamSessionSummary(teamId: string): TeamSessionSummary {
    const team = this.rbacService.getTeamById(teamId);
    const teamAgents = this.rbacService.getUsersByTeam(teamId);
    const activeSessions = this.getAllActiveSessions().filter(
      (s) => s.teamId === teamId
    );

    const stateBreakdown: Record<AgentWorkState, number> = {} as Record<AgentWorkState, number>;
    this.getAllWorkStates().forEach((s) => {
      stateBreakdown[s.id] = 0;
    });

    let readyAgents = 0;
    let activeAgents = 0;
    let unavailableAgents = 0;

    for (const session of activeSessions) {
      stateBreakdown[session.currentState]++;
      const config = this.workStateConfigs.get(session.currentState);
      if (config?.category === 'available') readyAgents++;
      else if (config?.category === 'productive') activeAgents++;
      else if (config?.category === 'unavailable') unavailableAgents++;
    }

    const teamUtilization =
      activeSessions.length > 0
        ? Math.round(((readyAgents + activeAgents) / activeSessions.length) * 100)
        : 0;

    return {
      teamId,
      teamName: team?.name || teamId,
      totalAgents: teamAgents.length,
      loggedInAgents: activeSessions.length,
      readyAgents,
      activeAgents,
      unavailableAgents,
      stateBreakdown,
      teamUtilization,
    };
  }

  /**
   * Get all team summaries
   */
  getAllTeamSummaries(): TeamSessionSummary[] {
    const teams = this.rbacService.getAllTeams();
    return teams.map((team) => this.getTeamSessionSummary(team.id));
  }

  // ==========================================================================
  // WORK STATE CONFIG
  // ==========================================================================

  /**
   * Get all work state configs
   */
  getAllWorkStates(): WorkStateConfig[] {
    return Array.from(this.workStateConfigs.values()).sort(
      (a, b) => a.displayOrder - b.displayOrder
    );
  }

  /**
   * Get work state config by ID
   */
  getWorkStateById(stateId: AgentWorkState): WorkStateConfig | undefined {
    return this.workStateConfigs.get(stateId);
  }

  /**
   * Get agent-selectable states
   */
  getAgentSelectableStates(): WorkStateConfig[] {
    return this.getAllWorkStates().filter((s) => s.agentSelectable && s.active);
  }

  /**
   * Update work state config (deprecated - use updateWorkState instead)
   */
  updateWorkStateConfig(stateId: AgentWorkState, updates: Partial<WorkStateConfig>): WorkStateConfig | null {
    const config = this.workStateConfigs.get(stateId);
    if (!config) return null;

    const updated = { ...config, ...updates, id: stateId };
    this.workStateConfigs.set(stateId, updated);
    return updated;
  }

  // ==========================================================================
  // CUSTOM WORK STATE CRUD
  // ==========================================================================

  /**
   * Get system work states (immutable)
   */
  getSystemStates(): WorkStateConfig[] {
    return this.getAllWorkStates().filter((s) => s.isSystemState);
  }

  /**
   * Get custom work states (configurable)
   */
  getCustomStates(): WorkStateConfig[] {
    return this.getAllWorkStates().filter((s) => !s.isSystemState);
  }

  /**
   * Create a new custom work state
   */
  createWorkState(request: CreateWorkStateRequest): {
    success: boolean;
    state?: WorkStateConfig;
    error?: string;
  } {
    // Generate unique ID
    const stateId = generateWorkStateId(request.name);

    // Check if name already exists
    const existingByName = this.getAllWorkStates().find(
      (s) => s.name.toLowerCase() === request.name.toLowerCase()
    );
    if (existingByName) {
      return { success: false, error: `Work state with name "${request.name}" already exists` };
    }

    // Get max display order
    const maxOrder = Math.max(
      ...this.getAllWorkStates().map((s) => s.displayOrder),
      0
    );

    const newState: WorkStateConfig = {
      id: stateId,
      name: request.name,
      category: 'unavailable', // Custom states are always unavailable category
      color: request.color,
      icon: request.icon,
      agentSelectable: request.agentSelectable,
      isProductive: false, // Custom states are not productive
      isBillable: request.isBillable,
      maxDurationMinutes: request.maxDurationMinutes,
      warnBeforeMax: request.warnBeforeMax,
      warnMinutesBefore: request.warnMinutesBefore,
      requiresApproval: request.requiresApproval,
      displayOrder: request.displayOrder ?? maxOrder + 1,
      active: true,
      isSystemState: false,
    };

    this.workStateConfigs.set(stateId, newState);
    this.logger.log(`Created custom work state: ${stateId} (${request.name})`);

    return { success: true, state: newState };
  }

  /**
   * Update an existing custom work state
   */
  updateWorkState(
    stateId: string,
    updates: UpdateWorkStateRequest
  ): { success: boolean; state?: WorkStateConfig; error?: string } {
    const config = this.workStateConfigs.get(stateId);
    if (!config) {
      return { success: false, error: 'Work state not found' };
    }

    // Cannot modify system states
    if (config.isSystemState) {
      return { success: false, error: 'Cannot modify system work states' };
    }

    // Check name uniqueness if updating name
    if (updates.name && updates.name !== config.name) {
      const existingByName = this.getAllWorkStates().find(
        (s) => s.name.toLowerCase() === updates.name!.toLowerCase() && s.id !== stateId
      );
      if (existingByName) {
        return { success: false, error: `Work state with name "${updates.name}" already exists` };
      }
    }

    const updated: WorkStateConfig = {
      ...config,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.color !== undefined && { color: updates.color }),
      ...(updates.icon !== undefined && { icon: updates.icon }),
      ...(updates.agentSelectable !== undefined && { agentSelectable: updates.agentSelectable }),
      ...(updates.isBillable !== undefined && { isBillable: updates.isBillable }),
      ...(updates.maxDurationMinutes !== undefined && { maxDurationMinutes: updates.maxDurationMinutes }),
      ...(updates.warnBeforeMax !== undefined && { warnBeforeMax: updates.warnBeforeMax }),
      ...(updates.warnMinutesBefore !== undefined && { warnMinutesBefore: updates.warnMinutesBefore }),
      ...(updates.requiresApproval !== undefined && { requiresApproval: updates.requiresApproval }),
      ...(updates.displayOrder !== undefined && { displayOrder: updates.displayOrder }),
      ...(updates.active !== undefined && { active: updates.active }),
    };

    this.workStateConfigs.set(stateId, updated);
    this.logger.log(`Updated work state: ${stateId}`);

    return { success: true, state: updated };
  }

  /**
   * Delete a custom work state
   */
  deleteWorkState(stateId: string): { success: boolean; error?: string } {
    const config = this.workStateConfigs.get(stateId);
    if (!config) {
      return { success: false, error: 'Work state not found' };
    }

    // Cannot delete system states
    if (config.isSystemState) {
      return { success: false, error: 'Cannot delete system work states' };
    }

    // Check if any agent is currently in this state
    const agentsInState = this.getAllActiveSessions().filter(
      (s) => s.currentState === stateId
    );
    if (agentsInState.length > 0) {
      return {
        success: false,
        error: `Cannot delete: ${agentsInState.length} agent(s) currently in this state`,
      };
    }

    this.workStateConfigs.delete(stateId);
    this.logger.log(`Deleted work state: ${stateId}`);

    return { success: true };
  }

  /**
   * Toggle work state active status
   */
  toggleWorkState(stateId: string): {
    success: boolean;
    state?: WorkStateConfig;
    error?: string;
  } {
    const config = this.workStateConfigs.get(stateId);
    if (!config) {
      return { success: false, error: 'Work state not found' };
    }

    if (config.isSystemState) {
      return { success: false, error: 'Cannot toggle system work states' };
    }

    // Check if any agent is in this state before disabling
    if (config.active) {
      const agentsInState = this.getAllActiveSessions().filter(
        (s) => s.currentState === stateId
      );
      if (agentsInState.length > 0) {
        return {
          success: false,
          error: `Cannot disable: ${agentsInState.length} agent(s) currently in this state`,
        };
      }
    }

    const updated: WorkStateConfig = {
      ...config,
      active: !config.active,
    };

    this.workStateConfigs.set(stateId, updated);
    this.logger.log(`Toggled work state ${stateId}: active=${updated.active}`);

    return { success: true, state: updated };
  }

  /**
   * Reorder custom work states
   */
  reorderWorkStates(stateIds: string[]): { success: boolean; error?: string } {
    // Validate all IDs exist and are custom states
    for (const id of stateIds) {
      const config = this.workStateConfigs.get(id);
      if (!config) {
        return { success: false, error: `Work state not found: ${id}` };
      }
      if (config.isSystemState) {
        return { success: false, error: 'Cannot reorder system work states' };
      }
    }

    // Get base order (after system states)
    const baseOrder = Math.max(...this.getSystemStates().map((s) => s.displayOrder)) + 1;

    // Update display orders
    stateIds.forEach((id, index) => {
      const config = this.workStateConfigs.get(id);
      if (config) {
        config.displayOrder = baseOrder + index;
        this.workStateConfigs.set(id, config);
      }
    });

    this.logger.log(`Reordered ${stateIds.length} custom work states`);
    return { success: true };
  }
}
