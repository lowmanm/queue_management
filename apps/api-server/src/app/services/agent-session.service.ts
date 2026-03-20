import { Injectable, Logger, Optional } from '@nestjs/common';
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
import { RedisService } from '../redis';
import { EventStoreService } from './event-store.service';

/** TTL for session keys in Redis — 8 hours */
const SESSION_TTL_SECONDS = 28800;

const sessionKey = (agentId: string) => `session:${agentId}`;

@Injectable()
export class AgentSessionService {
  private readonly logger = new Logger(AgentSessionService.name);

  // Write-through cache for single-instance performance
  private sessions = new Map<string, AgentSession>();
  private stateHistory: StateChangeEvent[] = [];
  private workStateConfigs = new Map<AgentWorkState, WorkStateConfig>();

  constructor(
    private readonly rbacService: RbacService,
    private readonly redisService: RedisService,
    @Optional()
    private readonly eventStore?: EventStoreService,
  ) {
    this.initializeWorkStates();
  }

  private initializeWorkStates(): void {
    SYSTEM_WORK_STATES.forEach((config) => {
      this.workStateConfigs.set(config.id, config);
    });
    DEFAULT_CUSTOM_STATES.forEach((config) => {
      this.workStateConfigs.set(config.id, config);
    });
    this.logger.log(`Initialized ${this.workStateConfigs.size} work state configurations`);
  }

  // === Private Redis helpers ===

  private serializeSession(session: AgentSession): string {
    return JSON.stringify(session);
  }

  private deserializeSession(json: string): AgentSession {
    return JSON.parse(json) as AgentSession;
  }

  private async persistSession(session: AgentSession): Promise<void> {
    this.sessions.set(session.agentId, session);
    await this.redisService.set(
      sessionKey(session.agentId),
      this.serializeSession(session),
      { ttl: SESSION_TTL_SECONDS }
    );
  }

  private async loadSession(agentId: string): Promise<AgentSession | null> {
    // Check local cache first
    const cached = this.sessions.get(agentId);
    if (cached) return cached;

    // Fall back to Redis
    const json = await this.redisService.get(sessionKey(agentId));
    if (!json) return null;
    try {
      const session = this.deserializeSession(json);
      this.sessions.set(agentId, session); // warm cache
      return session;
    } catch {
      return null;
    }
  }

  private async deleteSession(agentId: string): Promise<void> {
    this.sessions.delete(agentId);
    await this.redisService.del(sessionKey(agentId));
  }

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  async createSession(
    agentId: string,
    agentName: string,
    options?: {
      teamId?: string;
      ipAddress?: string;
      userAgent?: string;
      socketId?: string;
    }
  ): Promise<AgentSession> {
    const existing = await this.loadSession(agentId);
    if (existing && existing.isActive) {
      await this.endSession(agentId, 'SYSTEM_AUTO');
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

    await this.persistSession(session);
    this.recordStateChange(session.id, agentId, 'LOGGED_OUT', 'LOGGED_IN', 'LOGIN');
    this.logger.log(`Session created for agent ${agentId} (${agentName})`);
    return session;
  }

  async endSession(agentId: string, trigger: StateChangeTrigger = 'LOGOUT'): Promise<AgentSession | null> {
    const session = await this.loadSession(agentId);
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

    await this.persistSession(session);
    this.recordStateChange(session.id, agentId, previousState, 'LOGGED_OUT', trigger);
    this.logger.log(`Session ended for agent ${agentId}`);
    return session;
  }

  async getSession(agentId: string): Promise<AgentSession | null> {
    const session = await this.loadSession(agentId);
    return session?.isActive ? session : null;
  }

  async getAllActiveSessions(): Promise<AgentSession[]> {
    // Single-instance: use local cache
    if (this.sessions.size > 0) {
      return Array.from(this.sessions.values()).filter((s) => s.isActive);
    }

    // Multi-instance: load all session keys from Redis
    const keys = await this.redisService.scan('session:*');
    if (keys.length === 0) return [];

    const jsons = await this.redisService.mget(keys);
    const sessions: AgentSession[] = [];
    for (const json of jsons) {
      if (json) {
        try {
          const s = this.deserializeSession(json);
          if (s.isActive) sessions.push(s);
        } catch {
          // Skip malformed entries
        }
      }
    }
    return sessions;
  }

  async updateSocketId(agentId: string, socketId: string): Promise<void> {
    const session = await this.loadSession(agentId);
    if (session && session.isActive) {
      session.socketId = socketId;
      await this.persistSession(session);
    }
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  async changeState(
    agentId: string,
    request: StateChangeRequest,
    trigger: StateChangeTrigger = 'AGENT_REQUEST',
    options?: {
      taskId?: string;
      managerApproved?: boolean;
      approvedBy?: string;
    }
  ): Promise<{ success: boolean; session?: AgentSession; error?: string }> {
    const session = await this.loadSession(agentId);
    if (!session || !session.isActive) {
      return { success: false, error: 'No active session' };
    }

    const fromState = session.currentState;
    const toState = request.requestedState;

    if (!isValidStateTransition(fromState, toState)) {
      return {
        success: false,
        error: `Invalid transition from ${fromState} to ${toState}`,
      };
    }

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

    if (toState === 'READY' || toState === 'LOGGED_OUT') {
      session.currentTaskId = undefined;
    }
    if (options?.taskId) {
      session.currentTaskId = options.taskId;
    }

    await this.persistSession(session);

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

    // Emit agent.state_changed event (fire-and-forget)
    void this.eventStore?.emit({
      eventType: 'agent.state_changed',
      aggregateId: agentId,
      aggregateType: 'agent',
      payload: { fromState, toState, trigger, taskId: options?.taskId },
      agentId,
    });

    return { success: true, session };
  }

  async getCurrentState(agentId: string): Promise<AgentWorkState | null> {
    const session = await this.loadSession(agentId);
    return session?.isActive ? session.currentState : null;
  }

  async setReady(agentId: string): Promise<{ success: boolean; session?: AgentSession; error?: string }> {
    return this.changeState(agentId, { requestedState: 'READY' }, 'AGENT_REQUEST');
  }

  async handleTaskAssigned(agentId: string, taskId: string): Promise<{ success: boolean; session?: AgentSession; error?: string }> {
    return this.changeState(agentId, { requestedState: 'RESERVED' }, 'TASK_ASSIGNED', { taskId });
  }

  async handleTaskAccepted(agentId: string, taskId: string): Promise<{ success: boolean; session?: AgentSession; error?: string }> {
    return this.changeState(agentId, { requestedState: 'ACTIVE' }, 'TASK_ACCEPTED', { taskId });
  }

  async handleTaskRejected(agentId: string): Promise<{ success: boolean; session?: AgentSession; error?: string }> {
    return this.changeState(agentId, { requestedState: 'READY' }, 'TASK_REJECTED');
  }

  async handleTaskCompleted(agentId: string, taskId: string): Promise<{ success: boolean; session?: AgentSession; error?: string }> {
    return this.changeState(agentId, { requestedState: 'WRAP_UP' }, 'TASK_COMPLETED', { taskId });
  }

  async handleDispositionDone(agentId: string): Promise<{ success: boolean; session?: AgentSession; error?: string }> {
    return this.changeState(agentId, { requestedState: 'READY' }, 'DISPOSITION_DONE');
  }

  // ==========================================================================
  // STATE HISTORY (in-memory — bounded to 10k events)
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

    if (this.stateHistory.length > 10000) {
      this.stateHistory = this.stateHistory.slice(-10000);
    }
  }

  getStateHistory(agentId: string, limit = 100): StateChangeEvent[] {
    return this.stateHistory
      .filter((e) => e.agentId === agentId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  getSessionHistory(sessionId: string): StateChangeEvent[] {
    return this.stateHistory
      .filter((e) => e.sessionId === sessionId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

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

  async getAgentSessionSummary(agentId: string): Promise<AgentSessionSummary | null> {
    const session = await this.loadSession(agentId);
    if (!session) return null;

    const stateConfig = this.workStateConfigs.get(session.currentState)!;
    const now = Date.now();
    const timeInCurrentState = Math.floor(
      (now - new Date(session.lastStateChangeAt).getTime()) / 1000
    );

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
      tasksCompletedToday: 0,
      avgHandleTimeToday: 0,
      utilizationPercent,
    };
  }

  async getTeamSessionSummary(teamId: string): Promise<TeamSessionSummary> {
    const team = this.rbacService.getTeamById(teamId);
    const teamAgents = this.rbacService.getUsersByTeam(teamId);
    const activeSessions = (await this.getAllActiveSessions()).filter(
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

  async getAllTeamSummaries(): Promise<TeamSessionSummary[]> {
    const teams = this.rbacService.getAllTeams();
    return Promise.all(teams.map((team) => this.getTeamSessionSummary(team.id)));
  }

  // ==========================================================================
  // WORK STATE CONFIG (in-memory — seeded from SYSTEM_WORK_STATES)
  // ==========================================================================

  getAllWorkStates(): WorkStateConfig[] {
    return Array.from(this.workStateConfigs.values()).sort(
      (a, b) => a.displayOrder - b.displayOrder
    );
  }

  getWorkStateById(stateId: AgentWorkState): WorkStateConfig | undefined {
    return this.workStateConfigs.get(stateId);
  }

  getAgentSelectableStates(): WorkStateConfig[] {
    return this.getAllWorkStates().filter((s) => s.agentSelectable && s.active);
  }

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

  getSystemStates(): WorkStateConfig[] {
    return this.getAllWorkStates().filter((s) => s.isSystemState);
  }

  getCustomStates(): WorkStateConfig[] {
    return this.getAllWorkStates().filter((s) => !s.isSystemState);
  }

  createWorkState(request: CreateWorkStateRequest): {
    success: boolean;
    state?: WorkStateConfig;
    error?: string;
  } {
    const stateId = generateWorkStateId(request.name);

    const existingByName = this.getAllWorkStates().find(
      (s) => s.name.toLowerCase() === request.name.toLowerCase()
    );
    if (existingByName) {
      return { success: false, error: `Work state with name "${request.name}" already exists` };
    }

    const maxOrder = Math.max(
      ...this.getAllWorkStates().map((s) => s.displayOrder),
      0
    );

    const newState: WorkStateConfig = {
      id: stateId,
      name: request.name,
      category: 'unavailable',
      color: request.color,
      icon: request.icon,
      agentSelectable: request.agentSelectable,
      isProductive: false,
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

  updateWorkState(
    stateId: string,
    updates: UpdateWorkStateRequest
  ): { success: boolean; state?: WorkStateConfig; error?: string } {
    const config = this.workStateConfigs.get(stateId);
    if (!config) {
      return { success: false, error: 'Work state not found' };
    }

    if (config.isSystemState) {
      return { success: false, error: 'Cannot modify system work states' };
    }

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

  async deleteWorkState(stateId: string): Promise<{ success: boolean; error?: string }> {
    const config = this.workStateConfigs.get(stateId);
    if (!config) {
      return { success: false, error: 'Work state not found' };
    }

    if (config.isSystemState) {
      return { success: false, error: 'Cannot delete system work states' };
    }

    const agentsInState = (await this.getAllActiveSessions()).filter(
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

  async toggleWorkState(stateId: string): Promise<{
    success: boolean;
    state?: WorkStateConfig;
    error?: string;
  }> {
    const config = this.workStateConfigs.get(stateId);
    if (!config) {
      return { success: false, error: 'Work state not found' };
    }

    if (config.isSystemState) {
      return { success: false, error: 'Cannot toggle system work states' };
    }

    if (config.active) {
      const agentsInState = (await this.getAllActiveSessions()).filter(
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

  reorderWorkStates(stateIds: string[]): { success: boolean; error?: string } {
    for (const id of stateIds) {
      const config = this.workStateConfigs.get(id);
      if (!config) {
        return { success: false, error: `Work state not found: ${id}` };
      }
      if (config.isSystemState) {
        return { success: false, error: 'Cannot reorder system work states' };
      }
    }

    const baseOrder = Math.max(...this.getSystemStates().map((s) => s.displayOrder)) + 1;

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
