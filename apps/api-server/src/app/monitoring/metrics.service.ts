import { Injectable, OnModuleInit, Global } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Gauge,
  Counter,
  Histogram,
} from 'prom-client';

/**
 * Global Prometheus metrics service.
 * Exposes the default Node.js process metrics plus 6 custom Nexus Queue metrics.
 * Marked @Global() so any service can inject it without importing MonitoringModule.
 */
@Global()
@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry = new Registry();

  readonly queueDepth = new Gauge({
    name: 'nexus_queue_depth',
    help: 'Current number of tasks in each priority queue',
    labelNames: ['queue_id', 'queue_name'] as const,
    registers: [this.registry],
  });

  readonly tasksTotal = new Counter({
    name: 'nexus_tasks_total',
    help: 'Total tasks processed, labelled by terminal status and pipeline',
    labelNames: ['status', 'pipeline_id'] as const,
    registers: [this.registry],
  });

  readonly taskHandleTime = new Histogram({
    name: 'nexus_task_handle_time_seconds',
    help: 'Agent handle time per task in seconds',
    buckets: [10, 30, 60, 120, 300, 600],
    registers: [this.registry],
  });

  readonly agentsActive = new Gauge({
    name: 'nexus_agents_active',
    help: 'Number of connected agents by state',
    labelNames: ['state'] as const,
    registers: [this.registry],
  });

  readonly slaBreachesTotal = new Counter({
    name: 'nexus_sla_breaches_total',
    help: 'Total SLA breaches by queue',
    labelNames: ['queue_id'] as const,
    registers: [this.registry],
  });

  readonly dlqDepth = new Gauge({
    name: 'nexus_dlq_depth',
    help: 'Current number of tasks in the dead-letter queue',
    registers: [this.registry],
  });

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  /** Return the full Prometheus text exposition. */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /** Content-type header for Prometheus scrape responses. */
  getContentType(): string {
    return this.registry.contentType;
  }

  // ===== Instrumentation helpers =====

  setQueueDepth(queueId: string, queueName: string, depth: number): void {
    this.queueDepth.set({ queue_id: queueId, queue_name: queueName }, depth);
  }

  setDlqDepth(depth: number): void {
    this.dlqDepth.set(depth);
  }

  incrementTasksTotal(status: string, pipelineId: string): void {
    this.tasksTotal.inc({ status, pipeline_id: pipelineId });
  }

  observeHandleTime(seconds: number): void {
    this.taskHandleTime.observe(seconds);
  }

  setAgentsActive(state: string, count: number): void {
    this.agentsActive.set({ state }, count);
  }

  incrementSlaBreaches(queueId: string): void {
    this.slaBreachesTotal.inc({ queue_id: queueId });
  }
}
