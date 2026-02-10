import { Controller, Get, Logger } from '@nestjs/common';
import { AgentManagerService } from '../services/agent-manager.service';
import { QueuesService } from '../queues/queues.service';
import { DispositionService } from '../services/disposition.service';
import { TaskSourceService } from '../services/task-source.service';

interface SystemOverview {
  agents: {
    total: number;
    online: number;
    active: number;
    idle: number;
    paused: number;
  };
  queues: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
  };
  tasks: {
    pending: number;
    inProgress: number;
    completedToday: number;
  };
  performance: {
    avgServiceLevel: number;
    avgHandleTime: number;
    tasksPerHour: number;
  };
}

@Controller('metrics')
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  constructor(
    private readonly agentManager: AgentManagerService,
    private readonly queuesService: QueuesService,
    private readonly dispositionService: DispositionService,
    private readonly taskSourceService: TaskSourceService
  ) {}

  /**
   * Get system-wide overview metrics
   */
  @Get('overview')
  getOverview(): SystemOverview {
    // Agent metrics
    const agents = this.agentManager.getAllAgents();
    const activeAgents = agents.filter((a) =>
      ['ACTIVE', 'WRAP_UP', 'RESERVED'].includes(a.state)
    );
    const idleAgents = agents.filter((a) => a.state === 'IDLE');
    const pausedAgents = agents.filter((a) =>
      ['BREAK', 'LUNCH', 'TRAINING', 'MEETING'].includes(a.state as string)
    );

    // Queue metrics
    const queueSummary = this.queuesService.getQueuesSummary();

    // Task metrics
    const taskStats = this.taskSourceService.getQueueStats();
    const completions = this.dispositionService.getAllCompletions();

    // Performance metrics
    const avgHandleTime = completions.length > 0
      ? Math.round(completions.reduce((sum, c) => sum + c.handleTime, 0) / completions.length)
      : 0;

    // Calculate tasks per hour across all agents
    let totalTPH = 0;
    if (agents.length > 0) {
      agents.forEach((agent) => {
        const agentCompletions = this.dispositionService.getAgentCompletions(agent.agentId);
        const sessionMinutes = (Date.now() - agent.connectedAt.getTime()) / 60000;
        if (sessionMinutes > 0) {
          totalTPH += (agentCompletions.length / sessionMinutes) * 60;
        }
      });
      totalTPH = Math.round((totalTPH / agents.length) * 10) / 10;
    }

    return {
      agents: {
        total: agents.length,
        online: agents.length,
        active: activeAgents.length,
        idle: idleAgents.length,
        paused: pausedAgents.length,
      },
      queues: {
        total: queueSummary.totalQueues,
        healthy: queueSummary.healthyQueues,
        warning: queueSummary.warningQueues,
        critical: queueSummary.criticalQueues,
      },
      tasks: {
        pending: taskStats.totalPending,
        inProgress: taskStats.totalAssigned,
        completedToday: taskStats.totalCompleted,
      },
      performance: {
        avgServiceLevel: queueSummary.avgServiceLevel,
        avgHandleTime,
        tasksPerHour: totalTPH,
      },
    };
  }

  /**
   * Get agent performance metrics
   */
  @Get('agents')
  getAgentMetrics() {
    const agents = this.agentManager.getAllAgents();

    return agents.map((agent) => {
      const completions = this.dispositionService.getAgentCompletions(agent.agentId);
      const tasksCompleted = completions.length;
      const totalHandleTime = completions.reduce((sum, c) => sum + c.handleTime, 0);
      const avgHandleTime = tasksCompleted > 0 ? Math.round(totalHandleTime / tasksCompleted) : 0;

      const sessionMinutes = (Date.now() - agent.connectedAt.getTime()) / 60000;
      const tasksPerHour = sessionMinutes > 0
        ? Math.round((tasksCompleted / sessionMinutes) * 60 * 10) / 10
        : 0;

      return {
        agentId: agent.agentId,
        name: agent.name,
        state: agent.state,
        tasksCompleted,
        avgHandleTime,
        tasksPerHour,
        sessionDuration: Math.round(sessionMinutes),
        currentTaskId: agent.currentTaskId,
      };
    });
  }

  /**
   * Get queue performance metrics
   */
  @Get('queues')
  getQueueMetrics() {
    return this.queuesService.getAllQueueStats();
  }

  /**
   * Get disposition usage statistics
   */
  @Get('dispositions')
  getDispositionMetrics() {
    return this.dispositionService.getDispositionStats();
  }

  /**
   * Get real-time health check
   */
  @Get('health')
  getHealth() {
    const agents = this.agentManager.getAllAgents();
    const queueSummary = this.queuesService.getQueuesSummary();

    // Determine overall health
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (queueSummary.criticalQueues > 0 || agents.length === 0) {
      status = 'critical';
    } else if (queueSummary.warningQueues > 0) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      connectedAgents: agents.length,
      activeQueues: queueSummary.totalQueues - queueSummary.criticalQueues,
    };
  }
}
