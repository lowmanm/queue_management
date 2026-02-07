import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RoutingService } from './routing.service';
import {
  Skill,
  SkillCategory,
  AgentSkill,
  RoutingStrategy,
  SkillProficiency,
} from '@nexus-queue/shared-models';

@Controller('routing')
export class RoutingController {
  private readonly logger = new Logger(RoutingController.name);

  constructor(private readonly routingService: RoutingService) {}

  // ==========================================================================
  // SKILLS
  // ==========================================================================

  @Get('skills')
  getAllSkills(@Query('category') category?: SkillCategory): Skill[] {
    if (category) {
      return this.routingService.getSkillsByCategory(category);
    }
    return this.routingService.getAllSkills();
  }

  @Get('skills/:id')
  getSkill(@Param('id') id: string): Skill {
    const skill = this.routingService.getSkillById(id);
    if (!skill) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return skill;
  }

  @Post('skills')
  createSkill(
    @Body() data: { name: string; description?: string; category: SkillCategory }
  ): Skill {
    return this.routingService.createSkill({
      name: data.name,
      description: data.description,
      category: data.category,
      active: true,
    });
  }

  @Put('skills/:id')
  updateSkill(@Param('id') id: string, @Body() data: Partial<Skill>): Skill {
    const skill = this.routingService.updateSkill(id, data);
    if (!skill) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return skill;
  }

  @Delete('skills/:id')
  deleteSkill(@Param('id') id: string): { success: boolean } {
    const deleted = this.routingService.deleteSkill(id);
    return { success: deleted };
  }

  @Post('skills/:id/toggle')
  toggleSkill(@Param('id') id: string): Skill {
    const skill = this.routingService.getSkillById(id);
    if (!skill) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    const updated = this.routingService.updateSkill(id, { active: !skill.active });
    return updated!;
  }

  // ==========================================================================
  // AGENT SKILLS
  // ==========================================================================

  @Get('agents/:agentId/skills')
  getAgentSkills(@Param('agentId') agentId: string): AgentSkill[] {
    return this.routingService.getAgentSkills(agentId);
  }

  @Put('agents/:agentId/skills')
  setAgentSkills(
    @Param('agentId') agentId: string,
    @Body() data: { skills: AgentSkill[] }
  ): { success: boolean; count: number } {
    this.routingService.setAgentSkills(agentId, data.skills);
    return { success: true, count: data.skills.length };
  }

  @Post('agents/:agentId/skills')
  addAgentSkill(
    @Param('agentId') agentId: string,
    @Body() data: { skillId: string; proficiency: SkillProficiency }
  ): AgentSkill {
    return this.routingService.addAgentSkill(agentId, data.skillId, data.proficiency);
  }

  @Delete('agents/:agentId/skills/:skillId')
  removeAgentSkill(
    @Param('agentId') agentId: string,
    @Param('skillId') skillId: string
  ): { success: boolean } {
    const removed = this.routingService.removeAgentSkill(agentId, skillId);
    return { success: removed };
  }

  // ==========================================================================
  // STRATEGIES
  // ==========================================================================

  @Get('strategies')
  getAllStrategies(): RoutingStrategy[] {
    return this.routingService.getAllStrategies();
  }

  @Get('strategies/:id')
  getStrategy(@Param('id') id: string): RoutingStrategy {
    const strategy = this.routingService.getStrategyById(id);
    if (!strategy) {
      throw new HttpException('Strategy not found', HttpStatus.NOT_FOUND);
    }
    return strategy;
  }

  @Post('strategies')
  createStrategy(
    @Body() data: Omit<RoutingStrategy, 'id' | 'createdAt' | 'updatedAt'>
  ): RoutingStrategy {
    return this.routingService.createStrategy(data);
  }

  @Put('strategies/:id')
  updateStrategy(
    @Param('id') id: string,
    @Body() data: Partial<RoutingStrategy>
  ): RoutingStrategy {
    const strategy = this.routingService.updateStrategy(id, data);
    if (!strategy) {
      throw new HttpException('Strategy not found', HttpStatus.NOT_FOUND);
    }
    return strategy;
  }

  @Delete('strategies/:id')
  deleteStrategy(@Param('id') id: string): { success: boolean } {
    const deleted = this.routingService.deleteStrategy(id);
    return { success: deleted };
  }

  @Post('strategies/:id/toggle')
  toggleStrategy(@Param('id') id: string): RoutingStrategy {
    const strategy = this.routingService.getStrategyById(id);
    if (!strategy) {
      throw new HttpException('Strategy not found', HttpStatus.NOT_FOUND);
    }
    const updated = this.routingService.updateStrategy(id, { active: !strategy.active });
    return updated!;
  }

  // ==========================================================================
  // CAPACITY & ROUTING
  // ==========================================================================

  @Get('capacity')
  getAllAgentCapacities() {
    return this.routingService.getAllAgentCapacities();
  }

  @Get('capacity/:agentId')
  getAgentCapacity(@Param('agentId') agentId: string) {
    const capacity = this.routingService.getAgentCapacity(agentId);
    if (!capacity) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }
    return capacity;
  }

  @Get('summary')
  getConfigSummary() {
    return this.routingService.getConfigSummary();
  }

  // ==========================================================================
  // SKILL CATEGORIES
  // ==========================================================================

  @Get('categories')
  getSkillCategories(): { id: SkillCategory; name: string }[] {
    return [
      { id: 'language', name: 'Language' },
      { id: 'product', name: 'Product Knowledge' },
      { id: 'technical', name: 'Technical' },
      { id: 'process', name: 'Process' },
      { id: 'certification', name: 'Certification' },
      { id: 'other', name: 'Other' },
    ];
  }

  // ==========================================================================
  // ALGORITHMS
  // ==========================================================================

  @Get('algorithms')
  getRoutingAlgorithms(): { id: string; name: string; description: string }[] {
    return [
      { id: 'round-robin', name: 'Round Robin', description: 'Distribute tasks evenly in rotation' },
      { id: 'least-busy', name: 'Least Busy', description: 'Assign to agent with fewest active tasks' },
      { id: 'most-idle', name: 'Most Idle', description: 'Assign to agent idle the longest' },
      { id: 'skill-weighted', name: 'Skill Weighted', description: 'Best skill match with proficiency weighting' },
      { id: 'proficiency-first', name: 'Proficiency First', description: 'Highest proficiency for required skills' },
      { id: 'load-balanced', name: 'Load Balanced', description: 'Even distribution based on capacity' },
      { id: 'priority-cascade', name: 'Priority Cascade', description: 'Try high proficiency first, cascade down' },
    ];
  }
}
