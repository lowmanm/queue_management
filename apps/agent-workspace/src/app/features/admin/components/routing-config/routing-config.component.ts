import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Subject, takeUntil, forkJoin } from 'rxjs';
import {
  Skill,
  SkillCategory,
  RoutingStrategy,
  RoutingAlgorithm,
  AgentCapacity,
  RoutingConfigSummary,
  PROFICIENCY_LABELS,
  SkillProficiency,
} from '@nexus-queue/shared-models';
import {
  RoutingApiService,
  SkillCategoryOption,
  RoutingAlgorithmOption,
} from '../../../../core/services/routing-api.service';

type TabId = 'skills' | 'strategies' | 'workload';

@Component({
  selector: 'app-routing-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './routing-config.component.html',
  styleUrl: './routing-config.component.scss',
})
export class RoutingConfigComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private routingApi = inject(RoutingApiService);

  // Data streams
  skills$ = new BehaviorSubject<Skill[]>([]);
  strategies$ = new BehaviorSubject<RoutingStrategy[]>([]);
  capacities$ = new BehaviorSubject<AgentCapacity[]>([]);
  summary$ = new BehaviorSubject<RoutingConfigSummary | null>(null);
  loading$ = new BehaviorSubject<boolean>(false);

  // Options
  categories: SkillCategoryOption[] = [];
  algorithms: RoutingAlgorithmOption[] = [];
  proficiencyLabels = PROFICIENCY_LABELS;

  // UI State
  activeTab: TabId = 'skills';
  showSkillModal = false;
  showStrategyModal = false;
  isEditing = false;

  // Form data
  selectedSkill: Partial<Skill> = {};
  selectedStrategy: Partial<RoutingStrategy> = {};

  ngOnInit(): void {
    this.loadOptions();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setActiveTab(tab: TabId): void {
    this.activeTab = tab;
  }

  private loadOptions(): void {
    forkJoin([
      this.routingApi.getSkillCategories(),
      this.routingApi.getRoutingAlgorithms(),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([categories, algorithms]) => {
        this.categories = categories;
        this.algorithms = algorithms;
      });
  }

  private loadData(): void {
    this.loading$.next(true);

    forkJoin([
      this.routingApi.getAllSkills(),
      this.routingApi.getAllStrategies(),
      this.routingApi.getAllAgentCapacities(),
      this.routingApi.getConfigSummary(),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ([skills, strategies, capacities, summary]) => {
          this.skills$.next(skills);
          this.strategies$.next(strategies);
          this.capacities$.next(capacities);
          this.summary$.next(summary);
          this.loading$.next(false);
        },
        error: (err) => {
          console.error('Failed to load routing data:', err);
          this.loading$.next(false);
        },
      });
  }

  // ==========================================================================
  // SKILLS MANAGEMENT
  // ==========================================================================

  openAddSkillModal(): void {
    this.selectedSkill = {
      name: '',
      description: '',
      category: 'process',
      active: true,
    };
    this.isEditing = false;
    this.showSkillModal = true;
  }

  openEditSkillModal(skill: Skill): void {
    this.selectedSkill = { ...skill };
    this.isEditing = true;
    this.showSkillModal = true;
  }

  closeSkillModal(): void {
    this.showSkillModal = false;
    this.selectedSkill = {};
  }

  saveSkill(): void {
    if (!this.selectedSkill.name) return;

    this.loading$.next(true);

    if (this.isEditing && this.selectedSkill.id) {
      this.routingApi
        .updateSkill(this.selectedSkill.id, this.selectedSkill)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadData();
            this.closeSkillModal();
          },
          error: (err) => {
            console.error('Failed to update skill:', err);
            this.loading$.next(false);
          },
        });
    } else {
      this.routingApi
        .createSkill({
          name: this.selectedSkill.name!,
          description: this.selectedSkill.description,
          category: (this.selectedSkill.category as SkillCategory) || 'process',
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadData();
            this.closeSkillModal();
          },
          error: (err) => {
            console.error('Failed to create skill:', err);
            this.loading$.next(false);
          },
        });
    }
  }

  toggleSkillActive(skill: Skill): void {
    this.routingApi
      .toggleSkill(skill.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.loadData(),
        error: (err) => console.error('Failed to toggle skill:', err),
      });
  }

  deleteSkill(skill: Skill): void {
    if (!confirm(`Delete skill "${skill.name}"?`)) return;

    this.routingApi
      .deleteSkill(skill.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.loadData(),
        error: (err) => console.error('Failed to delete skill:', err),
      });
  }

  getSkillsByCategory(skills: Skill[], category: SkillCategory): Skill[] {
    return skills.filter((s) => s.category === category);
  }

  getCategoryName(categoryId: string): string {
    return this.categories.find((c) => c.id === categoryId)?.name || categoryId;
  }

  // ==========================================================================
  // STRATEGIES MANAGEMENT
  // ==========================================================================

  openAddStrategyModal(): void {
    this.selectedStrategy = {
      name: '',
      description: '',
      algorithm: 'skill-weighted',
      priority: 10,
      active: true,
      queueIds: [],
      workTypes: [],
      skillMatching: {
        mode: 'best-match',
        minimumProficiency: 1 as SkillProficiency,
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
        fallbackMinProficiency: 1 as SkillProficiency,
      },
    };
    this.isEditing = false;
    this.showStrategyModal = true;
  }

  openEditStrategyModal(strategy: RoutingStrategy): void {
    this.selectedStrategy = JSON.parse(JSON.stringify(strategy));
    this.isEditing = true;
    this.showStrategyModal = true;
  }

  closeStrategyModal(): void {
    this.showStrategyModal = false;
    this.selectedStrategy = {};
  }

  saveStrategy(): void {
    if (!this.selectedStrategy.name) return;

    this.loading$.next(true);

    if (this.isEditing && this.selectedStrategy.id) {
      this.routingApi
        .updateStrategy(this.selectedStrategy.id, this.selectedStrategy)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadData();
            this.closeStrategyModal();
          },
          error: (err) => {
            console.error('Failed to update strategy:', err);
            this.loading$.next(false);
          },
        });
    } else {
      this.routingApi
        .createStrategy(this.selectedStrategy as Omit<RoutingStrategy, 'id' | 'createdAt' | 'updatedAt'>)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadData();
            this.closeStrategyModal();
          },
          error: (err) => {
            console.error('Failed to create strategy:', err);
            this.loading$.next(false);
          },
        });
    }
  }

  toggleStrategyActive(strategy: RoutingStrategy): void {
    this.routingApi
      .toggleStrategy(strategy.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.loadData(),
        error: (err) => console.error('Failed to toggle strategy:', err),
      });
  }

  deleteStrategy(strategy: RoutingStrategy): void {
    if (strategy.id === 'default') {
      alert('Cannot delete the default strategy');
      return;
    }
    if (!confirm(`Delete strategy "${strategy.name}"?`)) return;

    this.routingApi
      .deleteStrategy(strategy.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.loadData(),
        error: (err) => console.error('Failed to delete strategy:', err),
      });
  }

  getAlgorithmName(algorithmId: string): string {
    return this.algorithms.find((a) => a.id === algorithmId)?.name || algorithmId;
  }

  // ==========================================================================
  // WORKLOAD DISPLAY
  // ==========================================================================

  getCapacityClass(capacity: AgentCapacity): string {
    if (!capacity.available) return 'unavailable';
    if (capacity.utilization >= 80) return 'high';
    if (capacity.utilization >= 50) return 'medium';
    return 'low';
  }

  getStateClass(state: string): string {
    const stateClasses: Record<string, string> = {
      IDLE: 'state-idle',
      ACTIVE: 'state-active',
      RESERVED: 'state-reserved',
      WRAP_UP: 'state-wrapup',
      OFFLINE: 'state-offline',
    };
    return stateClasses[state] || 'state-offline';
  }

  formatIdleTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  refreshData(): void {
    this.loadData();
  }
}
