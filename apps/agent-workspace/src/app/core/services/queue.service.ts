import { Injectable, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  BehaviorSubject,
  Observable,
  tap,
  interval,
  Subscription,
  Subject,
  takeUntil,
} from 'rxjs';
import {
  Task,
  TaskStatus,
  AgentState,
  TaskDisposition,
  AgentStateType,
} from '@nexus-queue/shared-models';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';
import { SocketService } from './socket.service';
import { AgentStatsService } from './agent-stats.service';

const LOG_CONTEXT = 'QueueService';

/**
 * Manages the task queue and agent state machine.
 * Supports both Force Mode (WebSocket push) and Pull Mode (HTTP request).
 *
 * State Flow:
 * IDLE → RESERVED → ACTIVE → WRAP_UP → IDLE
 */
@Injectable({
  providedIn: 'root',
})
export class QueueService implements OnDestroy {
  private logger = inject(LoggerService);
  private destroy$ = new Subject<void>();

  // === State Subjects ===
  private currentTaskSubject = new BehaviorSubject<Task | null>(null);
  private agentStateSubject = new BehaviorSubject<AgentState>('OFFLINE');

  // === Public Observables ===
  public currentTask$: Observable<Task | null> =
    this.currentTaskSubject.asObservable();
  public agentState$: Observable<AgentState> =
    this.agentStateSubject.asObservable();

  // === Reservation Timer ===
  private reservationTimer$: Subscription | null = null;
  private reservationCountdownSubject = new BehaviorSubject<number>(0);
  public reservationCountdown$: Observable<number> =
    this.reservationCountdownSubject.asObservable();

  // === Session Metrics ===
  private sessionMetrics = {
    tasksCompleted: 0,
    totalHandleTime: 0,
    tasksTransferred: 0,
  };

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private socketService: SocketService,
    private agentStatsService: AgentStatsService
  ) {
    this.setupSocketListeners();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopReservationTimer();
  }

  // === Getters ===

  get currentTask(): Task | null {
    return this.currentTaskSubject.value;
  }

  get agentState(): AgentState {
    return this.agentStateSubject.value;
  }

  get metrics() {
    return {
      ...this.sessionMetrics,
      avgHandleTime:
        this.sessionMetrics.tasksCompleted > 0
          ? this.sessionMetrics.totalHandleTime /
            this.sessionMetrics.tasksCompleted
          : 0,
    };
  }

  // === Connection Management ===

  /**
   * Initialize the queue service and connect to WebSocket.
   * Called after authentication is complete.
   */
  initialize(): void {
    const agent = this.authService.currentAgent;
    if (!agent) {
      this.logger.error(LOG_CONTEXT, 'Cannot initialize queue: No authenticated agent');
      return;
    }

    this.logger.info(LOG_CONTEXT, 'Initializing queue service', { agentId: agent.id, agentName: agent.name });

    // Start stats tracking session
    this.agentStatsService.startSession(agent.id);

    this.socketService.connect(agent.id, agent.name);
  }

  /**
   * Disconnect from the queue
   */
  disconnect(): void {
    this.socketService.disconnect();
    this.agentStatsService.endSession();
    this.transitionTo('OFFLINE');
  }

  // === State Machine Transitions ===

  /**
   * Handle task assigned via WebSocket (Force Mode)
   */
  handleTaskAssigned(task: Task): void {
    this.logger.info(LOG_CONTEXT, 'Task assigned via WebSocket', { taskId: task.id, workType: task.workType });
    this.currentTaskSubject.next(task);
    this.transitionTo('RESERVED');
    this.startReservationTimer(task.reservationTimeout || 30);
  }

  /**
   * Handle task timeout via WebSocket
   */
  handleTaskTimeout(taskId: string): void {
    if (this.currentTask?.id === taskId) {
      this.logger.warn(LOG_CONTEXT, 'Task timeout received', { taskId });
      this.stopReservationTimer();
      this.currentTaskSubject.next(null);
      this.transitionTo('IDLE');
    }
  }

  /**
   * Fetches the next available task from the backend (Pull Mode).
   * Only used when Pull Mode is enabled for a queue.
   * Transitions: IDLE → RESERVED
   */
  getNextTask(): Observable<Task> {
    if (this.agentState !== 'IDLE') {
      throw new Error(
        `Cannot get next task: Agent is in ${this.agentState} state`
      );
    }

    const agentId = this.authService.currentAgent?.id;

    return this.http
      .get<Task>(`${environment.apiUrl}/tasks/next`, {
        params: agentId ? { agentId } : {},
      })
      .pipe(
        tap((task) => {
          this.currentTaskSubject.next(task);
          this.transitionTo('RESERVED');
          this.startReservationTimer(task.reservationTimeout || 30);
        })
      );
  }

  /**
   * Agent accepts the reserved task.
   * Transitions: RESERVED → ACTIVE
   */
  acceptTask(): void {
    if (this.agentState !== 'RESERVED') {
      throw new Error(
        `Cannot accept task: Agent is in ${this.agentState} state`
      );
    }

    const task = this.currentTask;
    if (!task) {
      throw new Error('No task to accept');
    }

    this.stopReservationTimer();

    // Notify server
    const agentId = this.authService.currentAgent?.id;
    if (agentId) {
      this.socketService.sendTaskAction(agentId, task.id, 'accept');
    }

    // Update task timestamps
    const now = new Date().toISOString();
    const updatedTask: Task = {
      ...task,
      status: 'ACTIVE' as TaskStatus,
      acceptedAt: now,
      startedAt: now,
    };

    this.currentTaskSubject.next(updatedTask);
    this.transitionTo('ACTIVE');
  }

  /**
   * Agent rejects the reserved task.
   * Transitions: RESERVED → IDLE
   */
  rejectTask(): void {
    if (this.agentState !== 'RESERVED') {
      throw new Error(
        `Cannot reject task: Agent is in ${this.agentState} state`
      );
    }

    const task = this.currentTask;
    this.stopReservationTimer();

    // Notify server
    const agentId = this.authService.currentAgent?.id;
    if (agentId && task) {
      this.socketService.sendTaskAction(agentId, task.id, 'reject');
    }

    // Record rejection in stats
    if (task) {
      this.agentStatsService.recordTaskRejection(task.id);
    }

    this.currentTaskSubject.next(null);
    this.transitionTo('IDLE');
  }

  /**
   * Agent completes the active task.
   * Transitions: ACTIVE → WRAP_UP
   */
  completeTask(): void {
    if (this.agentState !== 'ACTIVE') {
      throw new Error(
        `Cannot complete task: Agent is in ${this.agentState} state`
      );
    }

    const task = this.currentTask;
    if (!task) {
      throw new Error('No task to complete');
    }

    // Notify server
    const agentId = this.authService.currentAgent?.id;
    if (agentId) {
      this.socketService.sendTaskAction(agentId, task.id, 'complete');
    }

    const now = new Date().toISOString();
    const handleTime = this.calculateHandleTime(task.startedAt, now);

    const updatedTask: Task = {
      ...task,
      status: 'WRAP_UP' as TaskStatus,
      completedAt: now,
      handleTime,
    };

    this.currentTaskSubject.next(updatedTask);
    this.transitionTo('WRAP_UP');
  }

  /**
   * Agent submits disposition and finishes wrap-up.
   * Transitions: WRAP_UP → IDLE
   * @param disposition - The disposition data
   * @param skipSocketNotify - If true, skip WebSocket notification (used when already sent via REST API)
   */
  submitDisposition(
    disposition: Omit<TaskDisposition, 'selectedAt' | 'selectedBy'> & { note?: string },
    skipSocketNotify = false
  ): void {
    if (this.agentState !== 'WRAP_UP') {
      throw new Error(
        `Cannot submit disposition: Agent is in ${this.agentState} state`
      );
    }

    const task = this.currentTask;
    if (!task) {
      throw new Error('No task to disposition');
    }

    const now = new Date().toISOString();
    const agentId = this.authService.currentAgent?.id || 'unknown';
    const wrapUpTime = this.calculateHandleTime(task.completedAt, now);
    const totalTime = this.calculateHandleTime(task.reservedAt, now);

    // Notify server via WebSocket (skip if already notified via REST API)
    if (!skipSocketNotify) {
      this.socketService.sendDispositionComplete(
        agentId,
        task.id,
        disposition.code
      );
    }

    const updatedTask: Task = {
      ...task,
      status: 'COMPLETED' as TaskStatus,
      dispositionedAt: now,
      wrapUpTime,
      totalTime,
      disposition: {
        code: disposition.code,
        label: disposition.label,
        notes: disposition.note || disposition.notes,
        selectedAt: now,
        selectedBy: agentId,
      },
    };

    // Update session metrics
    this.sessionMetrics.tasksCompleted++;
    this.sessionMetrics.totalHandleTime += task.handleTime || 0;

    // Record task completion in stats service
    this.agentStatsService.recordTaskCompletion(
      task.id,
      task.workType,
      disposition.code,
      'COMPLETED', // Category - could be enhanced to pass actual category
      task.queue
    );

    this.currentTaskSubject.next(updatedTask);

    // Clear task and return to IDLE after a brief delay
    setTimeout(() => {
      this.currentTaskSubject.next(null);
      this.transitionTo('IDLE');
    }, 500);
  }

  /**
   * Agent transfers the task to another queue/agent.
   * Transitions: ACTIVE → IDLE
   */
  transferTask(): void {
    if (this.agentState !== 'ACTIVE') {
      throw new Error(
        `Cannot transfer task: Agent is in ${this.agentState} state`
      );
    }

    const task = this.currentTask;
    if (!task) {
      throw new Error('No task to transfer');
    }

    // Notify server
    const agentId = this.authService.currentAgent?.id;
    if (agentId) {
      this.socketService.sendTaskAction(agentId, task.id, 'transfer');
    }

    const now = new Date().toISOString();
    const updatedTask: Task = {
      ...task,
      status: 'TRANSFERRED' as TaskStatus,
      completedAt: now,
    };

    this.sessionMetrics.tasksTransferred++;
    this.currentTaskSubject.next(updatedTask);

    // Clear task and return to IDLE
    setTimeout(() => {
      this.currentTaskSubject.next(null);
      this.transitionTo('IDLE');
    }, 500);
  }

  /**
   * Manually set agent to IDLE (e.g., after break)
   */
  setReady(): void {
    if (this.currentTask) {
      throw new Error('Cannot set ready while task is assigned');
    }
    this.transitionTo('IDLE');

    // Notify server agent is ready
    const agentId = this.authService.currentAgent?.id;
    if (agentId) {
      this.socketService.sendAgentReady(agentId);
    }
  }

  /**
   * Set agent offline
   */
  setOffline(): void {
    this.stopReservationTimer();
    if (this.currentTask && this.agentState === 'RESERVED') {
      this.currentTaskSubject.next(null);
    }
    this.transitionTo('OFFLINE');
  }

  // === Private Helpers ===

  private setupSocketListeners(): void {
    // Handle WebSocket connection status
    this.socketService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe((status) => {
        if (status.connected) {
          this.logger.info(LOG_CONTEXT, 'Socket connected, transitioning to IDLE');
          this.transitionTo('IDLE');
        } else if (this.agentState !== 'OFFLINE') {
          this.logger.debug(LOG_CONTEXT, 'Socket disconnected (temporary)');
          // Don't transition to offline on temporary disconnects
        }
      });

    // Handle task assignments (Force Mode)
    this.socketService.taskAssigned$
      .pipe(takeUntil(this.destroy$))
      .subscribe((task) => {
        this.handleTaskAssigned(task);
      });

    // Handle task timeouts
    this.socketService.taskTimeout$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ taskId }) => {
        this.handleTaskTimeout(taskId);
      });
  }

  private transitionTo(newState: AgentState): void {
    const oldState = this.agentState;
    if (oldState === newState) return;

    this.logger.info(LOG_CONTEXT, `Agent state transition: ${oldState} → ${newState}`, { oldState, newState });
    this.agentStateSubject.next(newState);

    // Track state change in stats service
    this.agentStatsService.onStateChange(newState as AgentStateType);

    // Notify server of state change (except for IDLE which is handled separately)
    const agentId = this.authService.currentAgent?.id;
    if (agentId && newState !== 'IDLE') {
      this.socketService.sendStateChange(agentId, newState);
    }
  }

  private startReservationTimer(timeoutSeconds: number): void {
    this.stopReservationTimer();

    let remaining = timeoutSeconds;
    this.reservationCountdownSubject.next(remaining);

    this.reservationTimer$ = interval(1000).subscribe(() => {
      remaining--;
      this.reservationCountdownSubject.next(remaining);

      if (remaining <= 0) {
        this.handleReservationTimeout();
      }
    });
  }

  private stopReservationTimer(): void {
    if (this.reservationTimer$) {
      this.reservationTimer$.unsubscribe();
      this.reservationTimer$ = null;
    }
    this.reservationCountdownSubject.next(0);
  }

  private handleReservationTimeout(): void {
    this.logger.warn(LOG_CONTEXT, 'Reservation timeout - releasing task', { taskId: this.currentTask?.id });
    this.stopReservationTimer();

    // Notify server of rejection due to timeout
    const task = this.currentTask;
    const agentId = this.authService.currentAgent?.id;
    if (agentId && task) {
      this.socketService.sendTaskAction(agentId, task.id, 'reject');
      // Record timeout as rejection in stats
      this.agentStatsService.recordTaskRejection(task.id);
    }

    this.currentTaskSubject.next(null);
    this.transitionTo('IDLE');
  }

  private calculateHandleTime(
    startTime: string | undefined,
    endTime: string
  ): number {
    if (!startTime) return 0;
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    return Math.round((end - start) / 1000);
  }
}
