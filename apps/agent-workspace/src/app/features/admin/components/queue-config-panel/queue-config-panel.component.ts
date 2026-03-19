import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  OnDestroy,
  ChangeDetectionStrategy,
  inject,
  signal,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Subject, interval, takeUntil } from 'rxjs';
import {
  PipelineQueue,
  Skill,
  PipelineQueueRuntimeStats,
} from '@nexus-queue/shared-models';
import { PipelineApiService } from '../../services/pipeline.service';
import { SkillApiService } from '../../services/skill.service';

interface QueueFormState {
  name: string;
  description: string;
  priority: number;
  requiredSkills: string[];
  maxCapacity: number;
  slaWarningPercent: number;
  slaBreachPercent: number;
}

const DEFAULT_FORM: QueueFormState = {
  name: '',
  description: '',
  priority: 1,
  requiredSkills: [],
  maxCapacity: 0,
  slaWarningPercent: 80,
  slaBreachPercent: 100,
};

@Component({
  selector: 'app-queue-config-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './queue-config-panel.component.html',
  styleUrls: ['./queue-config-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QueueConfigPanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() pipelineId!: string;
  @Input() queues: PipelineQueue[] = [];
  @Output() queuesChanged = new EventEmitter<PipelineQueue[]>();

  private readonly pipelineApi = inject(PipelineApiService);
  private readonly skillApi = inject(SkillApiService);
  private readonly destroy$ = new Subject<void>();

  // ============================================================
  // STATE
  // ============================================================

  queues$ = new BehaviorSubject<PipelineQueue[]>([]);
  queueStats$ = new BehaviorSubject<Map<string, PipelineQueueRuntimeStats>>(new Map());

  availableSkills = signal<Skill[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  // Editing state
  editingQueueId = signal<string | null>(null);
  isCreating = signal(false);
  deletingQueueId = signal<string | null>(null);

  // Create/edit form
  form = signal<QueueFormState>({ ...DEFAULT_FORM });

  // ============================================================
  // LIFECYCLE
  // ============================================================

  ngOnInit(): void {
    this.queues$.next(this.queues ?? []);
    this.loadSkills();
    this.loadStats();

    // Poll stats every 30s
    interval(30_000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadStats());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['queues']) {
      this.queues$.next(changes['queues'].currentValue ?? []);
      this.loadStats();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================
  // DATA LOADING
  // ============================================================

  private loadSkills(): void {
    this.skillApi.getAllSkills()
      .pipe(takeUntil(this.destroy$))
      .subscribe((skills) => this.availableSkills.set(skills));
  }

  private loadStats(): void {
    const queues = this.queues$.getValue();
    if (queues.length === 0) return;

    this.pipelineApi.getAllQueueStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe((statsList) => {
        const map = new Map<string, PipelineQueueRuntimeStats>();
        statsList.forEach((s) => map.set(s.id, s));
        this.queueStats$.next(map);
      });
  }

  getStats(queueId: string): PipelineQueueRuntimeStats | undefined {
    return this.queueStats$.getValue().get(queueId);
  }

  healthStatus(queueId: string): 'healthy' | 'warning' | 'critical' | 'unknown' {
    return this.getStats(queueId)?.status ?? 'unknown';
  }

  // ============================================================
  // CREATE MODE
  // ============================================================

  openCreate(): void {
    this.isCreating.set(true);
    this.editingQueueId.set(null);
    this.form.set({ ...DEFAULT_FORM, priority: this.queues$.getValue().length + 1 });
    this.clearMessages();
  }

  cancelCreate(): void {
    this.isCreating.set(false);
    this.form.set({ ...DEFAULT_FORM });
  }

  saveCreate(): void {
    const f = this.form();
    if (!f.name.trim()) {
      this.errorMessage.set('Queue name is required');
      return;
    }
    if (f.priority < 1 || f.priority > 10) {
      this.errorMessage.set('Priority must be between 1 and 10');
      return;
    }

    this.isLoading.set(true);
    this.clearMessages();

    this.pipelineApi.createQueue(this.pipelineId, {
      name: f.name,
      description: f.description,
      priority: f.priority,
      requiredSkills: f.requiredSkills,
      maxCapacity: f.maxCapacity,
      slaOverrides: {
        serviceLevelTarget: f.slaWarningPercent,
      },
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (queue) => {
          const updated = [...this.queues$.getValue(), queue];
          this.queues$.next(updated);
          this.queuesChanged.emit(updated);
          this.isCreating.set(false);
          this.form.set({ ...DEFAULT_FORM });
          this.successMessage.set('Queue created');
          this.isLoading.set(false);
        },
        error: (err: { error?: { message?: string } }) => {
          this.errorMessage.set(err.error?.message ?? 'Failed to create queue');
          this.isLoading.set(false);
        },
      });
  }

  // ============================================================
  // EDIT MODE
  // ============================================================

  openEdit(queue: PipelineQueue): void {
    this.editingQueueId.set(queue.id);
    this.isCreating.set(false);
    this.form.set({
      name: queue.name,
      description: queue.description ?? '',
      priority: queue.priority,
      requiredSkills: [...(queue.requiredSkills ?? [])],
      maxCapacity: queue.maxCapacity,
      slaWarningPercent: queue.slaOverrides?.serviceLevelTarget ?? 80,
      slaBreachPercent: 100,
    });
    this.clearMessages();
  }

  cancelEdit(): void {
    this.editingQueueId.set(null);
    this.form.set({ ...DEFAULT_FORM });
  }

  saveEdit(): void {
    const queueId = this.editingQueueId();
    if (!queueId) return;

    const f = this.form();
    if (!f.name.trim()) {
      this.errorMessage.set('Queue name is required');
      return;
    }
    if (f.priority < 1 || f.priority > 10) {
      this.errorMessage.set('Priority must be between 1 and 10');
      return;
    }

    this.isLoading.set(true);
    this.clearMessages();

    this.pipelineApi.updateQueue(this.pipelineId, queueId, {
      name: f.name,
      description: f.description,
      priority: f.priority,
      requiredSkills: f.requiredSkills,
      maxCapacity: f.maxCapacity,
      slaOverrides: {
        serviceLevelTarget: f.slaWarningPercent,
      },
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          const queues = this.queues$.getValue().map((q) => q.id === queueId ? updated : q);
          this.queues$.next(queues);
          this.queuesChanged.emit(queues);
          this.editingQueueId.set(null);
          this.successMessage.set('Queue updated');
          this.isLoading.set(false);
        },
        error: (err: { error?: { message?: string } }) => {
          this.errorMessage.set(err.error?.message ?? 'Failed to update queue');
          this.isLoading.set(false);
        },
      });
  }

  // ============================================================
  // DELETE
  // ============================================================

  confirmDelete(queue: PipelineQueue): void {
    this.deletingQueueId.set(queue.id);
  }

  cancelDelete(): void {
    this.deletingQueueId.set(null);
  }

  executeDelete(queue: PipelineQueue): void {
    this.isLoading.set(true);
    this.clearMessages();

    this.pipelineApi.deleteQueue(this.pipelineId, queue.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          const queues = this.queues$.getValue().filter((q) => q.id !== queue.id);
          this.queues$.next(queues);
          this.queuesChanged.emit(queues);
          this.deletingQueueId.set(null);
          this.successMessage.set('Queue deleted');
          this.isLoading.set(false);
        },
        error: (err: { error?: { message?: string } }) => {
          this.errorMessage.set(err.error?.message ?? 'Failed to delete queue');
          this.deletingQueueId.set(null);
          this.isLoading.set(false);
        },
      });
  }

  // ============================================================
  // SKILLS MULTI-SELECT
  // ============================================================

  toggleSkill(skillId: string): void {
    const current = this.form().requiredSkills;
    const updated = current.includes(skillId)
      ? current.filter((s) => s !== skillId)
      : [...current, skillId];
    this.form.update((f) => ({ ...f, requiredSkills: updated }));
  }

  isSkillSelected(skillId: string): boolean {
    return this.form().requiredSkills.includes(skillId);
  }

  // ============================================================
  // FORM FIELD UPDATE
  // ============================================================

  updateField(field: keyof QueueFormState, value: unknown): void {
    this.form.update((f) => ({ ...f, [field]: value }));
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }
}
