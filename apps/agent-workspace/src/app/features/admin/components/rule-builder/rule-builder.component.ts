import { Component, OnInit, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageLayoutComponent } from '../../../../shared/components/layout/page-layout.component';
import { RuleEditorComponent } from './rule-editor/rule-editor.component';
import { RuleSetTestComponent } from './rule-set-test/rule-set-test.component';
import { RulesService } from '../../services/rules.service';
import {
  RuleSet,
  Rule,
  RuleFieldConfig,
  RuleActionConfig,
} from '@nexus-queue/shared-models';
import { OperatorConfig } from '../../services/rules.service';

type ViewMode = 'list' | 'edit';

@Component({
  selector: 'app-rule-builder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageLayoutComponent,
    RuleEditorComponent,
    RuleSetTestComponent,
  ],
  templateUrl: './rule-builder.component.html',
  styleUrls: ['./rule-builder.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleBuilderComponent implements OnInit {
  private rulesService = inject(RulesService);

  // View state
  viewMode = signal<ViewMode>('list');
  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  // Rule set data
  ruleSets$ = this.rulesService.ruleSets$;
  availableFields = signal<RuleFieldConfig[]>([]);
  availableOperators = signal<OperatorConfig[]>([]);
  availableActions = signal<RuleActionConfig[]>([]);

  // Edit state
  editingRuleSet = signal<RuleSet | null>(null);
  expandedRuleId = signal<string | null>(null);

  // Test dialog state
  testingRuleSet = signal<{ id: string; name: string } | null>(null);

  // Form fields for rule set metadata
  formName = signal('');
  formDescription = signal('');
  formWorkTypes = signal('');
  formQueues = signal('');
  formEnabled = signal(true);

  ngOnInit(): void {
    this.rulesService.loadConfiguration();
    this.loadRuleSets();

    this.rulesService.fields$.subscribe((f) => this.availableFields.set(f));
    this.rulesService.operators$.subscribe((o) => this.availableOperators.set(o));
    this.rulesService.actions$.subscribe((a) => this.availableActions.set(a));
  }

  private loadRuleSets(): void {
    this.isLoading.set(true);
    this.rulesService.getRuleSets().subscribe({
      next: () => this.isLoading.set(false),
      error: () => {
        this.errorMessage.set('Failed to load rule sets.');
        this.isLoading.set(false);
      },
    });
  }

  // ==========================================================================
  // LIST VIEW ACTIONS
  // ==========================================================================

  newRuleSet(): void {
    const now = new Date().toISOString();
    const blank: RuleSet = {
      id: '',
      name: '',
      description: '',
      enabled: true,
      rules: [],
      appliesTo: { workTypes: [], queues: [] },
      createdAt: now,
      updatedAt: now,
    };
    this.startEditing(blank);
  }

  editRuleSet(ruleSet: RuleSet): void {
    this.startEditing(JSON.parse(JSON.stringify(ruleSet)) as RuleSet);
  }

  private startEditing(ruleSet: RuleSet): void {
    this.editingRuleSet.set(ruleSet);
    this.formName.set(ruleSet.name);
    this.formDescription.set(ruleSet.description ?? '');
    this.formWorkTypes.set((ruleSet.appliesTo?.workTypes ?? []).join(', '));
    this.formQueues.set((ruleSet.appliesTo?.queues ?? []).join(', '));
    this.formEnabled.set(ruleSet.enabled);
    this.expandedRuleId.set(null);
    this.clearMessages();
    this.viewMode.set('edit');
  }

  openTest(ruleSet: RuleSet): void {
    this.testingRuleSet.set({ id: ruleSet.id, name: ruleSet.name });
  }

  closeTest(): void {
    this.testingRuleSet.set(null);
  }

  confirmDelete(ruleSet: RuleSet): void {
    if (!confirm(`Delete rule set "${ruleSet.name}"? This cannot be undone.`)) return;

    this.rulesService.deleteRuleSet(ruleSet.id).subscribe({
      next: () => {
        this.successMessage.set(`Rule set "${ruleSet.name}" deleted.`);
      },
      error: () => {
        this.errorMessage.set('Failed to delete rule set.');
      },
    });
  }

  // ==========================================================================
  // EDIT VIEW — RULE SET METADATA
  // ==========================================================================

  updateFormName(value: string): void {
    this.formName.set(value);
  }

  updateFormDescription(value: string): void {
    this.formDescription.set(value);
  }

  updateFormWorkTypes(value: string): void {
    this.formWorkTypes.set(value);
  }

  updateFormQueues(value: string): void {
    this.formQueues.set(value);
  }

  updateFormEnabled(value: boolean): void {
    this.formEnabled.set(value);
  }

  // ==========================================================================
  // EDIT VIEW — RULES LIST
  // ==========================================================================

  addRule(): void {
    const rs = this.editingRuleSet();
    if (!rs) return;
    const now = new Date().toISOString();
    const newRule: Rule = {
      id: `rule-${Date.now()}`,
      name: `Rule ${rs.rules.length + 1}`,
      enabled: true,
      order: rs.rules.length + 1,
      conditionGroup: {
        id: `cg-${Date.now()}`,
        operator: 'AND',
        conditions: [],
      },
      actions: [],
      createdAt: now,
      updatedAt: now,
    };
    this.editingRuleSet.set({
      ...rs,
      rules: [...rs.rules, newRule],
    });
  }

  deleteRule(ruleId: string): void {
    const rs = this.editingRuleSet();
    if (!rs) return;
    this.editingRuleSet.set({
      ...rs,
      rules: rs.rules.filter((r) => r.id !== ruleId),
    });
    if (this.expandedRuleId() === ruleId) {
      this.expandedRuleId.set(null);
    }
  }

  duplicateRule(rule: Rule): void {
    const rs = this.editingRuleSet();
    if (!rs) return;
    const now = new Date().toISOString();
    const cloned: Rule = {
      ...JSON.parse(JSON.stringify(rule)) as Rule,
      id: `rule-${Date.now()}`,
      name: `${rule.name} (copy)`,
      order: rs.rules.length + 1,
      createdAt: now,
      updatedAt: now,
    };
    this.editingRuleSet.set({
      ...rs,
      rules: [...rs.rules, cloned],
    });
  }

  moveRuleUp(index: number): void {
    if (index <= 0) return;
    const rs = this.editingRuleSet();
    if (!rs) return;
    const rules = [...rs.rules];
    [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
    this.editingRuleSet.set({ ...rs, rules });
  }

  moveRuleDown(index: number): void {
    const rs = this.editingRuleSet();
    if (!rs || index >= rs.rules.length - 1) return;
    const rules = [...rs.rules];
    [rules[index], rules[index + 1]] = [rules[index + 1], rules[index]];
    this.editingRuleSet.set({ ...rs, rules });
  }

  toggleRuleEnabled(rule: Rule): void {
    const rs = this.editingRuleSet();
    if (!rs) return;
    this.editingRuleSet.set({
      ...rs,
      rules: rs.rules.map((r) =>
        r.id === rule.id ? { ...r, enabled: !r.enabled } : r
      ),
    });
  }

  toggleExpand(ruleId: string): void {
    this.expandedRuleId.set(this.expandedRuleId() === ruleId ? null : ruleId);
  }

  onRuleChanged(updatedRule: Rule): void {
    const rs = this.editingRuleSet();
    if (!rs) return;
    this.editingRuleSet.set({
      ...rs,
      rules: rs.rules.map((r) => (r.id === updatedRule.id ? updatedRule : r)),
    });
  }

  updateRuleName(ruleId: string, name: string): void {
    const rs = this.editingRuleSet();
    if (!rs) return;
    this.editingRuleSet.set({
      ...rs,
      rules: rs.rules.map((r) => (r.id === ruleId ? { ...r, name } : r)),
    });
  }

  // ==========================================================================
  // SAVE / CANCEL
  // ==========================================================================

  saveRuleSet(): void {
    const rs = this.editingRuleSet();
    if (!rs) return;

    const name = this.formName().trim();
    if (!name) {
      this.errorMessage.set('Rule set name is required.');
      return;
    }

    const toSave: RuleSet = {
      ...rs,
      name,
      description: this.formDescription().trim() || undefined,
      enabled: this.formEnabled(),
      appliesTo: {
        workTypes: this.formWorkTypes()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        queues: this.formQueues()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
      updatedAt: new Date().toISOString(),
    };

    this.isLoading.set(true);
    this.clearMessages();

    const isNew = !toSave.id;
    const request$ = isNew
      ? this.rulesService.createRuleSet(toSave)
      : this.rulesService.updateRuleSet(toSave.id, toSave);

    request$.subscribe({
      next: () => {
        this.successMessage.set(`Rule set "${name}" ${isNew ? 'created' : 'updated'}.`);
        this.isLoading.set(false);
        this.viewMode.set('list');
      },
      error: () => {
        this.errorMessage.set(`Failed to ${isNew ? 'create' : 'update'} rule set.`);
        this.isLoading.set(false);
      },
    });
  }

  cancelEdit(): void {
    this.editingRuleSet.set(null);
    this.clearMessages();
    this.viewMode.set('list');
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }

  formatScope(ruleSet: RuleSet): string {
    const parts: string[] = [];
    if (ruleSet.appliesTo?.workTypes?.length) {
      parts.push(`Work: ${ruleSet.appliesTo.workTypes.join(', ')}`);
    }
    if (ruleSet.appliesTo?.queues?.length) {
      parts.push(`Queue: ${ruleSet.appliesTo.queues.join(', ')}`);
    }
    return parts.length > 0 ? parts.join(' | ') : 'All';
  }
}
