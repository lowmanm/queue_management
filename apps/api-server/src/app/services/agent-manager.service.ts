import { Injectable, Logger } from '@nestjs/common';
import { AgentState } from '@nexus-queue/shared-models';

export interface ConnectedAgent {
  socketId: string;
  agentId: string;
  name: string;
  state: AgentState;
  currentTaskId?: string;
  connectedAt: Date;
  lastStateChangeAt: Date;
}

@Injectable()
export class AgentManagerService {
  private readonly logger = new Logger(AgentManagerService.name);

  // Map of agentId -> ConnectedAgent
  private agents = new Map<string, ConnectedAgent>();

  // Map of socketId -> agentId for quick lookup on disconnect
  private socketToAgent = new Map<string, string>();

  /**
   * Register a new agent connection
   */
  registerAgent(params: {
    socketId: string;
    agentId: string;
    name: string;
    state: AgentState;
  }): ConnectedAgent {
    const now = new Date();

    const agent: ConnectedAgent = {
      socketId: params.socketId,
      agentId: params.agentId,
      name: params.name,
      state: params.state,
      connectedAt: now,
      lastStateChangeAt: now,
    };

    this.agents.set(params.agentId, agent);
    this.socketToAgent.set(params.socketId, params.agentId);

    this.logger.log(`Agent registered: ${params.agentId} (socket: ${params.socketId})`);
    this.logAgentCount();

    return agent;
  }

  /**
   * Remove agent by socket ID (on disconnect)
   */
  removeAgentBySocketId(socketId: string): void {
    const agentId = this.socketToAgent.get(socketId);
    if (agentId) {
      this.agents.delete(agentId);
      this.socketToAgent.delete(socketId);
      this.logger.log(`Agent removed: ${agentId}`);
      this.logAgentCount();
    }
  }

  /**
   * Remove agent by agent ID
   */
  removeAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.socketToAgent.delete(agent.socketId);
      this.agents.delete(agentId);
      this.logger.log(`Agent removed: ${agentId}`);
      this.logAgentCount();
    }
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): ConnectedAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get agent by socket ID
   */
  getAgentBySocketId(socketId: string): ConnectedAgent | undefined {
    const agentId = this.socketToAgent.get(socketId);
    return agentId ? this.agents.get(agentId) : undefined;
  }

  /**
   * Update agent state
   */
  updateAgentState(agentId: string, state: AgentState): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.state = state;
      agent.lastStateChangeAt = new Date();
      this.logger.debug(`Agent ${agentId} state updated to: ${state}`);
    }
  }

  /**
   * Assign task to agent
   */
  assignTaskToAgent(agentId: string, taskId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.currentTaskId = taskId;
      agent.state = 'RESERVED';
      agent.lastStateChangeAt = new Date();
    }
  }

  /**
   * Clear agent's current task
   */
  clearAgentTask(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.currentTaskId = undefined;
    }
  }

  /**
   * Get all agents in a specific state
   */
  getAgentsByState(state: AgentState): ConnectedAgent[] {
    return Array.from(this.agents.values()).filter((a) => a.state === state);
  }

  /**
   * Get all IDLE agents (ready for work)
   */
  getIdleAgents(): ConnectedAgent[] {
    return this.getAgentsByState('IDLE');
  }

  /**
   * Get all connected agents
   */
  getAllAgents(): ConnectedAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get count of connected agents
   */
  getAgentCount(): number {
    return this.agents.size;
  }

  /**
   * Check if agent is connected
   */
  isAgentConnected(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  private logAgentCount(): void {
    this.logger.debug(`Total connected agents: ${this.agents.size}`);
  }
}
