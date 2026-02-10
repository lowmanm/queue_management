import { Controller, Get, Post, Param, Body, Query, Logger } from '@nestjs/common';
import { AgentManagerService, ConnectedAgent } from '../services/agent-manager.service';
import { RbacService } from '../services/rbac.service';
import { DispositionService } from '../services/disposition.service';
import { AgentState } from '@nexus-queue/shared-models';

interface AgentMetrics {
  tasksCompleted: number;
  avgHandleTime: number;
  tasksPerHour: number;
}

interface AgentWithMetrics extends ConnectedAgent {
  teamId?: string;
  teamName?: string;
  metrics: AgentMetrics;
  timeInState: number;
}

interface TeamAgentSummary {
  totalAgents: number;
  onlineAgents: number;
  activeAgents: number;
  idleAgents: number;
  pausedAgents: number;
  totalTasksCompleted: number;
  avgHandleTime: number;
  avgTasksPerHour: number;
}

@Controller('agents')
export class AgentsController {
  private readonly logger = new Logger(AgentsController.name);

  constructor(
    private readonly agentManager: AgentManagerService,
    private readonly rbacService: RbacService,
    private readonly dispositionService: DispositionService
  ) {}

  /**
   * Get all connected agents with optional filters
   */
  @Get()
  getAllAgents(
    @Query('teamId') teamId?: string,
    @Query('state') state?: AgentState
  ): AgentWithMetrics[] {
    let agents = this.agentManager.getAllAgents();

    // Filter by state if provided
    if (state) {
      agents = agents.filter((a) => a.state === state);
    }

    // Enrich with team info and metrics
    return agents.map((agent) => this.enrichAgent(agent, teamId));
  }

  /**
   * Get agents for a specific team
   */
  @Get('team/:teamId')
  getTeamAgents(@Param('teamId') teamId: string): AgentWithMetrics[] {
    // Get team members from RBAC
    const teamMembers = this.rbacService.getUsersByTeam(teamId);
    const memberIds = teamMembers.map((m) => m.id);

    // Get connected agents that are team members
    const allAgents = this.agentManager.getAllAgents();
    const teamAgents = allAgents.filter((a) => memberIds.includes(a.agentId));

    // Also include offline team members for complete picture
    const connectedIds = teamAgents.map((a) => a.agentId);
    const offlineMembers = teamMembers
      .filter((m) => !connectedIds.includes(m.id))
      .map((m) => this.createOfflineAgent(m, teamId));

    const allTeamAgents = [...teamAgents.map((a) => this.enrichAgent(a, teamId)), ...offlineMembers];

    return allTeamAgents;
  }

  /**
   * Get team summary statistics
   */
  @Get('team/:teamId/summary')
  getTeamSummary(@Param('teamId') teamId: string): TeamAgentSummary {
    const agents = this.getTeamAgents(teamId);

    const online = agents.filter((a) => a.state !== 'OFFLINE');
    const active = agents.filter((a) =>
      ['ACTIVE', 'WRAP_UP', 'RESERVED'].includes(a.state)
    );
    const idle = agents.filter((a) => a.state === 'IDLE');
    const paused = agents.filter((a) =>
      ['BREAK', 'LUNCH', 'TRAINING', 'MEETING', 'PAUSED'].includes(a.state as string)
    );

    const totalTasks = agents.reduce((sum, a) => sum + a.metrics.tasksCompleted, 0);
    const avgTPH =
      online.length > 0
        ? online.reduce((sum, a) => sum + a.metrics.tasksPerHour, 0) / online.length
        : 0;
    const avgAHT =
      online.length > 0
        ? online.reduce((sum, a) => sum + a.metrics.avgHandleTime, 0) / online.length
        : 0;

    return {
      totalAgents: agents.length,
      onlineAgents: online.length,
      activeAgents: active.length,
      idleAgents: idle.length,
      pausedAgents: paused.length,
      totalTasksCompleted: totalTasks,
      avgHandleTime: Math.round(avgAHT),
      avgTasksPerHour: Math.round(avgTPH * 10) / 10,
    };
  }

  /**
   * Get a specific agent's details
   */
  @Get(':agentId')
  getAgent(@Param('agentId') agentId: string): AgentWithMetrics | null {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent) {
      // Check if user exists but is offline
      const user = this.rbacService.getUserById(agentId);
      if (user) {
        return this.createOfflineAgent(user);
      }
      return null;
    }
    return this.enrichAgent(agent);
  }

  /**
   * Get agent's current state
   */
  @Get(':agentId/state')
  getAgentState(@Param('agentId') agentId: string): { state: AgentState; timeInState: number } | null {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent) {
      return { state: 'OFFLINE', timeInState: 0 };
    }
    return {
      state: agent.state,
      timeInState: this.calculateTimeInState(agent),
    };
  }

  /**
   * Update agent state (for break/lunch requests)
   */
  @Post(':agentId/state')
  updateAgentState(
    @Param('agentId') agentId: string,
    @Body() body: { state: AgentState; reason?: string }
  ): { success: boolean; agent?: AgentWithMetrics } {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent) {
      return { success: false };
    }

    this.agentManager.updateAgentState(agentId, body.state);
    this.logger.log(`Agent ${agentId} state changed to ${body.state}${body.reason ? ` (${body.reason})` : ''}`);

    return {
      success: true,
      agent: this.enrichAgent(this.agentManager.getAgent(agentId)!),
    };
  }

  /**
   * Get all online agents (across all teams)
   */
  @Get('status/online')
  getOnlineAgents(): AgentWithMetrics[] {
    return this.agentManager
      .getAllAgents()
      .map((agent) => this.enrichAgent(agent));
  }

  /**
   * Get agent count by state
   */
  @Get('status/counts')
  getAgentCounts(): Record<string, number> {
    const agents = this.agentManager.getAllAgents();
    const counts: Record<string, number> = {
      total: agents.length,
      IDLE: 0,
      RESERVED: 0,
      ACTIVE: 0,
      WRAP_UP: 0,
      OFFLINE: 0,
    };

    agents.forEach((a) => {
      counts[a.state] = (counts[a.state] || 0) + 1;
    });

    return counts;
  }

  /**
   * Enrich agent with team info and metrics
   */
  private enrichAgent(agent: ConnectedAgent, teamId?: string): AgentWithMetrics {
    const user = this.rbacService.getUserById(agent.agentId);
    const metrics = this.getAgentMetrics(agent.agentId);

    return {
      ...agent,
      teamId: user?.teamId || teamId,
      teamName: user?.teamId ? this.getTeamName(user.teamId) : undefined,
      metrics,
      timeInState: this.calculateTimeInState(agent),
    };
  }

  /**
   * Create an offline agent entry from user data
   */
  private createOfflineAgent(user: { id: string; displayName: string; teamId?: string }, teamId?: string): AgentWithMetrics {
    return {
      socketId: '',
      agentId: user.id,
      name: user.displayName,
      state: 'OFFLINE',
      connectedAt: new Date(),
      lastStateChangeAt: new Date(),
      teamId: user.teamId || teamId,
      teamName: user.teamId ? this.getTeamName(user.teamId) : undefined,
      metrics: this.getAgentMetrics(user.id),
      timeInState: 0,
    };
  }

  /**
   * Get agent metrics from disposition completions
   */
  private getAgentMetrics(agentId: string): AgentMetrics {
    const completions = this.dispositionService.getAgentCompletions(agentId);
    const tasksCompleted = completions.length;

    if (tasksCompleted === 0) {
      return { tasksCompleted: 0, avgHandleTime: 0, tasksPerHour: 0 };
    }

    const totalHandleTime = completions.reduce((sum, c) => sum + c.handleTime, 0);
    const avgHandleTime = Math.round(totalHandleTime / tasksCompleted);

    // Calculate tasks per hour based on session duration
    const agent = this.agentManager.getAgent(agentId);
    let tasksPerHour = 0;
    if (agent) {
      const sessionMinutes = (Date.now() - agent.connectedAt.getTime()) / 60000;
      if (sessionMinutes > 0) {
        tasksPerHour = Math.round((tasksCompleted / sessionMinutes) * 60 * 10) / 10;
      }
    }

    return { tasksCompleted, avgHandleTime, tasksPerHour };
  }

  /**
   * Calculate seconds in current state
   */
  private calculateTimeInState(agent: ConnectedAgent): number {
    return Math.floor((Date.now() - agent.lastStateChangeAt.getTime()) / 1000);
  }

  /**
   * Get team name by ID
   */
  private getTeamName(teamId: string): string {
    const team = this.rbacService.getTeamById(teamId);
    return team?.name || teamId;
  }
}
