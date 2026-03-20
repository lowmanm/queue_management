import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  AbstractControl,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, forkJoin, of, switchMap } from 'rxjs';
import {
  Pipeline,
  PipelineValidationRequest,
  PipelineValidationResult,
  PipelineFieldType,
} from '@nexus-queue/shared-models';
import { PipelineApiService } from '../../services/pipeline.service';
import { SkillApiService } from '../../services/skill.service';

/** Internal queue definition used in the wizard */
export interface WizardQueueEntry {
  label: string;
  name: string;
  description: string;
  priority: number;
  requiredSkills: string[];
  maxCapacity: number;
}

const FIELD_TYPES: PipelineFieldType[] = ['string', 'number', 'boolean', 'date'];
const CALLBACK_EVENTS = ['task.completed', 'task.dlq', 'sla.breach'] as const;
type CallbackEvent = (typeof CALLBACK_EVENTS)[number];

@Component({
  selector: 'app-pipeline-wizard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './pipeline-wizard.component.html',
  styleUrls: ['./pipeline-wizard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelineWizardComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly pipelineApi = inject(PipelineApiService);
  private readonly skillApi = inject(SkillApiService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  // ============================================================
  // WIZARD STEP STATE
  // ============================================================

  readonly totalSteps = 7;
  currentStep = signal(1);

  readonly stepLabels = [
    'Basic Info',
    'Data Schema',
    'Routing Rules',
    'Queue Assignment',
    'SLA Config',
    'Callbacks',
    'Review',
  ];

  // ============================================================
  // FORMS
  // ============================================================

  step1Form!: FormGroup;
  step2Form!: FormGroup;
  step3Form!: FormGroup;
  step4Form!: FormGroup;
  step5Form!: FormGroup;
  step6Form!: FormGroup;

  // ============================================================
  // REVIEW / VALIDATION STATE
  // ============================================================

  isValidating = signal(false);
  validationResult = signal<PipelineValidationResult | null>(null);
  isSubmitting = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  // ============================================================
  // SKILLS (for queue form)
  // ============================================================

  availableSkills = signal<{ id: string; name: string }[]>([]);

  // ============================================================
  // ALL PIPELINES (for cross-pipeline routing dropdown)
  // ============================================================

  allPipelines = signal<Pick<Pipeline, 'id' | 'name'>[]>([]);

  // ============================================================
  // COMPUTED HELPERS
  // ============================================================

  /** Queue labels from step 4 for use in step 3 target selectors */
  queueLabels = computed<string[]>(() => {
    const arr = this.step4Form?.get('queues') as FormArray | null;
    if (!arr) return [];
    return arr.controls
      .map((c) => (c as FormGroup).get('label')?.value as string)
      .filter(Boolean);
  });

  /** Schema field names from step 2 for routing condition selectors */
  schemaFieldNames = computed<string[]>(() => {
    const arr = this.step2Form?.get('fields') as FormArray | null;
    if (!arr) return [];
    return arr.controls
      .map((c) => (c as FormGroup).get('name')?.value as string)
      .filter(Boolean);
  });

  readonly fieldTypes = FIELD_TYPES;
  readonly callbackEventOptions = CALLBACK_EVENTS;

  // ============================================================
  // LIFECYCLE
  // ============================================================

  ngOnInit(): void {
    this.initForms();
    this.loadSkills();
    this.loadAllPipelines();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForms(): void {
    this.step1Form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      active: [false],
    });

    this.step2Form = this.fb.group({
      fields: this.fb.array([]),
    });

    this.step3Form = this.fb.group({
      rules: this.fb.array([]),
      defaultRoute: ['Hold (keep in DLQ)'],
    });

    this.step4Form = this.fb.group({
      queues: this.fb.array([]),
    });

    this.step5Form = this.fb.group({
      warningThresholdPercent: [80, [Validators.required, Validators.min(0), Validators.max(100)]],
      breachThresholdPercent: [100, [Validators.required, Validators.min(0), Validators.max(100)]],
      escalationAction: ['escalate_priority'],
      defaultHandleTimeMs: [300000],
      maxQueueWaitMs: [900000],
    });

    this.step6Form = this.fb.group({
      callbackUrl: ['', Validators.pattern(/^https?:\/\/.+/)],
      callbackEvents: [[] as CallbackEvent[]],
    });
  }

  private loadSkills(): void {
    this.skillApi.getAllSkills()
      .pipe(takeUntil(this.destroy$))
      .subscribe((skills) => {
        this.availableSkills.set(skills.map((s) => ({ id: s.id, name: s.name })));
      });
  }

  private loadAllPipelines(): void {
    this.pipelineApi.getAllPipelines()
      .pipe(takeUntil(this.destroy$))
      .subscribe((pipelines) => {
        this.allPipelines.set(pipelines.map((p) => ({ id: p.id, name: p.name })));
      });
  }

  // ============================================================
  // STEP 2 — SCHEMA FIELDS
  // ============================================================

  get schemaFields(): FormArray {
    return this.step2Form.get('fields') as FormArray;
  }

  addSchemaField(): void {
    this.schemaFields.push(this.fb.group({
      name: ['', Validators.required],
      type: ['string', Validators.required],
      required: [false],
    }));
  }

  removeSchemaField(index: number): void {
    this.schemaFields.removeAt(index);
  }

  // ============================================================
  // STEP 3 — ROUTING RULES
  // ============================================================

  get routingRules(): FormArray {
    return this.step3Form.get('rules') as FormArray;
  }

  addRoutingRule(): void {
    this.routingRules.push(this.fb.group({
      name: ['', Validators.required],
      conditionField: [''],
      conditionOperator: ['equals'],
      conditionValue: [''],
      routingActionType: ['queue'],
      targetQueueLabel: [''],
      targetPipelineId: [null as string | null],
    }));
  }

  getRoutingActionType(index: number): string {
    return this.getRuleForm(index).get('routingActionType')?.value as string ?? 'queue';
  }

  removeRoutingRule(index: number): void {
    this.routingRules.removeAt(index);
  }

  moveRuleUp(index: number): void {
    if (index === 0) return;
    const arr = this.routingRules;
    const ctrl = arr.at(index);
    arr.removeAt(index);
    arr.insert(index - 1, ctrl);
  }

  moveRuleDown(index: number): void {
    const arr = this.routingRules;
    if (index >= arr.length - 1) return;
    const ctrl = arr.at(index);
    arr.removeAt(index);
    arr.insert(index + 1, ctrl);
  }

  getRuleForm(index: number): FormGroup {
    return this.routingRules.at(index) as FormGroup;
  }

  // ============================================================
  // STEP 4 — QUEUES
  // ============================================================

  get wizardQueues(): FormArray {
    return this.step4Form.get('queues') as FormArray;
  }

  addQueue(): void {
    this.wizardQueues.push(this.fb.group({
      label: ['', Validators.required],
      name: ['', Validators.required],
      description: [''],
      priority: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
      requiredSkills: [[]],
      maxCapacity: [0, Validators.min(0)],
    }));
  }

  removeQueue(index: number): void {
    this.wizardQueues.removeAt(index);
  }

  getQueueForm(index: number): FormGroup {
    return this.wizardQueues.at(index) as FormGroup;
  }

  toggleSkillOnQueue(queueGroup: FormGroup, skillId: string): void {
    const current: string[] = queueGroup.get('requiredSkills')?.value ?? [];
    const updated = current.includes(skillId)
      ? current.filter((s) => s !== skillId)
      : [...current, skillId];
    queueGroup.patchValue({ requiredSkills: updated });
  }

  isSkillSelectedOnQueue(queueGroup: AbstractControl, skillId: string): boolean {
    const skills: string[] = (queueGroup as FormGroup).get('requiredSkills')?.value ?? [];
    return skills.includes(skillId);
  }

  // ============================================================
  // NAVIGATION
  // ============================================================

  next(): void {
    const errors = this.validateStep(this.currentStep());
    if (errors.length > 0) {
      this.errorMessage.set(errors.join('. '));
      return;
    }
    this.errorMessage.set('');
    this.currentStep.update((s) => Math.min(s + 1, this.totalSteps));
  }

  back(): void {
    this.errorMessage.set('');
    this.currentStep.update((s) => Math.max(s - 1, 1));
  }

  validateStep(step: number): string[] {
    const errors: string[] = [];
    switch (step) {
      case 1:
        if (this.step1Form.get('name')?.invalid) {
          errors.push('Pipeline name is required (minimum 2 characters)');
        }
        break;
      case 2:
        // Schema is optional; no validation required
        break;
      case 3:
        // Rules are optional; validate each rule that exists
        this.routingRules.controls.forEach((ctrl, i) => {
          const g = ctrl as FormGroup;
          const name = g.get('name')?.value;
          if (!name?.trim()) {
            errors.push(`Rule ${i + 1}: name is required`);
          }
          const actionType: string = g.get('routingActionType')?.value ?? 'queue';
          const targetQueueLabel: string = g.get('targetQueueLabel')?.value ?? '';
          const targetPipelineId: string | null = g.get('targetPipelineId')?.value ?? null;
          if (actionType === 'queue' && !targetQueueLabel) {
            errors.push(`Rule ${i + 1}: select a target queue (or switch to "Transfer to Pipeline")`);
          }
          if (actionType === 'pipeline' && !targetPipelineId) {
            errors.push(`Rule ${i + 1}: select a target pipeline`);
          }
        });
        break;
      case 4:
        if (this.wizardQueues.length === 0) {
          errors.push('At least one queue is required');
        }
        this.wizardQueues.controls.forEach((ctrl, i) => {
          const g = ctrl as FormGroup;
          if (!g.get('name')?.value?.trim()) errors.push(`Queue ${i + 1}: name is required`);
          if (!g.get('label')?.value?.trim()) errors.push(`Queue ${i + 1}: label is required`);
          const p = g.get('priority')?.value;
          if (p < 1 || p > 10) errors.push(`Queue ${i + 1}: priority must be 1-10`);
        });
        break;
      case 5:
        if (this.step5Form.invalid) {
          errors.push('SLA thresholds must be valid percentages (0-100)');
        }
        break;
      case 6:
        if (!this.callbacksStepValid()) {
          errors.push(
            'Callbacks: either leave both URL and events empty, or fill in the URL and select at least one event'
          );
        }
        if (this.step6Form.get('callbackUrl')?.invalid) {
          errors.push('Callback URL must be a valid http or https URL');
        }
        break;
    }
    return errors;
  }

  // ============================================================
  // STEP 6 — REVIEW & VALIDATE
  // ============================================================

  validateConfig(): void {
    this.isValidating.set(true);
    this.validationResult.set(null);

    // Build a synthetic sample task from schema fields
    const sampleTask: Record<string, unknown> = {};
    this.schemaFields.controls.forEach((ctrl) => {
      const g = ctrl as FormGroup;
      const name: string = g.get('name')?.value;
      const type: string = g.get('type')?.value;
      if (name) {
        sampleTask[name] = type === 'number' ? 1 : type === 'boolean' ? true : 'sample';
      }
    });

    // We can't validate against a real pipeline ID yet (it hasn't been created)
    // so we POST to a dummy pipeline ID and show the backend's response
    const request: PipelineValidationRequest = {
      sampleTask,
      includeRuleTrace: false,
    };

    this.pipelineApi.validatePipeline('preview', request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.validationResult.set(result);
          this.isValidating.set(false);
        },
        error: () => {
          this.validationResult.set({
            valid: false,
            errors: ['Could not connect to validation endpoint — pipeline config will be saved regardless.'],
            warnings: [],
          });
          this.isValidating.set(false);
        },
      });
  }

  // ============================================================
  // SUBMIT
  // ============================================================

  submit(active: boolean): void {
    const allErrors = [1, 2, 3, 4, 5, 6]
      .flatMap((s) => this.validateStep(s));
    if (allErrors.length > 0) {
      this.errorMessage.set(allErrors[0]);
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    const s1 = this.step1Form.value;
    const sla = this.step5Form.value;
    const callbacks = this.step6Form.value;
    const callbackUrl: string = callbacks.callbackUrl?.trim() ?? '';
    const callbackEvents: CallbackEvent[] = callbacks.callbackEvents ?? [];

    const createRequest = {
      name: s1.name as string,
      description: s1.description as string,
      allowedWorkTypes: [] as string[],
      sla: {
        targetHandleTime: Math.round((sla.defaultHandleTimeMs as number) / 1000),
        maxQueueWaitTime: Math.round((sla.maxQueueWaitMs as number) / 1000),
        serviceLevelTarget: sla.warningThresholdPercent as number,
      },
      ...(callbackUrl && callbackEvents.length > 0
        ? { callbackUrl, callbackEvents }
        : {}),
    };

    this.pipelineApi.createPipeline(createRequest)
      .pipe(
        switchMap((pipeline) => {
          const queueCreates = this.wizardQueues.controls.map((ctrl) => {
            const g = ctrl as FormGroup;
            return this.pipelineApi.createQueue(pipeline.id, {
              name: g.get('name')?.value,
              description: g.get('description')?.value,
              priority: g.get('priority')?.value,
              requiredSkills: g.get('requiredSkills')?.value ?? [],
              maxCapacity: g.get('maxCapacity')?.value ?? 0,
            });
          });

          return forkJoin(queueCreates.length > 0 ? queueCreates : [of(null)]).pipe(
            switchMap((createdQueues) => {
              // Map queue labels to IDs
              const labelToId = new Map<string, string>();
              this.wizardQueues.controls.forEach((ctrl, i) => {
                const label = (ctrl as FormGroup).get('label')?.value;
                const createdQueue = createdQueues[i];
                if (label && createdQueue && 'id' in createdQueue) {
                  labelToId.set(label, (createdQueue as { id: string }).id);
                }
              });

              const ruleCreates = this.routingRules.controls.map((ctrl, i) => {
                const g = ctrl as FormGroup;
                const actionType: string = g.get('routingActionType')?.value ?? 'queue';
                const targetLabel: string = g.get('targetQueueLabel')?.value ?? '';
                const targetPipelineId: string | null = g.get('targetPipelineId')?.value ?? null;

                const targetQueueId = actionType === 'queue' ? (labelToId.get(targetLabel) ?? '') : '';
                const hasCrossPipeline = actionType === 'pipeline' && !!targetPipelineId;

                if (!targetQueueId && !hasCrossPipeline) return of(null);

                const conditionField: string = g.get('conditionField')?.value;
                const conditions = conditionField
                  ? [{
                      id: `cond-${Date.now()}-${i}`,
                      field: conditionField,
                      operator: g.get('conditionOperator')?.value ?? 'equals',
                      value: g.get('conditionValue')?.value ?? '',
                    }]
                  : [];

                return this.pipelineApi.createRoutingRule(pipeline.id, {
                  name: g.get('name')?.value,
                  priority: i + 1,
                  conditions,
                  conditionLogic: 'AND',
                  ...(hasCrossPipeline
                    ? { targetPipelineId: targetPipelineId! }
                    : { targetQueueId }),
                });
              });

              if (ruleCreates.length === 0) return of([]);
              return forkJoin(ruleCreates);
            }),
            switchMap(() => {
              if (active) {
                return this.pipelineApi.enablePipeline(pipeline.id);
              }
              return of(pipeline);
            }),
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.router.navigate(['/admin/pipelines']);
        },
        error: (err: { error?: { message?: string } }) => {
          this.errorMessage.set(err.error?.message ?? 'Failed to create pipeline');
          this.isSubmitting.set(false);
        },
      });
  }

  // ============================================================
  // STEP 6 — CALLBACKS
  // ============================================================

  /**
   * Returns true when Callbacks step is valid:
   * - Both callbackUrl and callbackEvents are empty (no callbacks configured), OR
   * - callbackUrl is filled AND at least one event is checked.
   */
  callbacksStepValid(): boolean {
    const url: string = this.step6Form.get('callbackUrl')?.value ?? '';
    const events: CallbackEvent[] = this.step6Form.get('callbackEvents')?.value ?? [];
    const hasUrl = url.trim().length > 0;
    const hasEvents = events.length > 0;
    if (!hasUrl && !hasEvents) return true;          // both empty — no callbacks
    if (hasUrl && hasEvents) return true;            // both filled — valid
    return false;                                    // one side filled, other empty
  }

  toggleCallbackEvent(event: CallbackEvent): void {
    const current: CallbackEvent[] = this.step6Form.get('callbackEvents')?.value ?? [];
    const updated = current.includes(event)
      ? current.filter((e) => e !== event)
      : [...current, event];
    this.step6Form.patchValue({ callbackEvents: updated });
  }

  isCallbackEventSelected(event: CallbackEvent): boolean {
    const selected: CallbackEvent[] = this.step6Form.get('callbackEvents')?.value ?? [];
    return selected.includes(event);
  }

  // ============================================================
  // HELPERS
  // ============================================================

  getSchemaFieldGroup(index: number): FormGroup {
    return this.schemaFields.at(index) as FormGroup;
  }
}
