import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageLayoutComponent } from '../../../../shared/components/layout/page-layout.component';
import { PipelineApiService } from '../../services/pipeline.service';
import {
  Pipeline,
  PipelineQueue,
  RoutingRule,
  RoutingCondition,
  PipelineSummary,
  CreatePipelineRequest,
  CreateQueueRequest,
  CreateRoutingRuleRequest,
  RoutingOperator,
  ROUTING_OPERATOR_LABELS,
  ROUTING_OPERATORS_BY_TYPE,
  PipelineFieldDefinition,
} from '@nexus-queue/shared-models';

type ViewMode = 'list' | 'detail';
type EditorMode = 'pipeline' | 'queue' | 'rule' | null;

@Component({
  selector: 'app-pipelines',
  standalone: true,
  imports: [CommonModule, FormsModule, PageLayoutComponent],
  templateUrl: './pipelines.component.html',
  styleUrls: ['./pipelines.component.scss'],
})
export class PipelinesComponent implements OnInit {
  private readonly pipelineApi = inject(PipelineApiService);

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

  // Editor State
  editorMode = signal<EditorMode>(null);
  isEditMode = signal(false);
  editingItem = signal<Pipeline | PipelineQueue | RoutingRule | null>(null);

  // Pipeline Form
  pipelineForm = signal<Partial<CreatePipelineRequest>>({
    name: '',
    description: '',
    allowedWorkTypes: [],
  });
  workTypeInput = signal('');

  // Queue Form
  queueForm = signal<Partial<CreateQueueRequest>>({
    name: '',
    description: '',
    priority: 1,
    requiredSkills: [],
    maxCapacity: 0,
  });
  skillInput = signal('');

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
      },
    });
  }

  backToList(): void {
    this.viewMode.set('list');
    this.selectedPipeline.set(null);
    this.selectedPipelineQueues.set([]);
    this.selectedPipelineRules.set([]);
  }

  // ===========================================================================
  // PIPELINE OPERATIONS
  // ===========================================================================

  openPipelineEditor(pipeline?: Pipeline): void {
    this.editorMode.set('pipeline');
    this.isEditMode.set(!!pipeline);
    this.editingItem.set(pipeline || null);

    if (pipeline) {
      this.pipelineForm.set({
        name: pipeline.name,
        description: pipeline.description,
        allowedWorkTypes: [...(pipeline.allowedWorkTypes || [])],
      });
    } else {
      this.pipelineForm.set({
        name: '',
        description: '',
        allowedWorkTypes: [],
      });
    }
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

    if (this.isEditMode() && this.editingItem()) {
      const pipeline = this.editingItem() as Pipeline;
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
    } else {
      this.pipelineApi.createPipeline(form as CreatePipelineRequest).subscribe({
        next: () => {
          this.successMessage.set('Pipeline created successfully');
          this.closeEditor();
          this.loadPipelines();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to create pipeline');
          this.isLoading.set(false);
        },
      });
    }
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
  // QUEUE OPERATIONS
  // ===========================================================================

  openQueueEditor(queue?: PipelineQueue): void {
    this.editorMode.set('queue');
    this.isEditMode.set(!!queue);
    this.editingItem.set(queue || null);

    if (queue) {
      this.queueForm.set({
        name: queue.name,
        description: queue.description,
        priority: queue.priority,
        requiredSkills: [...(queue.requiredSkills || [])],
        maxCapacity: queue.maxCapacity,
      });
    } else {
      this.queueForm.set({
        name: '',
        description: '',
        priority: this.selectedPipelineQueues().length + 1,
        requiredSkills: [],
        maxCapacity: 0,
      });
    }
    this.skillInput.set('');
  }

  saveQueue(): void {
    const form = this.queueForm();
    const pipeline = this.selectedPipeline();

    if (!form.name?.trim()) {
      this.errorMessage.set('Queue name is required');
      return;
    }

    if (!pipeline) {
      this.errorMessage.set('No pipeline selected');
      return;
    }

    this.isLoading.set(true);
    this.clearMessages();

    if (this.isEditMode() && this.editingItem()) {
      const queue = this.editingItem() as PipelineQueue;
      this.pipelineApi.updateQueue(pipeline.id, queue.id, form).subscribe({
        next: () => {
          this.successMessage.set('Queue updated successfully');
          this.closeEditor();
          this.loadPipelineDetails(pipeline);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update queue');
          this.isLoading.set(false);
        },
      });
    } else {
      this.pipelineApi.createQueue(pipeline.id, form as Omit<CreateQueueRequest, 'pipelineId'>).subscribe({
        next: () => {
          this.successMessage.set('Queue created successfully');
          this.closeEditor();
          this.loadPipelineDetails(pipeline);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to create queue');
          this.isLoading.set(false);
        },
      });
    }
  }

  deleteQueue(queue: PipelineQueue): void {
    const pipeline = this.selectedPipeline();
    if (!pipeline) return;

    if (!confirm(`Delete queue "${queue.name}"? This cannot be undone.`)) {
      return;
    }

    this.pipelineApi.deleteQueue(pipeline.id, queue.id).subscribe({
      next: () => {
        this.successMessage.set('Queue deleted');
        this.loadPipelineDetails(pipeline);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete queue');
      },
    });
  }

  addSkill(): void {
    const value = this.skillInput().trim().toLowerCase();
    if (!value) return;

    const current = this.queueForm().requiredSkills || [];
    if (!current.includes(value)) {
      this.queueForm.update((f) => ({
        ...f,
        requiredSkills: [...current, value],
      }));
    }
    this.skillInput.set('');
  }

  removeSkill(skill: string): void {
    this.queueForm.update((f) => ({
      ...f,
      requiredSkills: (f.requiredSkills || []).filter((s) => s !== skill),
    }));
  }

  // ===========================================================================
  // ROUTING RULE OPERATIONS
  // ===========================================================================

  openRuleEditor(rule?: RoutingRule): void {
    this.editorMode.set('rule');
    this.isEditMode.set(!!rule);
    this.editingItem.set(rule || null);

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

  updateQueueField(field: string, value: unknown): void {
    this.queueForm.update((f) => ({ ...f, [field]: value }));
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
