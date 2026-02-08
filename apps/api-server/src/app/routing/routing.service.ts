import { Injectable, Logger } from '@nestjs/common';
import {
  Skill,
  SkillCategory,
  AgentSkill,
  RoutingStrategy,
  RoutingAlgorithm,
  SkillMatchingConfig,
  WorkloadBalancingConfig,
  AgentRoutingScore,
  RoutingDecision,
  AgentCapacity,
  RoutingConfigSummary,
  SkillProficiency,
  Task,
} from '@nexus-queue/shared-models';
import { AgentManagerService, ConnectedAgent } from '../services/agent-manager.service';
import { DispositionService } from '../services/disposition.service';
import { RbacService } from '../services/rbac.service';

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  // In-memory storage
  private skills = new Map<string, Skill>();
  private agentSkills = new Map<string, AgentSkill[]>(); // agentId -> skills
  private strategies = new Map<string, RoutingStrategy>();

  // Round-robin state
  private roundRobinIndex = 0;

  constructor(
    private readonly agentManager: AgentManagerService,
    private readonly dispositionService: DispositionService,
    private readonly rbacService: RbacService
  ) {
    this.initializeDefaults();
  }

  private initializeDefaults(): void {
    const now = new Date().toISOString();

    // Initialize default skills
    const defaultSkills: Omit<Skill, 'createdAt' | 'updatedAt'>[] = [
      { id: 'orders', name: 'Order Processing', category: 'process', active: true },
      { id: 'returns', name: 'Returns & Refunds', category: 'process', active: true },
      { id: 'claims', name: 'Claims Handling', category: 'process', active: true },
      { id: 'escalation', name: 'Escalation Handling', category: 'process', active: true },
      { id: 'billing', name: 'Billing Support', category: 'process', active: true },
      { id: 'technical', name: 'Technical Support', category: 'technical', active: true },
      { id: 'spanish', name: 'Spanish Language', category: 'language', active: true },
      { id: 'french', name: 'French Language', category: 'language', active: true },
      { id: 'german', name: 'German Language', category: 'language', active: true },
      { id: 'priority', name: 'Priority Customers', category: 'certification', active: true },
      { id: 'vip', name: 'VIP Customers', category: 'certification', active: true },
    ];

    defaultSkills.forEach((s) => {
      this.skills.set(s.id, { ...s, createdAt: now, updatedAt: now });
    });

    // Initialize default routing strategy
    const defaultStrategy: RoutingStrategy = {
      id: 'default',
      name: 'Default Routing',
      description: 'Standard skill-based routing with workload balancing',
      algorithm: 'skill-weighted',
      priority: 1,
      active: true,
      queueIds: [],
      workTypes: [],
      skillMatching: {
        mode: 'best-match',
        minimumProficiency: 1,
        proficiencyWeight: 40,
        requireAllSkills: false,
        preferredSkills: [],
        excludedSkills: [],
      },
      workloadBalancing: {
        enabled: true,
        maxTasksPerAgent: 5,
        maxConcurrentTasks: 1,
        taskCountWeight: 30,
        handleTimeWeight: 15,
        idleTimeWeight: 15,
        considerPerformance: true,
        performanceWindowMinutes: 60,
      },
      fallbackBehavior: {
        action: 'any_available',
        waitTimeSeconds: 30,
        relaxSkillRequirements: true,
        fallbackMinProficiency: 1,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.strategies.set(defaultStrategy.id, defaultStrategy);

    // Assign default skills to demo agents
    this.assignDefaultAgentSkills();

    this.logger.log(`Initialized ${defaultSkills.length} skills and default routing strategy`);
  }

  private assignDefaultAgentSkills(): void {
    const now = new Date().toISOString();

    // Agent skill assignments for demo users
    const assignments: Record<string, { skillId: string; proficiency: SkillProficiency }[]> = {
      'user-agent1': [
        { skillId: 'orders', proficiency: 5 },
        { skillId: 'billing', proficiency: 3 },
        { skillId: 'priority', proficiency: 4 },
      ],
      'user-agent2': [
        { skillId: 'returns', proficiency: 5 },
        { skillId: 'claims', proficiency: 4 },
        { skillId: 'spanish', proficiency: 4 },
      ],
      'user-agent3': [
        { skillId: 'claims', proficiency: 5 },
        { skillId: 'escalation', proficiency: 5 },
        { skillId: 'technical', proficiency: 3 },
      ],
    };

    Object.entries(assignments).forEach(([agentId, skills]) => {
      const agentSkillList: AgentSkill[] = skills.map((s) => ({
        skillId: s.skillId,
        proficiency: s.proficiency,
        active: true,
        assignedAt: now,
        updatedAt: now,
      }));
      this.agentSkills.set(agentId, agentSkillList);
    });
  }

  // ==========================================================================
  // SKILL MANAGEMENT
  // ==========================================================================

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  getSkillById(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  getSkillsByCategory(category: SkillCategory): Skill[] {
    return this.getAllSkills().filter((s) => s.category === category);
  }

  createSkill(data: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'>): Skill {
    const now = new Date().toISOString();
    const id = `skill-${Date.now()}`;
    const skill: Skill = { ...data, id, createdAt: now, updatedAt: now };
    this.skills.set(id, skill);
    this.logger.log(`Created skill: ${skill.name}`);
    return skill;
  }

  updateSkill(id: string, data: Partial<Skill>): Skill | null {
    const skill = this.skills.get(id);
    if (!skill) return null;

    const updated = { ...skill, ...data, id, updatedAt: new Date().toISOString() };
    this.skills.set(id, updated);
    this.logger.log(`Updated skill: ${updated.name}`);
    return updated;
  }

  deleteSkill(id: string): boolean {
    const deleted = this.skills.delete(id);
    if (deleted) {
      // Remove from agent assignments
      this.agentSkills.forEach((skills, agentId) => {
        this.agentSkills.set(
          agentId,
          skills.filter((s) => s.skillId !== id)
        );
      });
      this.logger.log(`Deleted skill: ${id}`);
    }
    return deleted;
  }

  // ==========================================================================
  // AGENT SKILL MANAGEMENT
  // ==========================================================================

  getAgentSkills(agentId: string): AgentSkill[] {
    return this.agentSkills.get(agentId) || [];
  }

  setAgentSkills(agentId: string, skills: AgentSkill[]): void {
    this.agentSkills.set(agentId, skills);
    this.logger.log(`Updated skills for agent ${agentId}: ${skills.length} skills`);
  }

  addAgentSkill(agentId: string, skillId: string, proficiency: SkillProficiency): AgentSkill {
    const now = new Date().toISOString();
    const skills = this.getAgentSkills(agentId);

    // Check if already exists
    const existing = skills.find((s) => s.skillId === skillId);
    if (existing) {
      existing.proficiency = proficiency;
      existing.updatedAt = now;
      this.agentSkills.set(agentId, skills);
      return existing;
    }

    const newSkill: AgentSkill = {
      skillId,
      proficiency,
      active: true,
      assignedAt: now,
      updatedAt: now,
    };
    skills.push(newSkill);
    this.agentSkills.set(agentId, skills);
    return newSkill;
  }

  removeAgentSkill(agentId: string, skillId: string): boolean {
    const skills = this.getAgentSkills(agentId);
    const filtered = skills.filter((s) => s.skillId !== skillId);
    if (filtered.length < skills.length) {
      this.agentSkills.set(agentId, filtered);
      return true;
    }
    return false;
  }

  // ==========================================================================
  // STRATEGY MANAGEMENT
  // ==========================================================================

  getAllStrategies(): RoutingStrategy[] {
    return Array.from(this.strategies.values()).sort((a, b) => a.priority - b.priority);
  }

  getStrategyById(id: string): RoutingStrategy | undefined {
    return this.strategies.get(id);
  }

  createStrategy(data: Omit<RoutingStrategy, 'id' | 'createdAt' | 'updatedAt'>): RoutingStrategy {
    const now = new Date().toISOString();
    const id = `strategy-${Date.now()}`;
    const strategy: RoutingStrategy = { ...data, id, createdAt: now, updatedAt: now };
    this.strategies.set(id, strategy);
    this.logger.log(`Created strategy: ${strategy.name}`);
    return strategy;
  }

  updateStrategy(id: string, data: Partial<RoutingStrategy>): RoutingStrategy | null {
    const strategy = this.strategies.get(id);
    if (!strategy) return null;

    const updated = { ...strategy, ...data, id, updatedAt: new Date().toISOString() };
    this.strategies.set(id, updated);
    this.logger.log(`Updated strategy: ${updated.name}`);
    return updated;
  }

  deleteStrategy(id: string): boolean {
    if (id === 'default') {
      this.logger.warn('Cannot delete default strategy');
      return false;
    }
    return this.strategies.delete(id);
  }

  // ==========================================================================
  // ROUTING DECISION ENGINE
  // ==========================================================================

  /**
   * Find the best agent for a task using configured routing strategies
   */
  routeTask(task: Task): RoutingDecision {
    const startTime = Date.now();
    const requiredSkills = task.skills || [];
    const taskQueue = task.queue || task.queueId || '';
    const taskWorkType = task.workType;

    // Find applicable strategy
    const strategy = this.findApplicableStrategy(taskQueue, taskWorkType);

    // Get all available agents
    const allAgents = this.agentManager.getAllAgents();
    const availableAgents = allAgents.filter((a) => a.state === 'IDLE');

    // Score all agents
    const agentScores = availableAgents.map((agent) =>
      this.scoreAgent(agent, requiredSkills, strategy)
    );

    // Sort by score (highest first)
    agentScores.sort((a, b) => b.totalScore - a.totalScore);

    // Find eligible agents
    const eligibleAgents = agentScores.filter((a) => a.eligible);

    // Select best agent based on algorithm
    let selectedAgentId: string | null = null;
    let usedFallback = false;

    if (eligibleAgents.length > 0) {
      selectedAgentId = this.selectByAlgorithm(eligibleAgents, strategy.algorithm);
    } else if (strategy.fallbackBehavior.action === 'any_available' && agentScores.length > 0) {
      // Fallback: take any available agent
      usedFallback = true;
      selectedAgentId = agentScores[0].agentId;
    }

    const decision: RoutingDecision = {
      taskId: task.id,
      selectedAgentId,
      strategyId: strategy.id,
      strategyName: strategy.name,
      algorithm: strategy.algorithm,
      agentScores,
      timestamp: new Date().toISOString(),
      usedFallback,
      fallbackAction: usedFallback ? strategy.fallbackBehavior.action : undefined,
      metadata: {
        totalAgentsEvaluated: agentScores.length,
        eligibleAgents: eligibleAgents.length,
        evaluationTimeMs: Date.now() - startTime,
        requiredSkills,
        preferredSkills: strategy.skillMatching.preferredSkills,
      },
    };

    this.logger.log(
      `Routing decision for task ${task.id}: ` +
        `${selectedAgentId ? `assigned to ${selectedAgentId}` : 'no agent found'} ` +
        `(${eligibleAgents.length}/${agentScores.length} eligible, ${decision.metadata.evaluationTimeMs}ms)`
    );

    return decision;
  }

  private findApplicableStrategy(queue: string, workType: string): RoutingStrategy {
    const strategies = this.getAllStrategies().filter((s) => s.active);

    for (const strategy of strategies) {
      // Check queue filter
      if (strategy.queueIds.length > 0 && !strategy.queueIds.includes(queue)) {
        continue;
      }
      // Check work type filter
      if (strategy.workTypes.length > 0 && !strategy.workTypes.includes(workType)) {
        continue;
      }
      return strategy;
    }

    // Return default strategy
    return this.strategies.get('default')!;
  }

  private scoreAgent(
    agent: ConnectedAgent,
    requiredSkills: string[],
    strategy: RoutingStrategy
  ): AgentRoutingScore {
    const agentId = agent.agentId;
    const agentSkillsList = this.getAgentSkills(agentId);
    const agentSkillMap = new Map(agentSkillsList.map((s) => [s.skillId, s]));

    // Calculate skill score
    const { skillScore, matchedSkills, missingSkills, meetsRequirements } = this.calculateSkillScore(
      agentSkillMap,
      requiredSkills,
      strategy.skillMatching
    );

    // Calculate workload score
    const workloadScore = this.calculateWorkloadScore(agent, strategy.workloadBalancing);

    // Calculate performance score
    const performanceScore = strategy.workloadBalancing.considerPerformance
      ? this.calculatePerformanceScore(agentId)
      : 50;

    // Calculate idle time score
    const timeInState = Math.floor((Date.now() - agent.lastStateChangeAt.getTime()) / 1000);
    const idleTimeScore = Math.min(100, timeInState / 10); // More idle = higher score

    // Combine scores with weights
    const config = strategy.skillMatching;
    const wlConfig = strategy.workloadBalancing;

    const totalWeight =
      config.proficiencyWeight +
      wlConfig.taskCountWeight +
      wlConfig.handleTimeWeight +
      wlConfig.idleTimeWeight;

    const totalScore =
      totalWeight > 0
        ? Math.round(
            (skillScore * config.proficiencyWeight +
              workloadScore * wlConfig.taskCountWeight +
              performanceScore * wlConfig.handleTimeWeight +
              idleTimeScore * wlConfig.idleTimeWeight) /
              totalWeight
          )
        : 50;

    // Determine eligibility
    let eligible = meetsRequirements && agent.state === 'IDLE';
    let ineligibilityReason: string | undefined;

    if (!eligible) {
      if (agent.state !== 'IDLE') {
        ineligibilityReason = `Agent is in ${agent.state} state`;
      } else if (!meetsRequirements) {
        ineligibilityReason = `Missing required skills: ${missingSkills.join(', ')}`;
      }
    }

    return {
      agentId,
      agentName: agent.name,
      totalScore,
      skillScore,
      workloadScore,
      performanceScore,
      idleTimeScore,
      matchedSkills,
      missingSkills,
      currentTaskCount: agent.currentTaskId ? 1 : 0,
      timeInState,
      eligible,
      ineligibilityReason,
    };
  }

  private calculateSkillScore(
    agentSkills: Map<string, AgentSkill>,
    requiredSkills: string[],
    config: SkillMatchingConfig
  ): {
    skillScore: number;
    matchedSkills: string[];
    missingSkills: string[];
    meetsRequirements: boolean;
  } {
    if (requiredSkills.length === 0) {
      return { skillScore: 100, matchedSkills: [], missingSkills: [], meetsRequirements: true };
    }

    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];
    let totalProficiency = 0;

    for (const skillId of requiredSkills) {
      const agentSkill = agentSkills.get(skillId);
      if (agentSkill && agentSkill.active && agentSkill.proficiency >= config.minimumProficiency) {
        matchedSkills.push(skillId);
        totalProficiency += agentSkill.proficiency;
      } else {
        missingSkills.push(skillId);
      }
    }

    // Calculate score based on mode
    let skillScore = 0;
    let meetsRequirements = false;

    switch (config.mode) {
      case 'strict':
        meetsRequirements = missingSkills.length === 0;
        skillScore = meetsRequirements ? (totalProficiency / (requiredSkills.length * 5)) * 100 : 0;
        break;

      case 'flexible':
        meetsRequirements = matchedSkills.length >= requiredSkills.length / 2;
        skillScore = (matchedSkills.length / requiredSkills.length) * 100;
        break;

      case 'any':
        meetsRequirements = matchedSkills.length > 0;
        skillScore = (matchedSkills.length / requiredSkills.length) * 100;
        break;

      case 'best-match':
      default:
        meetsRequirements = matchedSkills.length > 0 || !config.requireAllSkills;
        const matchRatio = matchedSkills.length / requiredSkills.length;
        const proficiencyRatio = totalProficiency / (matchedSkills.length * 5 || 1);
        skillScore = (matchRatio * 0.6 + proficiencyRatio * 0.4) * 100;
        break;
    }

    return { skillScore: Math.round(skillScore), matchedSkills, missingSkills, meetsRequirements };
  }

  private calculateWorkloadScore(agent: ConnectedAgent, config: WorkloadBalancingConfig): number {
    if (!config.enabled) return 50;

    const currentTasks = agent.currentTaskId ? 1 : 0;
    const taskRatio = currentTasks / config.maxConcurrentTasks;

    // Lower task count = higher score
    return Math.round((1 - taskRatio) * 100);
  }

  private calculatePerformanceScore(agentId: string): number {
    const completions = this.dispositionService.getAgentCompletions(agentId);
    if (completions.length === 0) return 50;

    // Calculate average handle time
    const avgHandleTime =
      completions.reduce((sum, c) => sum + c.handleTime, 0) / completions.length;

    // Normalize to score (faster = higher, assuming 300s is target)
    const targetHandleTime = 300;
    const ratio = avgHandleTime / targetHandleTime;
    return Math.round(Math.max(0, Math.min(100, (2 - ratio) * 50)));
  }

  private selectByAlgorithm(agents: AgentRoutingScore[], algorithm: RoutingAlgorithm): string {
    switch (algorithm) {
      case 'round-robin':
        this.roundRobinIndex = (this.roundRobinIndex + 1) % agents.length;
        return agents[this.roundRobinIndex].agentId;

      case 'least-busy':
        return agents.sort((a, b) => a.currentTaskCount - b.currentTaskCount)[0].agentId;

      case 'most-idle':
        return agents.sort((a, b) => b.timeInState - a.timeInState)[0].agentId;

      case 'proficiency-first':
        return agents.sort((a, b) => b.skillScore - a.skillScore)[0].agentId;

      case 'load-balanced':
        return agents.sort((a, b) => b.workloadScore - a.workloadScore)[0].agentId;

      case 'skill-weighted':
      case 'priority-cascade':
      default:
        // Already sorted by total score
        return agents[0].agentId;
    }
  }

  // ==========================================================================
  // AGENT CAPACITY
  // ==========================================================================

  getAgentCapacity(agentId: string): AgentCapacity | null {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent) return null;

    const completions = this.dispositionService.getAgentCompletions(agentId);
    const avgHandleTime =
      completions.length > 0
        ? completions.reduce((sum, c) => sum + c.handleTime, 0) / completions.length
        : 0;

    const activeTasks = agent.currentTaskId ? 1 : 0;
    const maxTasks = 1; // For now, single task mode

    return {
      agentId,
      state: agent.state,
      activeTasks,
      maxTasks,
      utilization: (activeTasks / maxTasks) * 100,
      idleTime: Math.floor((Date.now() - agent.lastStateChangeAt.getTime()) / 1000),
      tasksCompletedToday: completions.length,
      avgHandleTimeToday: Math.round(avgHandleTime),
      atCapacity: activeTasks >= maxTasks,
      available: agent.state === 'IDLE' && activeTasks < maxTasks,
    };
  }

  getAllAgentCapacities(): AgentCapacity[] {
    return this.agentManager
      .getAllAgents()
      .map((a) => this.getAgentCapacity(a.agentId))
      .filter((c): c is AgentCapacity => c !== null);
  }

  // ==========================================================================
  // CONFIGURATION SUMMARY
  // ==========================================================================

  getConfigSummary(): RoutingConfigSummary {
    const strategies = this.getAllStrategies();
    const skills = this.getAllSkills();
    const defaultStrategy = this.strategies.get('default');

    return {
      totalStrategies: strategies.length,
      activeStrategies: strategies.filter((s) => s.active).length,
      totalSkills: skills.length,
      activeSkills: skills.filter((s) => s.active).length,
      defaultAlgorithm: defaultStrategy?.algorithm || 'skill-weighted',
      workloadBalancingEnabled: defaultStrategy?.workloadBalancing.enabled ?? true,
    };
  }
}
