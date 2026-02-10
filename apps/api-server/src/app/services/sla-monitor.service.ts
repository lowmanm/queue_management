import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { QueueManagerService, QueuedTask } from './queue-manager.service';

export interface SLABreachEvent {
  taskId: string;
  queueId: string;
  pipelineId: string;
  severity: 'warning' | 'breach' | 'critical';
  waitTimeSeconds: number;
  slaLimitSeconds: number;
  percentUsed: number;
  timestamp: string;
}

/**
 * SLA Monitor Service
 *
 * Runs on a configurable interval to check all queued tasks against
 * their SLA deadlines. Takes corrective action when thresholds are hit:
 *
 *   80% of SLA  → WARNING: boost priority by 2, emit sla:warning
 *  100% of SLA  → BREACH:  boost to priority 1, emit sla:breach
 *  150% of SLA  → CRITICAL: move to DLQ with sla_expired reason
 */
@Injectable()
export class SLAMonitorService implements OnModuleDestroy {
  private readonly logger = new Logger(SLAMonitorService.name);

  /** Interval handle for the monitor loop */
  private monitorInterval: ReturnType<typeof setInterval> | null = null;

  /** How often to check SLA compliance (ms) */
  private checkIntervalMs = 10_000; // 10 seconds

  /** Recent breach events (kept for dashboard consumption) */
  private recentBreaches: SLABreachEvent[] = [];
  private readonly maxBreachHistory = 200;

  /** Optional callback for real-time breach notifications */
  private breachCallback:
    | ((event: SLABreachEvent) => void)
    | null = null;

  constructor(private readonly queueManager: QueueManagerService) {
    this.logger.log('SLA Monitor initialized');
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /**
   * Start the SLA monitoring loop.
   */
  start(intervalMs?: number): void {
    if (this.monitorInterval) {
      this.logger.warn('SLA Monitor already running');
      return;
    }

    if (intervalMs) {
      this.checkIntervalMs = intervalMs;
    }

    this.monitorInterval = setInterval(() => {
      this.checkSLACompliance();
    }, this.checkIntervalMs);

    this.logger.log(
      `SLA Monitor started (interval: ${this.checkIntervalMs}ms)`
    );
  }

  /**
   * Stop the SLA monitoring loop.
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      this.logger.log('SLA Monitor stopped');
    }
  }

  /**
   * Register a callback for real-time breach notifications.
   * The AgentGateway can use this to push events to manager dashboards.
   */
  onBreach(callback: (event: SLABreachEvent) => void): void {
    this.breachCallback = callback;
  }

  /**
   * Run a single SLA compliance check across all queues.
   * Called by the interval and can also be invoked manually.
   */
  checkSLACompliance(): SLABreachEvent[] {
    const events: SLABreachEvent[] = [];
    const now = Date.now();

    // Check tasks approaching SLA (80% threshold for warning)
    const warningTasks =
      this.queueManager.getTasksApproachingSLA(80);

    for (const task of warningTasks) {
      if (!task.slaDeadline) continue;

      const deadline = new Date(task.slaDeadline).getTime();
      const enqueued = new Date(task.enqueuedAt).getTime();
      const totalWindow = deadline - enqueued;
      const elapsed = now - enqueued;
      const percentUsed = (elapsed / totalWindow) * 100;

      let severity: SLABreachEvent['severity'];
      let action: string;

      if (percentUsed >= 150) {
        // CRITICAL: Move to DLQ
        severity = 'critical';
        action = 'moved_to_dlq';
        this.queueManager.moveToDLQ(task, 'sla_expired');
      } else if (percentUsed >= 100) {
        // BREACH: Boost to max priority
        severity = 'breach';
        action = 'boosted_to_p1';
        this.queueManager.reprioritize(
          task.queueId,
          task.id,
          1,
          'sla_breach'
        );
      } else {
        // WARNING: Boost priority by 2 levels
        severity = 'warning';
        action = 'priority_boosted';
        const newPriority = Math.max(1, task.priority - 2);
        if (newPriority < task.priority) {
          this.queueManager.reprioritize(
            task.queueId,
            task.id,
            newPriority,
            'sla_warning'
          );
        }
      }

      const event: SLABreachEvent = {
        taskId: task.id,
        queueId: task.queueId,
        pipelineId: task.pipelineId,
        severity,
        waitTimeSeconds: Math.round(elapsed / 1000),
        slaLimitSeconds: Math.round(totalWindow / 1000),
        percentUsed: Math.round(percentUsed),
        timestamp: new Date().toISOString(),
      };

      events.push(event);
      this.recordBreach(event);

      if (this.breachCallback) {
        try {
          this.breachCallback(event);
        } catch {
          // Don't let callback failures break the monitor
        }
      }
    }

    if (events.length > 0) {
      const bySeverity = {
        warning: events.filter((e) => e.severity === 'warning').length,
        breach: events.filter((e) => e.severity === 'breach').length,
        critical: events.filter((e) => e.severity === 'critical').length,
      };
      this.logger.log(
        `SLA check: ${events.length} event(s) — ` +
          `${bySeverity.warning} warnings, ${bySeverity.breach} breaches, ${bySeverity.critical} critical`
      );
    }

    return events;
  }

  /** Get recent breach events for dashboard display */
  getRecentBreaches(limit = 50): SLABreachEvent[] {
    return this.recentBreaches.slice(-limit);
  }

  /** Get breach summary statistics */
  getBreachStats(): {
    totalWarnings: number;
    totalBreaches: number;
    totalCritical: number;
    byQueue: Record<string, number>;
  } {
    const stats = {
      totalWarnings: 0,
      totalBreaches: 0,
      totalCritical: 0,
      byQueue: {} as Record<string, number>,
    };

    for (const event of this.recentBreaches) {
      if (event.severity === 'warning') stats.totalWarnings++;
      else if (event.severity === 'breach') stats.totalBreaches++;
      else if (event.severity === 'critical') stats.totalCritical++;

      stats.byQueue[event.queueId] =
        (stats.byQueue[event.queueId] || 0) + 1;
    }

    return stats;
  }

  private recordBreach(event: SLABreachEvent): void {
    this.recentBreaches.push(event);
    if (this.recentBreaches.length > this.maxBreachHistory) {
      this.recentBreaches.shift();
    }
  }
}
