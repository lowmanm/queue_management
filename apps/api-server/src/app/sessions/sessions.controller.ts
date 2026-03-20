import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
  StateChangeTrigger,
  CreateWorkStateRequest,
  UpdateWorkStateRequest,
} from '@nexus-queue/shared-models';

@Controller('sessions')
export class SessionsController {
  private readonly logger = new Logger(SessionsController.name);

  constructor(private readonly sessionService: AgentSessionService) {}

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  @Get()
  async getAllActiveSessions() {
    return this.sessionService.getAllActiveSessions();
  }

  @Get('agent/:agentId')
  async getAgentSession(@Param('agentId') agentId: string) {
    return (await this.sessionService.getSession(agentId)) || null;
  }

  @Post('login')
  async login(
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

  @Post('logout')
  async logout(@Body() body: { agentId: string }) {
    const session = await this.sessionService.endSession(body.agentId);
    if (!session) {
      throw new HttpException('No active session', HttpStatus.NOT_FOUND);
    }
    return session;
  }

  @Get('agent/:agentId/summary')
  async getAgentSessionSummary(@Param('agentId') agentId: string) {
    const summary = await this.sessionService.getAgentSessionSummary(agentId);
    if (!summary) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }
    return summary;
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  @Get('agent/:agentId/state')
  async getAgentState(@Param('agentId') agentId: string) {
    const state = await this.sessionService.getCurrentState(agentId);
    if (!state) {
      return { state: 'LOGGED_OUT' };
    }
    return { state };
  }

  @Post('agent/:agentId/state')
  async changeState(
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
    const result = await this.sessionService.changeState(
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

  @Post('agent/:agentId/ready')
  async setReady(@Param('agentId') agentId: string) {
    const result = await this.sessionService.setReady(agentId);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to set ready', HttpStatus.BAD_REQUEST);
    }
    return result.session;
  }

  // ==========================================================================
  // STATE HISTORY
  // ==========================================================================

  @Get('agent/:agentId/history')
  getAgentHistory(
    @Param('agentId') agentId: string,
    @Query('limit') limit?: string
  ) {
    return this.sessionService.getStateHistory(agentId, limit ? parseInt(limit, 10) : 100);
  }

  @Get('history/today')
  getTodayHistory() {
    return this.sessionService.getTodayHistory();
  }

  // ==========================================================================
  // TEAM SUMMARIES
  // ==========================================================================

  @Get('team/:teamId/summary')
  async getTeamSummary(@Param('teamId') teamId: string) {
    return this.sessionService.getTeamSessionSummary(teamId);
  }

  @Get('teams/summary')
  async getAllTeamSummaries() {
    return this.sessionService.getAllTeamSummaries();
  }

  // ==========================================================================
  // WORK STATE CONFIG
  // ==========================================================================

  @Get('work-states')
  getAllWorkStates() {
    return this.sessionService.getAllWorkStates();
  }

  @Get('work-states/system')
  getSystemStates() {
    return this.sessionService.getSystemStates();
  }

  @Get('work-states/custom')
  getCustomStates() {
    return this.sessionService.getCustomStates();
  }

  @Get('work-states/selectable')
  getSelectableStates() {
    return this.sessionService.getAgentSelectableStates();
  }

  @Get('work-states/:stateId')
  getWorkState(@Param('stateId') stateId: string) {
    const config = this.sessionService.getWorkStateById(stateId);
    if (!config) {
      throw new HttpException('Work state not found', HttpStatus.NOT_FOUND);
    }
    return config;
  }

  @Post('work-states')
  createWorkState(@Body() request: CreateWorkStateRequest) {
    const result = this.sessionService.createWorkState(request);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to create work state', HttpStatus.BAD_REQUEST);
    }
    return result.state;
  }

  @Put('work-states/:stateId')
  updateWorkState(
    @Param('stateId') stateId: string,
    @Body() updates: UpdateWorkStateRequest
  ) {
    const result = this.sessionService.updateWorkState(stateId, updates);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to update work state', HttpStatus.BAD_REQUEST);
    }
    return result.state;
  }

  @Delete('work-states/:stateId')
  async deleteWorkState(@Param('stateId') stateId: string) {
    const result = await this.sessionService.deleteWorkState(stateId);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to delete work state', HttpStatus.BAD_REQUEST);
    }
    return { success: true, message: 'Work state deleted' };
  }

  @Post('work-states/:stateId/toggle')
  async toggleWorkState(@Param('stateId') stateId: string) {
    const result = await this.sessionService.toggleWorkState(stateId);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to toggle work state', HttpStatus.BAD_REQUEST);
    }
    return result.state;
  }

  @Post('work-states/reorder')
  reorderWorkStates(@Body() body: { stateIds: string[] }) {
    const result = this.sessionService.reorderWorkStates(body.stateIds);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to reorder work states', HttpStatus.BAD_REQUEST);
    }
    return { success: true, message: 'Work states reordered' };
  }
}
