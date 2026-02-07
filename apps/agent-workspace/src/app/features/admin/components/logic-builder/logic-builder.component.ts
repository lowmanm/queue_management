import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, combineLatest } from 'rxjs';
import {
  RuleSet,
  Rule,
  RuleCondition,
  ConditionGroup,
  RuleAction,
  RuleFieldConfig,
  RuleActionConfig,
  ConditionOperator,
  LogicalOperator,
} from '@nexus-queue/shared-models';
import { RulesService, OperatorConfig } from '../../services/rules.service';
import { LoggerService } from '../../../../core/services';

const LOG_CONTEXT = 'LogicBuilder';

@Component({
  selector: 'app-logic-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './logic-builder.component.html',
  styleUrl: './logic-builder.component.scss',
})
export class LogicBuilderComponent implements OnInit, OnDestroy {
  private logger = inject(LoggerService);
  private rulesService = inject(RulesService);
  private destroy$ = new Subject<void>();

  // Configuration
  fields: RuleFieldConfig[] = [];
  actions: RuleActionConfig[] = [];
  operators: OperatorConfig[] = [];

  // Data
  ruleSets: RuleSet[] = [];
  selectedRuleSet: RuleSet | null = null;
  selectedRule: Rule | null = null;

  // UI State
  isLoading = true;
  isSaving = false;
  editMode = false;
  showRuleEditor = false;

  // New rule template
  private newRuleTemplate: Rule = {
    id: '',
    name: 'New Rule',
    description: '',
    enabled: true,
    order: 0,
    conditionGroup: {
      id: 'cg-new',
      operator: 'AND',
      conditions: [],
    },
    actions: [],
    createdAt: '',
    updatedAt: '',
  };

  ngOnInit(): void {
    this.logger.info(LOG_CONTEXT, 'Initializing Logic Builder');

    // Load configuration
    this.rulesService.loadConfiguration();

    // Subscribe to configuration
    combineLatest([
      this.rulesService.fields$,
      this.rulesService.actions$,
      this.rulesService.operators$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([fields, actions, operators]) => {
        this.fields = fields;
        this.actions = actions;
        this.operators = operators;
      });

    // Load rule sets
    this.rulesService.ruleSets$.pipe(takeUntil(this.destroy$)).subscribe((ruleSets) => {
      this.ruleSets = ruleSets;
      this.isLoading = false;
    });

    this.rulesService.getRuleSets().subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==========================================================================
  // RULE SET MANAGEMENT
  // ==========================================================================

  selectRuleSet(ruleSet: RuleSet): void {
    this.selectedRuleSet = { ...ruleSet, rules: [...ruleSet.rules] };
    this.selectedRule = null;
    this.showRuleEditor = false;
    this.editMode = false;
    this.logger.debug(LOG_CONTEXT, 'Rule set selected', { id: ruleSet.id });
  }

  createNewRuleSet(): void {
    const newRuleSet: RuleSet = {
      id: `rs-${Date.now()}`,
      name: 'New Rule Set',
      description: '',
      enabled: true,
      rules: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.selectedRuleSet = newRuleSet;
    this.selectedRule = null;
    this.editMode = true;
    this.logger.info(LOG_CONTEXT, 'Creating new rule set');
  }

  saveRuleSet(): void {
    if (!this.selectedRuleSet) return;

    this.isSaving = true;
    this.logger.info(LOG_CONTEXT, 'Saving rule set', { id: this.selectedRuleSet.id });

    const isNew = !this.ruleSets.find((rs) => rs.id === this.selectedRuleSet!.id);

    const save$ = isNew
      ? this.rulesService.createRuleSet(this.selectedRuleSet)
      : this.rulesService.updateRuleSet(this.selectedRuleSet.id, this.selectedRuleSet);

    save$.subscribe({
      next: (saved) => {
        this.selectedRuleSet = saved;
        this.editMode = false;
        this.isSaving = false;
      },
      error: (err) => {
        this.logger.error(LOG_CONTEXT, 'Failed to save rule set', err);
        this.isSaving = false;
      },
    });
  }

  deleteRuleSet(): void {
    if (!this.selectedRuleSet) return;

    if (confirm(`Delete rule set "${this.selectedRuleSet.name}"?`)) {
      this.rulesService.deleteRuleSet(this.selectedRuleSet.id).subscribe({
        next: () => {
          this.selectedRuleSet = null;
          this.selectedRule = null;
        },
        error: (err) => {
          this.logger.error(LOG_CONTEXT, 'Failed to delete rule set', err);
        },
      });
    }
  }

  toggleRuleSetEnabled(): void {
    if (!this.selectedRuleSet) return;
    this.selectedRuleSet.enabled = !this.selectedRuleSet.enabled;
  }

  // ==========================================================================
  // RULE MANAGEMENT
  // ==========================================================================

  selectRule(rule: Rule): void {
    this.selectedRule = JSON.parse(JSON.stringify(rule)); // Deep copy
    this.showRuleEditor = true;
    this.logger.debug(LOG_CONTEXT, 'Rule selected', { id: rule.id });
  }

  createNewRule(): void {
    if (!this.selectedRuleSet) return;

    const newRule: Rule = {
      ...JSON.parse(JSON.stringify(this.newRuleTemplate)),
      id: `rule-${Date.now()}`,
      order: this.selectedRuleSet.rules.length + 1,
      conditionGroup: {
        id: `cg-${Date.now()}`,
        operator: 'AND',
        conditions: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.selectedRule = newRule;
    this.showRuleEditor = true;
    this.logger.info(LOG_CONTEXT, 'Creating new rule');
  }

  saveRule(): void {
    if (!this.selectedRuleSet || !this.selectedRule) return;

    const index = this.selectedRuleSet.rules.findIndex((r) => r.id === this.selectedRule!.id);

    if (index >= 0) {
      this.selectedRuleSet.rules[index] = this.selectedRule;
    } else {
      this.selectedRuleSet.rules.push(this.selectedRule);
    }

    // Sort by order
    this.selectedRuleSet.rules.sort((a, b) => a.order - b.order);

    this.showRuleEditor = false;
    this.logger.info(LOG_CONTEXT, 'Rule saved locally', { id: this.selectedRule.id });
  }

  deleteRule(rule: Rule): void {
    if (!this.selectedRuleSet) return;

    if (confirm(`Delete rule "${rule.name}"?`)) {
      this.selectedRuleSet.rules = this.selectedRuleSet.rules.filter((r) => r.id !== rule.id);
      if (this.selectedRule?.id === rule.id) {
        this.selectedRule = null;
        this.showRuleEditor = false;
      }
    }
  }

  cancelRuleEdit(): void {
    this.selectedRule = null;
    this.showRuleEditor = false;
  }

  toggleRuleEnabled(rule: Rule): void {
    rule.enabled = !rule.enabled;
  }

  moveRuleUp(index: number): void {
    if (!this.selectedRuleSet || index <= 0) return;
    const rules = this.selectedRuleSet.rules;
    [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
    this.updateRuleOrders();
  }

  moveRuleDown(index: number): void {
    if (!this.selectedRuleSet || index >= this.selectedRuleSet.rules.length - 1) return;
    const rules = this.selectedRuleSet.rules;
    [rules[index], rules[index + 1]] = [rules[index + 1], rules[index]];
    this.updateRuleOrders();
  }

  private updateRuleOrders(): void {
    if (!this.selectedRuleSet) return;
    this.selectedRuleSet.rules.forEach((rule, i) => {
      rule.order = i + 1;
    });
  }

  // ==========================================================================
  // CONDITION MANAGEMENT
  // ==========================================================================

  addCondition(): void {
    if (!this.selectedRule) return;

    const newCondition: RuleCondition = {
      id: `cond-${Date.now()}`,
      field: this.fields[0]?.field || 'workType',
      operator: 'equals',
      value: '',
    };

    this.selectedRule.conditionGroup.conditions.push(newCondition);
    this.logger.debug(LOG_CONTEXT, 'Condition added');
  }

  removeCondition(index: number): void {
    if (!this.selectedRule) return;
    this.selectedRule.conditionGroup.conditions.splice(index, 1);
  }

  setConditionOperator(operator: LogicalOperator): void {
    if (!this.selectedRule) return;
    this.selectedRule.conditionGroup.operator = operator;
  }

  getFieldConfig(field: string): RuleFieldConfig | undefined {
    return this.fields.find((f) => f.field === field);
  }

  getOperatorsForField(field: string): OperatorConfig[] {
    const fieldConfig = this.getFieldConfig(field);
    if (!fieldConfig) return this.operators;
    return this.operators.filter((op) => fieldConfig.operators.includes(op.operator));
  }

  // ==========================================================================
  // ACTION MANAGEMENT
  // ==========================================================================

  addAction(): void {
    if (!this.selectedRule) return;

    const newAction: RuleAction = {
      id: `action-${Date.now()}`,
      type: 'set_priority',
      value: 5,
    };

    this.selectedRule.actions.push(newAction);
    this.logger.debug(LOG_CONTEXT, 'Action added');
  }

  removeAction(index: number): void {
    if (!this.selectedRule) return;
    this.selectedRule.actions.splice(index, 1);
  }

  getActionConfig(type: string): RuleActionConfig | undefined {
    return this.actions.find((a) => a.type === type);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  getOperatorLabel(operator: ConditionOperator): string {
    return this.operators.find((o) => o.operator === operator)?.label || operator;
  }

  getActionLabel(type: string): string {
    return this.actions.find((a) => a.type === type)?.label || type;
  }

  trackByRuleSet(index: number, ruleSet: RuleSet): string {
    return ruleSet.id;
  }

  trackByRule(index: number, rule: Rule): string {
    return rule.id;
  }

  trackByCondition(index: number, condition: RuleCondition): string {
    return condition.id;
  }

  trackByAction(index: number, action: RuleAction): string {
    return action.id;
  }
}
