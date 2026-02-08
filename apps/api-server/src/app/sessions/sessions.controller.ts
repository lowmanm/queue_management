import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AgentSessionService } from '../services/agent-session.service';
import {
  AgentWorkState,
  StateChangeRequest,
  StateChangeTrigger,
  WorkStateConfig,
} from '@nexus-queue/shared-models';

@Controller('sessions')
export class SessionsController {
  private readonly logger = new Logger(SessionsController.name);

  constructor(private readonly sessionService: AgentSessionService) {}

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  /**
   * Get all active sessions
   */
  @Get()
  getAllActiveSessions() {
    return this.sessionService.getAllActiveSessions();
  }

  /**
   * Get session for a specific agent
   */
  @Get('agent/:agentId')
  getAgentSession(@Param('agentId') agentId: string) {
    const session = this.sessionService.getSession(agentId);
    if (!session) {
      throw new HttpException('No active session', HttpStatus.NOT_FOUND);
    }
    return session;
  }

  /**
   * Create a new session (login)
   */
  @Post('login')
  login(
    @Body()
    body: {
      agentId: string;
      agentName: string;
      teamId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ) {
    return this.sessionService.createSession(body.agentId, body.agentName, {
      teamId: body.teamId,
      ipAddress: body.ipAddress,
      userAgent: body.userAgent,
    });
  }

  /**
   * End a session (logout)
   */
  @Post('logout')
  logout(@Body() body: { agentId: string }) {
    const session = this.sessionService.endSession(body.agentId);
    if (!session) {
      throw new HttpException('No active session', HttpStatus.NOT_FOUND);
    }
    return session;
  }

  /**
   * Get session summary for an agent
   */
  @Get('agent/:agentId/summary')
  getAgentSessionSummary(@Param('agentId') agentId: string) {
    const summary = this.sessionService.getAgentSessionSummary(agentId);
    if (!summary) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }
    return summary;
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  /**
   * Get current state for an agent
   */
  @Get('agent/:agentId/state')
  getAgentState(@Param('agentId') agentId: string) {
    const state = this.sessionService.getCurrentState(agentId);
    if (!state) {
      return { state: 'LOGGED_OUT' };
    }
    return { state };
  }

  /**
   * Change agent state
   */
  @Post('agent/:agentId/state')
  changeState(
    @Param('agentId') agentId: string,
    @Body()
    body: {
      requestedState: AgentWorkState;
      reason?: string;
      expectedDuration?: number;
      trigger?: StateChangeTrigger;
      taskId?: string;
      managerApproved?: boolean;
      approvedBy?: string;
    }
  ) {
    const result = this.sessionService.changeState(
      agentId,
      {
        requestedState: body.requestedState,
        reason: body.reason,
        expectedDuration: body.expectedDuration,
      },
      body.trigger || 'AGENT_REQUEST',
      {
        taskId: body.taskId,
        managerApproved: body.managerApproved,
        approvedBy: body.approvedBy,
      }
    );

    if (!result.success) {
      throw new HttpException(result.error || 'State change failed', HttpStatus.BAD_REQUEST);
    }

    return result.session;
  }

  /**
   * Set agent to ready
   */
  @Post('agent/:agentId/ready')
  setReady(@Param('agentId') agentId: string) {
    const result = this.sessionService.setReady(agentId);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to set ready', HttpStatus.BAD_REQUEST);
    }
    return result.session;
  }

  // ==========================================================================
  // STATE HISTORY
  // ==========================================================================

  /**
   * Get state history for an agent
   */
  @Get('agent/:agentId/history')
  getAgentHistory(
    @Param('agentId') agentId: string,
    @Query('limit') limit?: string
  ) {
    return this.sessionService.getStateHistory(agentId, limit ? parseInt(limit, 10) : 100);
  }

  /**
   * Get today's state history
   */
  @Get('history/today')
  getTodayHistory() {
    return this.sessionService.getTodayHistory();
  }

  // ==========================================================================
  // TEAM SUMMARIES
  // ==========================================================================

  /**
   * Get team session summary
   */
  @Get('team/:teamId/summary')
  getTeamSummary(@Param('teamId') teamId: string) {
    return this.sessionService.getTeamSessionSummary(teamId);
  }

  /**
   * Get all team summaries
   */
  @Get('teams/summary')
  getAllTeamSummaries() {
    return this.sessionService.getAllTeamSummaries();
  }

  // ==========================================================================
  // WORK STATE CONFIG
  // ==========================================================================

  /**
   * Get all work state configurations
   */
  @Get('work-states')
  getAllWorkStates() {
    return this.sessionService.getAllWorkStates();
  }

  /**
   * Get work state by ID
   */
  @Get('work-states/:stateId')
  getWorkState(@Param('stateId') stateId: AgentWorkState) {
    const config = this.sessionService.getWorkStateById(stateId);
    if (!config) {
      throw new HttpException('Work state not found', HttpStatus.NOT_FOUND);
    }
    return config;
  }

  /**
   * Get agent-selectable states
   */
  @Get('work-states/selectable')
  getSelectableStates() {
    return this.sessionService.getAgentSelectableStates();
  }

  /**
   * Update work state configuration
   */
  @Put('work-states/:stateId')
  updateWorkState(
    @Param('stateId') stateId: AgentWorkState,
    @Body() updates: Partial<WorkStateConfig>
  ) {
    const config = this.sessionService.updateWorkStateConfig(stateId, updates);
    if (!config) {
      throw new HttpException('Work state not found', HttpStatus.NOT_FOUND);
    }
    return config;
  }
}
