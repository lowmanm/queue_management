import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PageLayoutComponent } from '../../../../shared/components/layout/page-layout.component';
import { QueueConfigPanelComponent } from '../queue-config-panel/queue-config-panel.component';
import { PipelineApiService } from '../../services/pipeline.service';
import {
  Pipeline,
  PipelineQueue,
  RoutingRule,
  RoutingCondition,
  PipelineSummary,
  PipelineVersion,
  PipelineValidationResult,
  CreatePipelineRequest,
  CreateRoutingRuleRequest,
  RoutingOperator,
  ROUTING_OPERATOR_LABELS,
  ROUTING_OPERATORS_BY_TYPE,
  PipelineFieldDefinition,
  DefaultRoutingConfig,
} from '@nexus-queue/shared-models';

type ViewMode = 'list' | 'detail';
type DetailTab = 'queues' | 'rules' | 'versions';
type EditorMode = 'pipeline' | 'rule' | null;

@Component({
  selector: 'app-pipelines',
  standalone: true,
  imports: [CommonModule, FormsModule, PageLayoutComponent, QueueConfigPanelComponent],
  templateUrl: './pipelines.component.html',
  styleUrls: ['./pipelines.component.scss'],
})
export class PipelinesComponent implements OnInit {
  private readonly pipelineApi = inject(PipelineApiService);
  private readonly router = inject(Router);

  // Data
  pipelines = signal<Pipeline[]>([]);
  summaries = signal<PipelineSummary[]>([]);
  selectedPipeline = signal<Pipeline | null>(null);
  selectedPipelineQueues = signal<PipelineQueue[]>([]);
  selectedPipelineRules = signal<RoutingRule[]>([]);

  // UI State
  viewMode = signal<ViewMode>('list');
  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  // Detail Tab
  activeTab = signal<DetailTab>('queues');

  // Editor State
  editorMode = signal<EditorMode>(null);
  isEditMode = signal(false);
  editingItem = signal<Pipeline | RoutingRule | null>(null);

  // Pipeline Form (edit only — create goes through wizard)
  pipelineForm = signal<Partial<CreatePipelineRequest>>({
    name: '',
    description: '',
    allowedWorkTypes: [],
  });
  workTypeInput = signal('');

  // Version History
  pipelineVersions = signal<PipelineVersion[]>([]);
  isLoadingVersions = signal(false);
  rollingBackVersionId = signal<string | null>(null);

  // Routing Test Panel
  showTestPanel = signal(false);
  testSampleJson = signal('{}');
  testResult = signal<PipelineValidationResult | null>(null);
  isRunningTest = signal(false);
  testError = signal('');

  // Default Routing
  defaultRoutingForm = signal<Partial<DefaultRoutingConfig>>({
    behavior: 'hold',
  });

  // Rule Form
  ruleForm = signal<Partial<CreateRoutingRuleRequest>>({
    name: '',
    description: '',
    priority: 1,
    conditions: [],
    conditionLogic: 'AND',
    targetQueueId: '',
  });

  // Condition being edited
  editingCondition = signal<Partial<RoutingCondition>>({
    field: '',
    operator: 'equals',
    value: '',
  });

  readonly operatorLabels = ROUTING_OPERATOR_LABELS;

  // Schema fields from the selected pipeline's data schema — drives routing condition field options
  pipelineSchemaFields = signal<PipelineFieldDefinition[]>([]);

  // Computed: condition fields derived from the pipeline's data schema
  conditionFields = computed(() => {
    const schemaFields = this.pipelineSchemaFields();
    if (schemaFields.length > 0) {
      return schemaFields.map((f) => ({
        value: f.name,
        label: f.label || f.name,
        type: f.type,
      }));
    }
    // Fallback when no schema is defined
    return [] as { value: string; label: string; type: string }[];
  });

  // Available operators based on the currently selected condition field's type
  availableOperators = computed(() => {
    const fieldName = this.editingCondition().field;
    const schemaField = this.pipelineSchemaFields().find((f) => f.name === fieldName);
    const fieldType = schemaField?.type || 'string';
    return ROUTING_OPERATORS_BY_TYPE[fieldType] || ROUTING_OPERATORS_BY_TYPE['string'];
  });

  ngOnInit(): void {
    this.loadPipelines();
  }

  // ===========================================================================
  // DATA LOADING
  // ===========================================================================

  loadPipelines(): void {
    this.isLoading.set(true);
    this.clearMessages();

    this.pipelineApi.getAllPipelines().subscribe({
      next: (pipelines) => {
        this.pipelines.set(pipelines);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load pipelines', err);
        this.errorMessage.set('Failed to load pipelines');
        this.isLoading.set(false);
      },
    });

    this.pipelineApi.getPipelineSummaries().subscribe({
      next: (summaries) => {
        this.summaries.set(summaries);
      },
    });
  }

  loadPipelineDetails(pipeline: Pipeline): void {
    this.selectedPipeline.set(pipeline);
    this.viewMode.set('detail');
    this.activeTab.set('queues');

    // Load schema fields from pipeline's data schema
    if (pipeline.dataSchema?.fields) {
      this.pipelineSchemaFields.set(pipeline.dataSchema.fields);
    } else {
      this.pipelineSchemaFields.set([]);
    }

    // Load queues
    this.pipelineApi.getPipelineQueues(pipeline.id).subscribe({
      next: (queues) => {
        this.selectedPipelineQueues.set(queues);
      },
    });

    // Load rules
    this.pipelineApi.getRoutingRules(pipeline.id).subscribe({
      next: (rules) => {
        this.selectedPipelineRules.set(rules);
        // Init default routing form from pipeline config
        if (pipeline.defaultRouting) {
          this.defaultRoutingForm.set({ behavior: pipeline.defaultRouting.behavior });
        }
      },
    });
  }

  loadVersionHistory(): void {
    const pipeline = this.selectedPipeline();
    if (!pipeline) return;
    this.isLoadingVersions.set(true);
    this.pipelineApi.getPipelineVersions(pipeline.id).subscribe({
      next: (versions) => {
        this.pipelineVersions.set(versions);
        this.isLoadingVersions.set(false);
      },
      error: () => this.isLoadingVersions.set(false),
    });
  }

  rollbackToVersion(version: PipelineVersion): void {
    if (!confirm(`Rollback to version from ${new Date(version.createdAt).toLocaleString()}?`)) return;

    const pipeline = this.selectedPipeline();
    if (!pipeline) return;

    this.rollingBackVersionId.set(version.versionId);
    this.pipelineApi.rollbackPipelineVersion(pipeline.id, version.versionId).subscribe({
      next: (updated) => {
        this.rollingBackVersionId.set(null);
        this.successMessage.set('Pipeline rolled back successfully');
        this.loadPipelineDetails(updated);
        this.loadVersionHistory();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Rollback failed');
        this.rollingBackVersionId.set(null);
      },
    });
  }

  switchTab(tab: DetailTab): void {
    this.activeTab.set(tab);
    if (tab === 'versions' && this.pipelineVersions().length === 0) {
      this.loadVersionHistory();
    }
  }

  onQueuesChanged(queues: PipelineQueue[]): void {
    this.selectedPipelineQueues.set(queues);
  }

  // ============================================================
  // ROUTING TEST PANEL
  // ============================================================

  openTestPanel(): void {
    // Pre-fill with schema field names
    const fields = this.pipelineSchemaFields();
    const sample: Record<string, string> = {};
    fields.forEach((f) => { sample[f.name] = ''; });
    this.testSampleJson.set(JSON.stringify(sample, null, 2));
    this.testResult.set(null);
    this.testError.set('');
    this.showTestPanel.set(true);
  }

  closeTestPanel(): void {
    this.showTestPanel.set(false);
  }

  runRouteTest(): void {
    const pipeline = this.selectedPipeline();
    if (!pipeline) return;

    let sampleTask: Record<string, unknown>;
    try {
      sampleTask = JSON.parse(this.testSampleJson()) as Record<string, unknown>;
    } catch {
      this.testError.set('Invalid JSON. Please check your sample data.');
      return;
    }

    this.isRunningTest.set(true);
    this.testResult.set(null);
    this.testError.set('');

    this.pipelineApi.validatePipeline(pipeline.id, { sampleTask, includeRuleTrace: true }).subscribe({
      next: (result) => {
        this.testResult.set(result);
        this.isRunningTest.set(false);
      },
      error: () => {
        this.testError.set('Test failed — could not reach validation endpoint');
        this.isRunningTest.set(false);
      },
    });
  }

  saveDefaultRouting(): void {
    const pipeline = this.selectedPipeline();
    if (!pipeline) return;
    const defaultRouting = this.defaultRoutingForm() as DefaultRoutingConfig;

    this.pipelineApi.updatePipeline(pipeline.id, { defaultRouting }).subscribe({
      next: (updated) => {
        this.selectedPipeline.set(updated);
        this.successMessage.set('Default routing saved');
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save default routing');
      },
    });
  }

  backToList(): void {
    this.viewMode.set('list');
    this.selectedPipeline.set(null);
    this.selectedPipelineQueues.set([]);
    this.selectedPipelineRules.set([]);
    this.pipelineVersions.set([]);
    this.showTestPanel.set(false);
  }

  // ===========================================================================
  // PIPELINE OPERATIONS
  // ===========================================================================

  navigateToWizard(): void {
    this.router.navigate(['/admin/pipelines/new']);
  }

  openPipelineEditor(pipeline: Pipeline): void {
    this.editorMode.set('pipeline');
    this.isEditMode.set(true);
    this.editingItem.set(pipeline);
    this.pipelineForm.set({
      name: pipeline.name,
      description: pipeline.description,
      allowedWorkTypes: [...(pipeline.allowedWorkTypes || [])],
    });
    this.workTypeInput.set('');
  }

  savePipeline(): void {
    const form = this.pipelineForm();
    if (!form.name?.trim()) {
      this.errorMessage.set('Pipeline name is required');
      return;
    }

    this.isLoading.set(true);
    this.clearMessages();

    const pipeline = this.editingItem() as Pipeline;
    if (!pipeline) return;

    this.pipelineApi.updatePipeline(pipeline.id, form).subscribe({
      next: (updated) => {
        this.successMessage.set('Pipeline updated successfully');
        this.closeEditor();
        this.loadPipelines();
        if (this.selectedPipeline()?.id === updated.id) {
          this.selectedPipeline.set(updated);
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update pipeline');
        this.isLoading.set(false);
      },
    });
  }

  deletePipeline(pipeline: Pipeline): void {
    if (!confirm(`Delete pipeline "${pipeline.name}"? This cannot be undone.`)) {
      return;
    }

    this.pipelineApi.deletePipeline(pipeline.id).subscribe({
      next: () => {
        this.successMessage.set('Pipeline deleted');
        this.loadPipelines();
        if (this.selectedPipeline()?.id === pipeline.id) {
          this.backToList();
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete pipeline');
      },
    });
  }

  togglePipeline(pipeline: Pipeline): void {
    const action = pipeline.enabled
      ? this.pipelineApi.disablePipeline(pipeline.id)
      : this.pipelineApi.enablePipeline(pipeline.id);

    action.subscribe({
      next: () => {
        this.loadPipelines();
        if (this.selectedPipeline()?.id === pipeline.id) {
          this.loadPipelineDetails({ ...pipeline, enabled: !pipeline.enabled });
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to toggle pipeline');
      },
    });
  }

  addWorkType(): void {
    const value = this.workTypeInput().trim().toUpperCase();
    if (!value) return;

    const current = this.pipelineForm().allowedWorkTypes || [];
    if (!current.includes(value)) {
      this.pipelineForm.update((f) => ({
        ...f,
        allowedWorkTypes: [...current, value],
      }));
    }
    this.workTypeInput.set('');
  }

  removeWorkType(workType: string): void {
    this.pipelineForm.update((f) => ({
      ...f,
      allowedWorkTypes: (f.allowedWorkTypes || []).filter((t) => t !== workType),
    }));
  }

  // ===========================================================================
  // ROUTING RULE OPERATIONS
  // ===========================================================================

  openRuleEditor(rule?: RoutingRule): void {
    this.editorMode.set('rule');
    this.isEditMode.set(!!rule);
    this.editingItem.set(rule ?? null);

    if (rule) {
      this.ruleForm.set({
        name: rule.name,
        description: rule.description,
        priority: rule.priority,
        conditions: [...rule.conditions],
        conditionLogic: rule.conditionLogic,
        targetQueueId: rule.targetQueueId,
      });
    } else {
      this.ruleForm.set({
        name: '',
        description: '',
        priority: this.selectedPipelineRules().length + 1,
        conditions: [],
        conditionLogic: 'AND',
        targetQueueId: this.selectedPipelineQueues()[0]?.id || '',
      });
    }

    this.resetConditionForm();
  }

  saveRule(): void {
    const form = this.ruleForm();
    const pipeline = this.selectedPipeline();

    if (!form.name?.trim()) {
      this.errorMessage.set('Rule name is required');
      return;
    }

    if (!form.targetQueueId) {
      this.errorMessage.set('Target queue is required');
      return;
    }

    if (!pipeline) {
      this.errorMessage.set('No pipeline selected');
      return;
    }

    this.isLoading.set(true);
    this.clearMessages();

    if (this.isEditMode() && this.editingItem()) {
      const rule = this.editingItem() as RoutingRule;
      this.pipelineApi.updateRoutingRule(pipeline.id, rule.id, form).subscribe({
        next: () => {
          this.successMessage.set('Routing rule updated successfully');
          this.closeEditor();
          this.loadPipelineDetails(pipeline);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update rule');
          this.isLoading.set(false);
        },
      });
    } else {
      this.pipelineApi.createRoutingRule(pipeline.id, form as Omit<CreateRoutingRuleRequest, 'pipelineId'>).subscribe({
        next: () => {
          this.successMessage.set('Routing rule created successfully');
          this.closeEditor();
          this.loadPipelineDetails(pipeline);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to create rule');
          this.isLoading.set(false);
        },
      });
    }
  }

  deleteRule(rule: RoutingRule): void {
    const pipeline = this.selectedPipeline();
    if (!pipeline) return;

    if (!confirm(`Delete routing rule "${rule.name}"?`)) {
      return;
    }

    this.pipelineApi.deleteRoutingRule(pipeline.id, rule.id).subscribe({
      next: () => {
        this.successMessage.set('Routing rule deleted');
        this.loadPipelineDetails(pipeline);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete rule');
      },
    });
  }

  addCondition(): void {
    const condition = this.editingCondition();
    if (!condition.field || !condition.operator) return;

    const newCondition: RoutingCondition = {
      id: `cond-${Date.now()}`,
      field: condition.field,
      operator: condition.operator as RoutingOperator,
      value: condition.value || '',
    };

    this.ruleForm.update((f) => ({
      ...f,
      conditions: [...(f.conditions || []), newCondition],
    }));

    this.resetConditionForm();
  }

  removeCondition(conditionId: string): void {
    this.ruleForm.update((f) => ({
      ...f,
      conditions: (f.conditions || []).filter((c) => c.id !== conditionId),
    }));
  }

  resetConditionForm(): void {
    this.editingCondition.set({
      field: '',
      operator: 'equals',
      value: '',
    });
  }

  updateConditionField(field: string, value: string): void {
    this.editingCondition.update((c) => ({ ...c, [field]: value }));
  }

  getQueueName(queueId: string): string {
    const queue = this.selectedPipelineQueues().find((q) => q.id === queueId);
    return queue?.name || 'Unknown Queue';
  }

  formatCondition(condition: RoutingCondition): string {
    const schemaField = this.pipelineSchemaFields().find((f) => f.name === condition.field);
    const fieldLabel = schemaField?.label || schemaField?.name || condition.field;
    const operatorLabel = this.operatorLabels[condition.operator] || condition.operator;
    return `${fieldLabel} ${operatorLabel} "${condition.value}"`;
  }

  // ===========================================================================
  // FORM UPDATE METHODS (for template bindings)
  // ===========================================================================

  updatePipelineField(field: string, value: unknown): void {
    this.pipelineForm.update((f) => ({ ...f, [field]: value }));
  }

  updateDefaultRoutingBehavior(behavior: string): void {
    this.defaultRoutingForm.update((f) => ({ ...f, behavior: behavior as 'route_to_queue' | 'reject' | 'hold' }));
  }

  updateDefaultRoutingQueue(queueId: string): void {
    this.defaultRoutingForm.update((f) => ({ ...f, defaultQueueId: queueId }));
  }

  updateRuleField(field: string, value: unknown): void {
    this.ruleForm.update((f) => ({ ...f, [field]: value }));
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  closeEditor(): void {
    this.editorMode.set(null);
    this.isEditMode.set(false);
    this.editingItem.set(null);
    this.isLoading.set(false);
  }

  clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  getSummary(pipelineId: string): PipelineSummary | undefined {
    return this.summaries().find((s) => s.id === pipelineId);
  }

  trackById(index: number, item: { id: string }): string {
    return item.id;
  }
}
