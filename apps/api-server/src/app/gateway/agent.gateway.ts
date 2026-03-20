import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { AgentState, Task, TaskStatus } from '@nexus-queue/shared-models';
import { AgentManagerService, ConnectedAgent } from '../services/agent-manager.service';
import { TaskDistributorService } from '../services/task-distributor.service';
import { QueueManagerService, QueuedTask } from '../services/queue-manager.service';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';
import { TaskStoreService } from '../services/task-store.service';
import { SLAMonitorService, SLABreachEvent } from '../services/sla-monitor.service';
import { PipelineMetricsService } from '../services/pipeline-metrics.service';
import { EventStoreService } from '../services/event-store.service';

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
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentGateway.name);

  constructor(
    private readonly agentManager: AgentManagerService,
    private readonly taskDistributor: TaskDistributorService,
    @Optional()
    @Inject(forwardRef(() => QueueManagerService))
    private readonly queueManager?: QueueManagerService,
    @Optional()
    @Inject(forwardRef(() => PipelineOrchestratorService))
    private readonly orchestrator?: PipelineOrchestratorService,
    @Optional()
    @Inject(forwardRef(() => TaskStoreService))
    private readonly taskStore?: TaskStoreService,
    @Optional()
    @Inject(forwardRef(() => SLAMonitorService))
    private readonly slaMonitor?: SLAMonitorService,
    @Optional()
    @Inject(forwardRef(() => PipelineMetricsService))
    private readonly pipelineMetrics?: PipelineMetricsService,
    @Optional()
    @Inject(forwardRef(() => EventStoreService))
    private readonly eventStore?: EventStoreService,
  ) {}

  afterInit(): void {
    if (this.orchestrator) {
      this.orchestrator.onTaskEnqueued((queueId: string) => {
        void this.tryDistributeFromQueue(queueId);
      });
      this.logger.log('Registered distribution callback with PipelineOrchestrator');
    }

    if (this.slaMonitor) {
      this.slaMonitor.onBreach((event: SLABreachEvent) => {
        this.server?.emit('sla:breach', event);
      });
      this.slaMonitor.start();
      this.logger.log('SLA Monitor started via gateway init');
    }

    if (this.pipelineMetrics) {
      setInterval(() => this.broadcastPipelineMetrics(), 10_000);
      this.logger.log('Pipeline metrics broadcast scheduled (10s interval)');
    }
  }

  private broadcastPipelineMetrics(): void {
    if (!this.pipelineMetrics || !this.server) return;
    this.pipelineMetrics
      .getAllPipelineMetrics()
      .then((summary) => {
        this.server.emit('pipeline:metrics', summary);
      })
      .catch((err) => {
        this.logger.warn(`Failed to broadcast pipeline metrics: ${err}`);
      });
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id} | Transport: ${client.conn.transport.name} | IP: ${client.handshake.address}`);
  }

  handleDisconnect(client: Socket): void {
    const agent = this.agentManager.getAgentBySocketId(client.id);
    const agentInfo = agent ? ` (Agent: ${agent.agentId})` : '';
    this.logger.log(`Client disconnected: ${client.id}${agentInfo} | Reason: socket closed`);

    if (agent && agent.currentTaskId) {
      const activeStates: AgentState[] = ['ACTIVE', 'RESERVED', 'WRAP_UP'];
      if (activeStates.includes(agent.state)) {
        this.logger.warn(
          `Agent ${agent.agentId} disconnected with task ${agent.currentTaskId} in ${agent.state} state — requeueing task`
        );
        void this.requeueTask(agent.currentTaskId, 'agent_disconnected');
      }
    }

    void this.agentManager.removeAgentBySocketId(client.id);
  }

  @SubscribeMessage('agent:connect')
  async handleAgentConnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AgentConnectPayload
  ): Promise<void> {
    this.logger.log(`Agent connecting: ${payload.agentId} (${payload.name})`);

    await this.agentManager.registerAgent({
      socketId: client.id,
      agentId: payload.agentId,
      name: payload.name,
      state: 'IDLE',
    });

    client.emit('connection:ack', {
      agentId: payload.agentId,
      status: 'connected',
    });

    void this.tryAssignTask(payload.agentId);
  }

  @SubscribeMessage('agent:disconnect')
  handleAgentDisconnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() _payload: { agentId: string }
  ): void {
    this.logger.log(`Agent graceful disconnect: ${_payload.agentId}`);
    this.handleDisconnect(client);
  }

  @SubscribeMessage('agent:ready')
  async handleAgentReady(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { agentId: string }
  ): Promise<void> {
    this.logger.log(`Agent ready: ${payload.agentId}`);

    await this.agentManager.updateAgentState(payload.agentId, 'IDLE');
    void this.tryAssignTask(payload.agentId);
  }

  @SubscribeMessage('agent:state-change')
  async handleAgentStateChange(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: AgentStateChangePayload
  ): Promise<void> {
    this.logger.log(`Agent ${payload.agentId} state changed to: ${payload.state}`);

    await this.agentManager.updateAgentState(payload.agentId, payload.state);

    if (payload.state === 'IDLE') {
      void this.tryAssignTask(payload.agentId);
    }
  }

  @SubscribeMessage('agent:task-action')
  async handleTaskAction(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: TaskActionPayload
  ): Promise<void> {
    this.logger.log(
      `Agent ${payload.agentId} action: ${payload.action} on task ${payload.taskId}`
    );

    switch (payload.action) {
      case 'accept':
        await this.agentManager.updateAgentState(payload.agentId, 'ACTIVE');
        await this.taskStore?.updateStatus(payload.taskId, 'ACTIVE' as TaskStatus, {
          assignedAgentId: payload.agentId,
        });
        void this.eventStore?.emit({
          eventType: 'task.accepted',
          aggregateId: payload.taskId,
          aggregateType: 'task',
          payload: { agentId: payload.agentId },
          agentId: payload.agentId,
        });
        break;
      case 'reject':
        await this.agentManager.clearAgentTask(payload.agentId);
        await this.agentManager.updateAgentState(payload.agentId, 'IDLE');
        await this.requeueTask(payload.taskId, 'agent_rejected');
        await this.tryAssignTask(payload.agentId);
        void this.eventStore?.emit({
          eventType: 'task.rejected',
          aggregateId: payload.taskId,
          aggregateType: 'task',
          payload: { agentId: payload.agentId, reason: 'agent_rejected' },
          agentId: payload.agentId,
        });
        break;
      case 'complete':
        await this.agentManager.updateAgentState(payload.agentId, 'WRAP_UP');
        await this.taskStore?.updateStatus(payload.taskId, 'WRAP_UP' as TaskStatus);
        break;
      case 'transfer':
        await this.agentManager.clearAgentTask(payload.agentId);
        await this.agentManager.updateAgentState(payload.agentId, 'IDLE');
        await this.taskStore?.updateStatus(payload.taskId, 'TRANSFERRED' as TaskStatus);
        await this.tryAssignTask(payload.agentId);
        break;
    }
  }

  @SubscribeMessage('agent:disposition-complete')
  async handleDispositionComplete(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { agentId: string; taskId: string; dispositionCode: string }
  ): Promise<void> {
    this.logger.log(`Agent ${payload.agentId} completed disposition for task ${payload.taskId}`);

    await this.agentManager.clearAgentTask(payload.agentId);
    await this.agentManager.updateAgentState(payload.agentId, 'IDLE');
    await this.taskStore?.updateStatus(payload.taskId, 'COMPLETED' as TaskStatus, {
      completedAt: new Date().toISOString(),
    });

    void this.eventStore?.emit({
      eventType: 'task.completed',
      aggregateId: payload.taskId,
      aggregateType: 'task',
      payload: { agentId: payload.agentId, dispositionCode: payload.dispositionCode },
      agentId: payload.agentId,
    });

    await this.tryAssignTask(payload.agentId);
  }

  /**
   * Push a task to a specific agent (Force-Push Mode).
   */
  async pushTaskToAgent(agentId: string, task: Task): Promise<boolean> {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent) {
      this.logger.warn(`Cannot push task: Agent ${agentId} not found`);
      return false;
    }

    this.logger.log(`Force-pushing task ${task.id} to agent ${agentId}`);
    this.server.to(agent.socketId).emit('task:assigned', task);
    await this.agentManager.assignTaskToAgent(agentId, task.id);

    void this.eventStore?.emit({
      eventType: 'task.assigned',
      aggregateId: task.id,
      aggregateType: 'task',
      payload: { agentId, taskId: task.id, workType: task.workType },
      agentId,
    });

    return true;
  }

  notifyTaskTimeout(agentId: string, taskId: string): void {
    const agent = this.agentManager.getAgent(agentId);
    if (agent) {
      this.server.to(agent.socketId).emit('task:timeout', { taskId });
      void this.agentManager.updateAgentState(agentId, 'IDLE');
    }
  }

  private async tryAssignTask(agentId: string): Promise<void> {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent || agent.state !== 'IDLE') {
      return;
    }

    if (this.queueManager) {
      const assigned = await this.tryAssignFromQueues(agentId);
      if (assigned) return;
    }

    const task = this.taskDistributor.getNextTaskForAgent(agentId);
    if (task) {
      await this.pushTaskToAgent(agentId, task);
    }
  }

  private async tryAssignFromQueues(agentId: string): Promise<boolean> {
    if (!this.queueManager) return false;

    const queueIds = await this.queueManager.getQueueIds();
    if (queueIds.length === 0) return false;

    let bestTask: QueuedTask | null = null;
    let bestQueueId: string | null = null;

    for (const queueId of queueIds) {
      const candidate = await this.queueManager.peek(queueId);
      if (!candidate) continue;

      if (
        !bestTask ||
        candidate.priority < bestTask.priority ||
        (candidate.priority === bestTask.priority &&
          candidate.enqueuedAt < bestTask.enqueuedAt)
      ) {
        bestTask = candidate;
        bestQueueId = queueId;
      }
    }

    if (!bestTask || !bestQueueId) return false;

    const dequeued = await this.queueManager.dequeue(bestQueueId);
    if (!dequeued) return false;

    const task = dequeued.task;

    const now = new Date().toISOString();
    await this.taskStore?.updateStatus(task.id, 'RESERVED' as TaskStatus, {
      assignedAgentId: agentId,
      reservedAt: now,
      assignmentHistory: [
        ...(task.assignmentHistory || []),
        { agentId, assignedAt: now },
      ],
    });

    await this.pushTaskToAgent(agentId, task);
    return true;
  }

  private async tryDistributeFromQueue(_queueId: string): Promise<void> {
    const idleAgents = this.agentManager.getIdleAgents();

    for (const agent of idleAgents) {
      if (await this.tryAssignFromQueues(agent.agentId)) {
        return;
      }
    }
  }

  private async requeueTask(taskId: string, reason: string): Promise<void> {
    if (!this.queueManager || !this.taskStore) return;

    const task = await this.taskStore.getById(taskId);
    if (!task) return;

    const queueId = task.metadata?.['_queueId'] || task.queueId || task.queue;
    if (!queueId) return;

    const queuedTask: QueuedTask = {
      id: task.id,
      pipelineId: task.metadata?.['_pipelineId'] || '',
      queueId: String(queueId),
      task,
      priority: task.priority,
      enqueuedAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3,
    };

    await this.queueManager.requeue(queuedTask, reason);
    await this.taskStore.updateStatus(taskId, 'PENDING' as TaskStatus, {
      assignedAgentId: undefined,
    });
  }
}
