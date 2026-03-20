import { Injectable, Logger } from '@nestjs/common';
import { AgentState } from '@nexus-queue/shared-models';
import { RedisService } from '../redis';

export interface ConnectedAgent {
  socketId: string;
  agentId: string;
  name: string;
  state: AgentState;
  currentTaskId?: string;
  connectedAt: Date;
  lastStateChangeAt: Date;
}

/** TTL for agent state keys in Redis — refreshed on every state update. */
const AGENT_TTL_SECONDS = 300; // 5 minutes

/** Redis key patterns */
const agentKey = (agentId: string) => `agent:state:${agentId}`;
const SOCKET_MAP_KEY = 'socket:agent:map';

@Injectable()
export class AgentManagerService {
  private readonly logger = new Logger(AgentManagerService.name);

  // In-memory write-through cache — used for fast synchronous reads
  private agents = new Map<string, ConnectedAgent>();
  private socketToAgent = new Map<string, string>();

  constructor(private readonly redisService: RedisService) {}

  // === Private serialisation helpers ===

  private serialize(agent: ConnectedAgent): string {
    return JSON.stringify({
      ...agent,
      connectedAt: agent.connectedAt.toISOString(),
      lastStateChangeAt: agent.lastStateChangeAt.toISOString(),
    });
  }

  private async persistAgent(agent: ConnectedAgent): Promise<void> {
    await this.redisService.set(agentKey(agent.agentId), this.serialize(agent), {
      ttl: AGENT_TTL_SECONDS,
    });
  }

  // === Write operations (async — update both cache and Redis) ===

  /**
   * Register a new agent connection
   */
  async registerAgent(params: {
    socketId: string;
    agentId: string;
    name: string;
    state: AgentState;
  }): Promise<ConnectedAgent> {
    const now = new Date();

    const agent: ConnectedAgent = {
      socketId: params.socketId,
      agentId: params.agentId,
      name: params.name,
      state: params.state,
      connectedAt: now,
      lastStateChangeAt: now,
    };

    // In-memory cache
    this.agents.set(params.agentId, agent);
    this.socketToAgent.set(params.socketId, params.agentId);

    // Redis persistence
    await this.persistAgent(agent);
    await this.redisService.hset(SOCKET_MAP_KEY, params.socketId, params.agentId);

    this.logger.log(`Agent registered: ${params.agentId} (socket: ${params.socketId})`);
    this.logAgentCount();

    return agent;
  }

  /**
   * Remove agent by socket ID (on disconnect)
   */
  async removeAgentBySocketId(socketId: string): Promise<void> {
    const agentId = this.socketToAgent.get(socketId);

    if (agentId) {
      this.agents.delete(agentId);
      this.socketToAgent.delete(socketId);

      await this.redisService.del(agentKey(agentId));
      await this.redisService.hdel(SOCKET_MAP_KEY, socketId);

      this.logger.log(`Agent removed: ${agentId}`);
      this.logAgentCount();
    }
  }

  /**
   * Remove agent by agent ID
   */
  async removeAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.socketToAgent.delete(agent.socketId);
      this.agents.delete(agentId);

      await this.redisService.del(agentKey(agentId));
      await this.redisService.hdel(SOCKET_MAP_KEY, agent.socketId);

      this.logger.log(`Agent removed: ${agentId}`);
      this.logAgentCount();
    }
  }

  /**
   * Update agent state
   */
  async updateAgentState(agentId: string, state: AgentState): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.state = state;
      agent.lastStateChangeAt = new Date();
      await this.persistAgent(agent);
      this.logger.debug(`Agent ${agentId} state updated to: ${state}`);
    }
  }

  /**
   * Assign task to agent
   */
  async assignTaskToAgent(agentId: string, taskId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.currentTaskId = taskId;
      agent.state = 'RESERVED';
      agent.lastStateChangeAt = new Date();
      await this.persistAgent(agent);
    }
  }

  /**
   * Clear agent's current task
   */
  async clearAgentTask(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.currentTaskId = undefined;
      await this.persistAgent(agent);
    }
  }

  // === Sync read operations (use in-memory cache — fast, single-instance safe) ===

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
