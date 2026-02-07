import { Injectable, Logger } from '@nestjs/common';
import { AgentManagerService } from '../services/agent-manager.service';
import { TaskSourceService } from '../services/task-source.service';

export interface QueueConfig {
  id: string;
  name: string;
  description: string;
  active: boolean;
  priority: number;
  slaTarget: number; // seconds
  maxWaitTime: number; // seconds
  requiredSkills: string[];
  workTypes: string[];
  routingMode: 'round-robin' | 'least-busy' | 'skill-based' | 'priority';
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueStats {
  id: string;
  name: string;
  tasksWaiting: number;
  tasksInProgress: number;
  oldestTaskAge: number; // seconds
  avgWaitTime: number; // seconds
  completedToday: number;
  serviceLevelPercent: number;
  slaTarget: number;
  agentsAssigned: number;
  agentsAvailable: number;
  status: 'healthy' | 'warning' | 'critical';
}

@Injectable()
export class QueuesService {
  private readonly logger = new Logger(QueuesService.name);
  private queues = new Map<string, QueueConfig>();
  private taskAges = new Map<string, number>(); // queue -> oldest task timestamp

  constructor(
    private readonly agentManager: AgentManagerService,
    private readonly taskSourceService: TaskSourceService
  ) {
    this.initializeDefaultQueues();
  }

  private initializeDefaultQueues(): void {
    const defaults: Omit<QueueConfig, 'createdAt' | 'updatedAt'>[] = [
      {
        id: 'queue-orders',
        name: 'Order Processing',
        description: 'New orders and order modifications',
        active: true,
        priority: 1,
        slaTarget: 300,
        maxWaitTime: 600,
        requiredSkills: ['orders'],
        workTypes: ['ORDERS'],
        routingMode: 'round-robin',
      },
      {
        id: 'queue-returns',
        name: 'Returns & Refunds',
        description: 'Return requests and refund processing',
        active: true,
        priority: 2,
        slaTarget: 300,
        maxWaitTime: 900,
        requiredSkills: ['returns'],
        workTypes: ['RETURNS'],
        routingMode: 'least-busy',
      },
      {
        id: 'queue-claims',
        name: 'Claims Processing',
        description: 'Insurance and warranty claims',
        active: true,
        priority: 3,
        slaTarget: 600,
        maxWaitTime: 1800,
        requiredSkills: ['claims'],
        workTypes: ['CLAIMS'],
        routingMode: 'skill-based',
      },
      {
        id: 'queue-escalations',
        name: 'Escalations',
        description: 'Escalated issues requiring supervisor attention',
        active: true,
        priority: 1,
        slaTarget: 600,
        maxWaitTime: 900,
        requiredSkills: ['escalation'],
        workTypes: ['ESCALATIONS'],
        routingMode: 'priority',
      },
      {
        id: 'queue-updates',
        name: 'Customer Updates',
        description: 'Address changes, account updates',
        active: true,
        priority: 4,
        slaTarget: 300,
        maxWaitTime: 600,
        requiredSkills: [],
        workTypes: ['UPDATES'],
        routingMode: 'round-robin',
      },
    ];

    const now = new Date();
    defaults.forEach((q) => {
      this.queues.set(q.id, { ...q, createdAt: now, updatedAt: now });
      // Initialize with random task ages for demo
      this.taskAges.set(q.id, Date.now() - Math.random() * 600000);
    });

    this.logger.log(`Initialized ${defaults.length} default queues`);
  }

  /**
   * Get all queues
   */
  getAllQueues(): QueueConfig[] {
    return Array.from(this.queues.values());
  }

  /**
   * Get active queues only
   */
  getActiveQueues(): QueueConfig[] {
    return this.getAllQueues().filter((q) => q.active);
  }

  /**
   * Get queue by ID
   */
  getQueueById(id: string): QueueConfig | undefined {
    return this.queues.get(id);
  }

  /**
   * Create a new queue
   */
  createQueue(data: Omit<QueueConfig, 'id' | 'createdAt' | 'updatedAt'>): QueueConfig {
    const id = `queue-${Date.now()}`;
    const now = new Date();
    const queue: QueueConfig = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.queues.set(id, queue);
    this.taskAges.set(id, Date.now());
    this.logger.log(`Created queue: ${queue.name}`);
    return queue;
  }

  /**
   * Update a queue
   */
  updateQueue(id: string, data: Partial<QueueConfig>): QueueConfig | null {
    const queue = this.queues.get(id);
    if (!queue) return null;

    const updated: QueueConfig = {
      ...queue,
      ...data,
      id: queue.id, // Prevent ID change
      createdAt: queue.createdAt,
      updatedAt: new Date(),
    };
    this.queues.set(id, updated);
    this.logger.log(`Updated queue: ${updated.name}`);
    return updated;
  }

  /**
   * Delete a queue
   */
  deleteQueue(id: string): boolean {
    const deleted = this.queues.delete(id);
    this.taskAges.delete(id);
    if (deleted) {
      this.logger.log(`Deleted queue: ${id}`);
    }
    return deleted;
  }

  /**
   * Toggle queue active status
   */
  toggleQueueActive(id: string): QueueConfig | null {
    const queue = this.queues.get(id);
    if (!queue) return null;
    return this.updateQueue(id, { active: !queue.active });
  }

  /**
   * Get queue statistics with real-time metrics
   */
  getQueueStats(id: string): QueueStats | null {
    const queue = this.queues.get(id);
    if (!queue) return null;

    // Get task source stats
    const sourceStats = this.taskSourceService.getQueueStats();

    // Distribute tasks across queues based on work type (simplified)
    const queueShare = 1 / this.queues.size;
    const tasksWaiting = Math.floor(sourceStats.totalPending * queueShare);
    const tasksInProgress = Math.floor(sourceStats.totalAssigned * queueShare);

    // Calculate oldest task age
    const oldestTimestamp = this.taskAges.get(id) || Date.now();
    const oldestTaskAge = tasksWaiting > 0
      ? Math.floor((Date.now() - oldestTimestamp) / 1000)
      : 0;

    // Calculate service level
    const serviceLevelPercent = this.calculateServiceLevel(queue, oldestTaskAge);

    // Get agent counts for this queue
    const agents = this.agentManager.getAllAgents();
    const agentsAssigned = Math.floor(agents.length * queueShare) || 1;
    const agentsAvailable = agents.filter((a) => a.state === 'IDLE').length;

    // Determine health status
    const status = this.determineQueueHealth(serviceLevelPercent, tasksWaiting, agentsAvailable);

    return {
      id: queue.id,
      name: queue.name,
      tasksWaiting,
      tasksInProgress,
      oldestTaskAge,
      avgWaitTime: Math.floor(oldestTaskAge * 0.6), // Approximate
      completedToday: Math.floor(sourceStats.totalCompleted * queueShare),
      serviceLevelPercent,
      slaTarget: queue.slaTarget,
      agentsAssigned,
      agentsAvailable: Math.min(agentsAvailable, agentsAssigned),
      status,
    };
  }

  /**
   * Get all queue statistics
   */
  getAllQueueStats(): QueueStats[] {
    return this.getAllQueues()
      .map((q) => this.getQueueStats(q.id))
      .filter((s): s is QueueStats => s !== null);
  }

  /**
   * Get queue summary (totals across all queues)
   */
  getQueuesSummary(): {
    totalQueues: number;
    totalWaiting: number;
    totalInProgress: number;
    avgServiceLevel: number;
    healthyQueues: number;
    warningQueues: number;
    criticalQueues: number;
  } {
    const stats = this.getAllQueueStats();

    const totalWaiting = stats.reduce((sum, s) => sum + s.tasksWaiting, 0);
    const totalInProgress = stats.reduce((sum, s) => sum + s.tasksInProgress, 0);
    const avgSL = stats.length > 0
      ? Math.round(stats.reduce((sum, s) => sum + s.serviceLevelPercent, 0) / stats.length)
      : 100;

    return {
      totalQueues: stats.length,
      totalWaiting,
      totalInProgress,
      avgServiceLevel: avgSL,
      healthyQueues: stats.filter((s) => s.status === 'healthy').length,
      warningQueues: stats.filter((s) => s.status === 'warning').length,
      criticalQueues: stats.filter((s) => s.status === 'critical').length,
    };
  }

  /**
   * Calculate service level percentage
   */
  private calculateServiceLevel(queue: QueueConfig, oldestTaskAge: number): number {
    if (oldestTaskAge === 0) return 100;

    // Service level degrades as oldest task age approaches SLA target
    const ratio = oldestTaskAge / queue.slaTarget;
    if (ratio <= 0.5) return 100;
    if (ratio <= 1.0) return Math.round(100 - (ratio - 0.5) * 40);
    if (ratio <= 2.0) return Math.round(80 - (ratio - 1.0) * 40);
    return Math.max(0, Math.round(40 - (ratio - 2.0) * 20));
  }

  /**
   * Determine queue health status
   */
  private determineQueueHealth(
    serviceLevelPercent: number,
    tasksWaiting: number,
    agentsAvailable: number
  ): 'healthy' | 'warning' | 'critical' {
    if (serviceLevelPercent < 50 || (tasksWaiting > 10 && agentsAvailable === 0)) {
      return 'critical';
    }
    if (serviceLevelPercent < 70 || (tasksWaiting > 5 && agentsAvailable === 0)) {
      return 'warning';
    }
    return 'healthy';
  }

  /**
   * Simulate task age updates (for demo purposes)
   */
  simulateTaskAging(): void {
    this.queues.forEach((queue, id) => {
      if (queue.active && Math.random() > 0.7) {
        // Randomly add new tasks or complete old ones
        if (Math.random() > 0.5) {
          this.taskAges.set(id, Date.now()); // New task
        }
      }
    });
  }
}
