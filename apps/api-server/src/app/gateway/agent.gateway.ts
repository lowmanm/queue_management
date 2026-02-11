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
import { AgentManagerService } from '../services/agent-manager.service';
import { TaskDistributorService } from '../services/task-distributor.service';
import { QueueManagerService, QueuedTask } from '../services/queue-manager.service';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';
import { TaskStoreService } from '../services/task-store.service';
import { SLAMonitorService, SLABreachEvent } from '../services/sla-monitor.service';

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
    private readonly slaMonitor?: SLAMonitorService
  ) {}

  /**
   * After server init, register callbacks so the orchestrator and SLA monitor
   * can push events through the gateway.
   */
  afterInit(): void {
    // Register distribution callback: when a task is enqueued, try to assign it
    if (this.orchestrator) {
      this.orchestrator.onTaskEnqueued((queueId: string) => {
        this.tryDistributeFromQueue(queueId);
      });
      this.logger.log('Registered distribution callback with PipelineOrchestrator');
    }

    // Register SLA breach callback: push breach events to manager dashboards
    if (this.slaMonitor) {
      this.slaMonitor.onBreach((event: SLABreachEvent) => {
        this.server?.emit('sla:breach', event);
      });
      this.slaMonitor.start();
      this.logger.log('SLA Monitor started via gateway init');
    }
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id} | Transport: ${client.conn.transport.name} | IP: ${client.handshake.address}`);
  }

  handleDisconnect(client: Socket): void {
    const agent = this.agentManager.getAgentBySocketId(client.id);
    const agentInfo = agent ? ` (Agent: ${agent.agentId})` : '';
    this.logger.log(`Client disconnected: ${client.id}${agentInfo} | Reason: socket closed`);

    // If agent had an active/reserved task, requeue it so it's not lost
    if (agent && agent.currentTaskId) {
      const activeStates: AgentState[] = ['ACTIVE', 'RESERVED', 'WRAP_UP'];
      if (activeStates.includes(agent.state)) {
        this.logger.warn(
          `Agent ${agent.agentId} disconnected with task ${agent.currentTaskId} in ${agent.state} state — requeueing task`
        );
        this.requeueTask(agent.currentTaskId, 'agent_disconnected');
      }
    }

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
   * Graceful disconnect signal from client (browser closing).
   * Triggers the same cleanup as a WebSocket disconnect.
   */
  @SubscribeMessage('agent:disconnect')
  handleAgentDisconnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { agentId: string }
  ): void {
    this.logger.log(`Agent graceful disconnect: ${payload.agentId}`);
    // handleDisconnect will fire automatically when the socket closes,
    // but we trigger cleanup early to ensure task requeue happens
    this.handleDisconnect(client);
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
        this.taskStore?.updateStatus(payload.taskId, 'ACTIVE' as TaskStatus, {
          assignedAgentId: payload.agentId,
        });
        break;
      case 'reject':
        this.agentManager.clearAgentTask(payload.agentId);
        this.agentManager.updateAgentState(payload.agentId, 'IDLE');
        // Requeue the task if using V2 queue
        this.requeueTask(payload.taskId, 'agent_rejected');
        // Try to assign a new task
        this.tryAssignTask(payload.agentId);
        break;
      case 'complete':
        this.agentManager.updateAgentState(payload.agentId, 'WRAP_UP');
        this.taskStore?.updateStatus(payload.taskId, 'WRAP_UP' as TaskStatus);
        break;
      case 'transfer':
        this.agentManager.clearAgentTask(payload.agentId);
        this.agentManager.updateAgentState(payload.agentId, 'IDLE');
        this.taskStore?.updateStatus(payload.taskId, 'TRANSFERRED' as TaskStatus);
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

    this.agentManager.clearAgentTask(payload.agentId);
    this.agentManager.updateAgentState(payload.agentId, 'IDLE');
    this.taskStore?.updateStatus(payload.taskId, 'COMPLETED' as TaskStatus, {
      completedAt: new Date().toISOString(),
    });

    // Try to assign a new task (Force Mode)
    this.tryAssignTask(payload.agentId);
  }

  /**
   * Push a task to a specific agent (Force-Push Mode).
   * Sets agent directly to RESERVED; the client auto-accepts immediately.
   */
  pushTaskToAgent(agentId: string, task: Task): boolean {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent) {
      this.logger.warn(`Cannot push task: Agent ${agentId} not found`);
      return false;
    }

    this.logger.log(`Force-pushing task ${task.id} to agent ${agentId}`);
    this.server.to(agent.socketId).emit('task:assigned', task);
    // Set to RESERVED and track the task; client will auto-accept and send 'accept' action → ACTIVE
    this.agentManager.assignTaskToAgent(agentId, task.id);

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
   * Try to assign a task to an agent (Force Mode).
   * Uses V2 QueueManager if available, falls back to legacy TaskDistributor.
   */
  private tryAssignTask(agentId: string): void {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent || agent.state !== 'IDLE') {
      return;
    }

    // V2 path: pull from priority queues
    if (this.queueManager) {
      const assigned = this.tryAssignFromQueues(agentId);
      if (assigned) return;
    }

    // Legacy fallback: use TaskDistributor
    const task = this.taskDistributor.getNextTaskForAgent(agentId);
    if (task) {
      this.pushTaskToAgent(agentId, task);
    }
  }

  /**
   * Try to assign a task from the priority queues to a specific agent.
   * Iterates all queues and dequeues the highest-priority task.
   */
  private tryAssignFromQueues(agentId: string): boolean {
    if (!this.queueManager) return false;

    const queueIds = this.queueManager.getQueueIds();
    if (queueIds.length === 0) return false;

    // Collect the top task from each queue and pick the overall best
    let bestTask: QueuedTask | null = null;
    let bestQueueId: string | null = null;

    for (const queueId of queueIds) {
      const candidate = this.queueManager.peek(queueId);
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

    // Dequeue and push to agent
    const dequeued = this.queueManager.dequeue(bestQueueId);
    if (!dequeued) return false;

    const task = dequeued.task;

    // Update task status in store
    const now = new Date().toISOString();
    this.taskStore?.updateStatus(task.id, 'RESERVED' as TaskStatus, {
      assignedAgentId: agentId,
      reservedAt: now,
      assignmentHistory: [
        ...(task.assignmentHistory || []),
        { agentId, assignedAt: now },
      ],
    });

    this.pushTaskToAgent(agentId, task);
    return true;
  }

  /**
   * When a new task is enqueued, try to distribute it to any idle agent.
   * Called by the PipelineOrchestrator via the registered callback.
   */
  private tryDistributeFromQueue(_queueId: string): void {
    const idleAgents = this.agentManager.getIdleAgents();

    for (const agent of idleAgents) {
      if (this.tryAssignFromQueues(agent.agentId)) {
        return; // Assigned to first available idle agent
      }
    }
  }

  /**
   * Requeue a task back into its queue after rejection or timeout.
   */
  private requeueTask(taskId: string, reason: string): void {
    if (!this.queueManager || !this.taskStore) return;

    const task = this.taskStore.getById(taskId);
    if (!task) return;

    const queueId = task.metadata?.['_queueId'] || task.queueId || task.queue;
    if (!queueId) return;

    // Build a QueuedTask wrapper for requeue
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

    this.queueManager.requeue(queuedTask, reason);
    this.taskStore.updateStatus(taskId, 'PENDING' as TaskStatus, {
      assignedAgentId: undefined,
    });
  }
}
