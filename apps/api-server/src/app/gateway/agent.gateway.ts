import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { AgentState, Task } from '@nexus-queue/shared-models';
import { AgentManagerService } from '../services/agent-manager.service';
import { TaskDistributorService } from '../services/task-distributor.service';

interface AgentConnectPayload {
  agentId: string;
  name: string;
}

interface AgentStateChangePayload {
  agentId: string;
  state: AgentState;
}

interface TaskActionPayload {
  agentId: string;
  taskId: string;
  action: 'accept' | 'reject' | 'complete' | 'transfer';
  dispositionCode?: string;
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:4200'],
    credentials: true,
  },
  namespace: '/queue',
})
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentGateway.name);

  constructor(
    private readonly agentManager: AgentManagerService,
    private readonly taskDistributor: TaskDistributorService
  ) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.agentManager.removeAgentBySocketId(client.id);
  }

  /**
   * Agent connects and registers with the system
   */
  @SubscribeMessage('agent:connect')
  handleAgentConnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AgentConnectPayload
  ): void {
    this.logger.log(`Agent connecting: ${payload.agentId} (${payload.name})`);

    this.agentManager.registerAgent({
      socketId: client.id,
      agentId: payload.agentId,
      name: payload.name,
      state: 'IDLE',
    });

    // Acknowledge connection
    client.emit('connection:ack', {
      agentId: payload.agentId,
      status: 'connected',
    });

    // Immediately try to assign a task (Force Mode)
    this.tryAssignTask(payload.agentId);
  }

  /**
   * Agent signals they are ready for work (IDLE state)
   */
  @SubscribeMessage('agent:ready')
  handleAgentReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { agentId: string }
  ): void {
    this.logger.log(`Agent ready: ${payload.agentId}`);

    this.agentManager.updateAgentState(payload.agentId, 'IDLE');

    // Try to assign a task immediately (Force Mode)
    this.tryAssignTask(payload.agentId);
  }

  /**
   * Agent state change notification
   */
  @SubscribeMessage('agent:state-change')
  handleAgentStateChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AgentStateChangePayload
  ): void {
    this.logger.log(`Agent ${payload.agentId} state changed to: ${payload.state}`);

    this.agentManager.updateAgentState(payload.agentId, payload.state);

    // If agent becomes IDLE, try to assign a task
    if (payload.state === 'IDLE') {
      this.tryAssignTask(payload.agentId);
    }
  }

  /**
   * Agent performs an action on a task
   */
  @SubscribeMessage('agent:task-action')
  handleTaskAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TaskActionPayload
  ): void {
    this.logger.log(
      `Agent ${payload.agentId} action: ${payload.action} on task ${payload.taskId}`
    );

    switch (payload.action) {
      case 'accept':
        this.agentManager.updateAgentState(payload.agentId, 'ACTIVE');
        break;
      case 'reject':
        this.agentManager.updateAgentState(payload.agentId, 'IDLE');
        // Try to assign a new task
        this.tryAssignTask(payload.agentId);
        break;
      case 'complete':
        this.agentManager.updateAgentState(payload.agentId, 'WRAP_UP');
        break;
      case 'transfer':
        this.agentManager.updateAgentState(payload.agentId, 'IDLE');
        // Try to assign a new task
        this.tryAssignTask(payload.agentId);
        break;
    }
  }

  /**
   * Agent completes disposition (wrap-up done)
   */
  @SubscribeMessage('agent:disposition-complete')
  handleDispositionComplete(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { agentId: string; taskId: string; dispositionCode: string }
  ): void {
    this.logger.log(`Agent ${payload.agentId} completed disposition for task ${payload.taskId}`);

    this.agentManager.updateAgentState(payload.agentId, 'IDLE');

    // Try to assign a new task (Force Mode)
    this.tryAssignTask(payload.agentId);
  }

  /**
   * Push a task to a specific agent
   */
  pushTaskToAgent(agentId: string, task: Task): boolean {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent) {
      this.logger.warn(`Cannot push task: Agent ${agentId} not found`);
      return false;
    }

    this.logger.log(`Pushing task ${task.id} to agent ${agentId}`);
    this.server.to(agent.socketId).emit('task:assigned', task);
    this.agentManager.updateAgentState(agentId, 'RESERVED');

    return true;
  }

  /**
   * Notify agent of task timeout
   */
  notifyTaskTimeout(agentId: string, taskId: string): void {
    const agent = this.agentManager.getAgent(agentId);
    if (agent) {
      this.server.to(agent.socketId).emit('task:timeout', { taskId });
      this.agentManager.updateAgentState(agentId, 'IDLE');
    }
  }

  /**
   * Try to assign a task to an agent (Force Mode)
   */
  private tryAssignTask(agentId: string): void {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent || agent.state !== 'IDLE') {
      return;
    }

    const task = this.taskDistributor.getNextTaskForAgent(agentId);
    if (task) {
      this.pushTaskToAgent(agentId, task);
    }
  }
}
