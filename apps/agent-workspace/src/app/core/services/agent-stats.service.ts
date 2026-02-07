import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';
import {
  AgentSessionStats,
  AgentStateType,
  TaskCompletionRecord,
  PauseReason,
  formatDuration,
  formatDurationHuman,
  calculateTasksPerHour,
  calculateOccupancyRate,
} from '@nexus-queue/shared-models';
import { LoggerService } from './logger.service';

const LOG_CONTEXT = 'AgentStatsService';

/**
 * Service for tracking real-time agent statistics during a session.
 * Tracks time in each state, task completions, and calculates performance metrics.
 */
@Injectable({
  providedIn: 'root',
})
export class AgentStatsService implements OnDestroy {
  private logger = inject(LoggerService);

  // Session state
  private sessionStartedAt: Date | null = null;
  private currentState: AgentStateType = 'OFFLINE';
  private stateStartedAt: Date = new Date();
  private pauseReason: PauseReason | null = null;

  // Time accumulators (in seconds)
  private accumulatedIdleTime = 0;
  private accumulatedActiveTime = 0;
  private accumulatedWrapUpTime = 0;
  private accumulatedPausedTime = 0;

  // Task metrics
  private tasksCompleted = 0;
  private tasksTransferred = 0;
  private tasksRejected = 0;
  private totalHandleTime = 0;
  private totalWrapUpTime = 0;
  private taskCompletions: TaskCompletionRecord[] = [];

  // Current task tracking
  private currentTaskStartedAt: Date | null = null;
  private currentTaskAssignedAt: Date | null = null;

  // Real-time stats subject
  private statsSubject = new BehaviorSubject<AgentSessionStats>(
    this.buildStats()
  );
  public stats$: Observable<AgentSessionStats> = this.statsSubject.asObservable();

  // Timer for updating elapsed times
  private timerSubscription: Subscription | null = null;

  constructor() {
    this.startTimer();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  /**
   * Start a new session (agent login)
   */
  startSession(agentId: string): void {
    this.sessionStartedAt = new Date();
    this.currentState = 'IDLE';
    this.stateStartedAt = new Date();
    this.resetAccumulators();

    this.logger.info(LOG_CONTEXT, 'Session started', { agentId });
    this.emitStats();
  }

  /**
   * End the current session (agent logout)
   */
  endSession(): void {
    // Accumulate final time in current state
    this.accumulateCurrentStateTime();

    this.logger.info(LOG_CONTEXT, 'Session ended', {
      duration: this.getSessionDuration(),
      tasksCompleted: this.tasksCompleted,
    });

    this.sessionStartedAt = null;
    this.currentState = 'OFFLINE';
    this.emitStats();
  }

  /**
   * Handle state change from queue service
   */
  onStateChange(newState: AgentStateType): void {
    if (newState === this.currentState) return;

    // Accumulate time in previous state
    this.accumulateCurrentStateTime();

    const previousState = this.currentState;
    this.currentState = newState;
    this.stateStartedAt = new Date();

    // Track task start time for ACTIVE state
    if (newState === 'ACTIVE') {
      this.currentTaskStartedAt = new Date();
    }

    // If entering RESERVED, track assignment time
    if (newState === 'RESERVED') {
      this.currentTaskAssignedAt = new Date();
    }

    this.logger.debug(LOG_CONTEXT, 'State changed', {
      from: previousState,
      to: newState,
    });

    this.emitStats();
  }

  /**
   * Record a task completion
   */
  recordTaskCompletion(
    taskId: string,
    workType: string,
    dispositionCode: string,
    dispositionCategory: string,
    queue?: string
  ): void {
    const now = new Date();
    const handleTime = this.currentTaskStartedAt
      ? (now.getTime() - this.currentTaskStartedAt.getTime()) / 1000
      : 0;

    const wrapUpStart = now;

    // Create completion record
    const record: TaskCompletionRecord = {
      taskId,
      agentId: 'current', // Will be replaced with actual ID
      workType,
      queue,
      dispositionCode,
      dispositionCategory,
      handleTime,
      wrapUpTime: 0, // Will be updated when wrap-up completes
      totalTime: this.currentTaskAssignedAt
        ? (now.getTime() - this.currentTaskAssignedAt.getTime()) / 1000
        : handleTime,
      assignedAt: this.currentTaskAssignedAt?.toISOString() || now.toISOString(),
      startedAt: this.currentTaskStartedAt?.toISOString() || now.toISOString(),
      completedAt: now.toISOString(),
      dispositionedAt: now.toISOString(),
    };

    this.taskCompletions.push(record);

    // Update metrics based on disposition category
    if (dispositionCategory === 'TRANSFERRED') {
      this.tasksTransferred++;
    } else {
      this.tasksCompleted++;
    }

    this.totalHandleTime += handleTime;

    // Reset current task tracking
    this.currentTaskStartedAt = null;
    this.currentTaskAssignedAt = null;

    this.logger.info(LOG_CONTEXT, 'Task completed', {
      taskId,
      handleTime: Math.round(handleTime),
      dispositionCode,
    });

    this.emitStats();
  }

  /**
   * Record task rejection or timeout
   */
  recordTaskRejection(taskId: string): void {
    this.tasksRejected++;
    this.currentTaskStartedAt = null;
    this.currentTaskAssignedAt = null;

    this.logger.info(LOG_CONTEXT, 'Task rejected', { taskId });
    this.emitStats();
  }

  /**
   * Start a pause with reason
   */
  startPause(reason: PauseReason): void {
    this.accumulateCurrentStateTime();
    this.currentState = 'PAUSED';
    this.stateStartedAt = new Date();
    this.pauseReason = reason;

    this.logger.info(LOG_CONTEXT, 'Pause started', { reason });
    this.emitStats();
  }

  /**
   * End the current pause
   */
  endPause(): void {
    this.accumulateCurrentStateTime();
    this.currentState = 'IDLE';
    this.stateStartedAt = new Date();
    this.pauseReason = null;

    this.logger.info(LOG_CONTEXT, 'Pause ended');
    this.emitStats();
  }

  /**
   * Get current stats snapshot
   */
  get currentStats(): AgentSessionStats {
    return this.buildStats();
  }

  /**
   * Get session duration in seconds
   */
  getSessionDuration(): number {
    if (!this.sessionStartedAt) return 0;
    return (Date.now() - this.sessionStartedAt.getTime()) / 1000;
  }

  /**
   * Get time in current state in seconds
   */
  getTimeInCurrentState(): number {
    return (Date.now() - this.stateStartedAt.getTime()) / 1000;
  }

  /**
   * Format a duration for display
   */
  formatTime(seconds: number): string {
    return formatDuration(seconds);
  }

  /**
   * Format a duration as human-readable
   */
  formatTimeHuman(seconds: number): string {
    return formatDurationHuman(seconds);
  }

  // ===== Private Methods =====

  private resetAccumulators(): void {
    this.accumulatedIdleTime = 0;
    this.accumulatedActiveTime = 0;
    this.accumulatedWrapUpTime = 0;
    this.accumulatedPausedTime = 0;
    this.tasksCompleted = 0;
    this.tasksTransferred = 0;
    this.tasksRejected = 0;
    this.totalHandleTime = 0;
    this.totalWrapUpTime = 0;
    this.taskCompletions = [];
    this.currentTaskStartedAt = null;
    this.currentTaskAssignedAt = null;
  }

  private accumulateCurrentStateTime(): void {
    const elapsed = this.getTimeInCurrentState();

    switch (this.currentState) {
      case 'IDLE':
        this.accumulatedIdleTime += elapsed;
        break;
      case 'ACTIVE':
      case 'RESERVED':
        this.accumulatedActiveTime += elapsed;
        break;
      case 'WRAP_UP':
        this.accumulatedWrapUpTime += elapsed;
        this.totalWrapUpTime += elapsed;
        break;
      case 'PAUSED':
      case 'BREAK':
      case 'LUNCH':
      case 'TRAINING':
      case 'MEETING':
        this.accumulatedPausedTime += elapsed;
        break;
    }
  }

  private buildStats(): AgentSessionStats {
    const sessionDuration = this.getSessionDuration();
    const timeInCurrentState = this.getTimeInCurrentState();

    // Calculate current totals including time in current state
    let idleTime = this.accumulatedIdleTime;
    let activeTime = this.accumulatedActiveTime;
    let wrapUpTime = this.accumulatedWrapUpTime;
    let pausedTime = this.accumulatedPausedTime;

    // Add current state time
    switch (this.currentState) {
      case 'IDLE':
        idleTime += timeInCurrentState;
        break;
      case 'ACTIVE':
      case 'RESERVED':
        activeTime += timeInCurrentState;
        break;
      case 'WRAP_UP':
        wrapUpTime += timeInCurrentState;
        break;
      case 'PAUSED':
      case 'BREAK':
      case 'LUNCH':
      case 'TRAINING':
      case 'MEETING':
        pausedTime += timeInCurrentState;
        break;
    }

    const totalTasks = this.tasksCompleted + this.tasksTransferred;
    const avgHandleTime = totalTasks > 0 ? this.totalHandleTime / totalTasks : 0;
    const avgWrapUpTime = totalTasks > 0 ? this.totalWrapUpTime / totalTasks : 0;

    const productiveTime = activeTime + wrapUpTime;
    const availableTime = sessionDuration - pausedTime;

    return {
      agentId: 'current',
      sessionStartedAt: this.sessionStartedAt?.toISOString() || '',
      currentState: this.currentState,
      stateStartedAt: this.stateStartedAt.toISOString(),
      tasksCompleted: this.tasksCompleted,
      tasksTransferred: this.tasksTransferred,
      tasksRejected: this.tasksRejected,
      totalHandleTime: Math.round(this.totalHandleTime),
      averageHandleTime: Math.round(avgHandleTime),
      totalWrapUpTime: Math.round(wrapUpTime),
      averageWrapUpTime: Math.round(avgWrapUpTime),
      totalIdleTime: Math.round(idleTime),
      totalActiveTime: Math.round(activeTime),
      totalPausedTime: Math.round(pausedTime),
      tasksPerHour: calculateTasksPerHour(totalTasks, productiveTime),
      occupancyRate: calculateOccupancyRate(productiveTime, availableTime),
      lastActivityAt: new Date().toISOString(),
    };
  }

  private emitStats(): void {
    this.statsSubject.next(this.buildStats());
  }

  private startTimer(): void {
    // Update stats every second for real-time display
    this.timerSubscription = interval(1000).subscribe(() => {
      if (this.sessionStartedAt) {
        this.emitStats();
      }
    });
  }

  private stopTimer(): void {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
    }
  }
}
