import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DispositionApiService } from '../../services/disposition.service';
import {
  Disposition,
  DispositionCategory,
  DispositionColor,
  DispositionCategoryConfig,
  CreateDispositionRequest,
  Queue,
  WorkType,
  DISPOSITION_CATEGORIES,
} from '@nexus-queue/shared-models';

@Component({
  selector: 'app-dispositions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dispositions.component.html',
  styleUrls: ['./dispositions.component.scss'],
})
export class DispositionsComponent implements OnInit {
  private readonly dispositionService = inject(DispositionApiService);

  // Data
  dispositions = signal<Disposition[]>([]);
  queues = signal<Queue[]>([]);
  workTypes = signal<WorkType[]>([]);
  categories = signal<DispositionCategoryConfig[]>(DISPOSITION_CATEGORIES);

  // UI State
  isLoading = signal(false);
  showEditor = signal(false);
  editingDisposition = signal<Disposition | null>(null);
  errorMessage = signal('');
  successMessage = signal('');

  // Form state
  formData = signal<Partial<CreateDispositionRequest>>({
    code: '',
    name: '',
    description: '',
    category: 'COMPLETED',
    requiresNote: false,
    icon: '',
    color: 'green',
    queueIds: [],
    workTypeIds: [],
  });

  // Color options
  readonly colorOptions: { value: DispositionColor; label: string; class: string }[] = [
    { value: 'green', label: 'Green (Success)', class: 'color-green' },
    { value: 'blue', label: 'Blue (Transfer)', class: 'color-blue' },
    { value: 'orange', label: 'Orange (Deferred)', class: 'color-orange' },
    { value: 'red', label: 'Red (Error/Cancel)', class: 'color-red' },
    { value: 'purple', label: 'Purple (Escalation)', class: 'color-purple' },
    { value: 'gray', label: 'Gray (Default)', class: 'color-gray' },
  ];

  // Icon options
  readonly iconOptions = [
    'check', 'x', 'clock', 'arrow-up', 'arrow-right', 'file', 'file-text',
    'help-circle', 'x-circle', 'check-square', 'edit', 'unlock', 'lock',
    'search', 'refresh', 'alert-triangle', 'info', 'user', 'users',
  ];

  // Computed
  activeDispositions = computed(() =>
    this.dispositions().filter(d => d.active)
  );

  inactiveDispositions = computed(() =>
    this.dispositions().filter(d => !d.active)
  );

  isEditMode = computed(() => this.editingDisposition() !== null);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);
    this.dispositionService.getConfig().subscribe({
      next: (config) => {
        this.dispositions.set(config.dispositions);
        this.queues.set(config.queues);
        this.workTypes.set(config.workTypes);
        this.categories.set(config.categories);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load configuration', err);
        this.errorMessage.set('Failed to load configuration');
        this.isLoading.set(false);
      },
    });
  }

  // ============ Editor ============

  openNewEditor(): void {
    this.editingDisposition.set(null);
    this.formData.set({
      code: '',
      name: '',
      description: '',
      category: 'COMPLETED',
      requiresNote: false,
      icon: 'check',
      color: 'green',
      queueIds: [],
      workTypeIds: [],
    });
    this.showEditor.set(true);
    this.clearMessages();
  }

  openEditEditor(disposition: Disposition): void {
    this.editingDisposition.set(disposition);
    this.formData.set({
      code: disposition.code,
      name: disposition.name,
      description: disposition.description || '',
      category: disposition.category,
      requiresNote: disposition.requiresNote,
      icon: disposition.icon || 'check',
      color: disposition.color || 'green',
      queueIds: [...disposition.queueIds],
      workTypeIds: [...disposition.workTypeIds],
    });
    this.showEditor.set(true);
    this.clearMessages();
  }

  closeEditor(): void {
    this.showEditor.set(false);
    this.editingDisposition.set(null);
    this.clearMessages();
  }

  saveDisposition(): void {
    const data = this.formData();
    if (!data.code || !data.name || !data.category) {
      this.errorMessage.set('Code, name, and category are required');
      return;
    }

    this.isLoading.set(true);
    this.clearMessages();

    const editing = this.editingDisposition();
    if (editing) {
      // Update existing
      this.dispositionService.updateDisposition(editing.id, data).subscribe({
        next: (updated) => {
          const list = this.dispositions();
          const index = list.findIndex(d => d.id === updated.id);
          if (index >= 0) {
            list[index] = updated;
            this.dispositions.set([...list]);
          }
          this.successMessage.set('Disposition updated successfully');
          this.isLoading.set(false);
          this.closeEditor();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update disposition');
          this.isLoading.set(false);
        },
      });
    } else {
      // Create new
      this.dispositionService.createDisposition(data as CreateDispositionRequest).subscribe({
        next: (created) => {
          this.dispositions.set([...this.dispositions(), created]);
          this.successMessage.set('Disposition created successfully');
          this.isLoading.set(false);
          this.closeEditor();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to create disposition');
          this.isLoading.set(false);
        },
      });
    }
  }

  deleteDisposition(disposition: Disposition): void {
    if (!confirm(`Are you sure you want to deactivate "${disposition.name}"?`)) {
      return;
    }

    this.isLoading.set(true);
    this.dispositionService.deleteDisposition(disposition.id).subscribe({
      next: () => {
        // Update local state
        const list = this.dispositions();
        const index = list.findIndex(d => d.id === disposition.id);
        if (index >= 0) {
          list[index] = { ...list[index], active: false };
          this.dispositions.set([...list]);
        }
        this.successMessage.set('Disposition deactivated');
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to deactivate disposition');
        this.isLoading.set(false);
      },
    });
  }

  reactivateDisposition(disposition: Disposition): void {
    this.isLoading.set(true);
    this.dispositionService.updateDisposition(disposition.id, { active: true }).subscribe({
      next: (updated) => {
        const list = this.dispositions();
        const index = list.findIndex(d => d.id === updated.id);
        if (index >= 0) {
          list[index] = updated;
          this.dispositions.set([...list]);
        }
        this.successMessage.set('Disposition reactivated');
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to reactivate disposition');
        this.isLoading.set(false);
      },
    });
  }

  // ============ Form Helpers ============

  updateFormField(field: keyof CreateDispositionRequest, value: unknown): void {
    this.formData.set({ ...this.formData(), [field]: value });
  }

  toggleQueueId(queueId: string): void {
    const current = this.formData().queueIds || [];
    const index = current.indexOf(queueId);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(queueId);
    }
    this.updateFormField('queueIds', [...current]);
  }

  toggleWorkTypeId(workTypeId: string): void {
    const current = this.formData().workTypeIds || [];
    const index = current.indexOf(workTypeId);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(workTypeId);
    }
    this.updateFormField('workTypeIds', [...current]);
  }

  isQueueSelected(queueId: string): boolean {
    return (this.formData().queueIds || []).includes(queueId);
  }

  isWorkTypeSelected(workTypeId: string): boolean {
    return (this.formData().workTypeIds || []).includes(workTypeId);
  }

  // ============ Display Helpers ============

  getCategoryLabel(category: DispositionCategory): string {
    const config = this.categories().find(c => c.value === category);
    return config?.label || category;
  }

  getCategoryClass(category: DispositionCategory): string {
    return `category-${category.toLowerCase()}`;
  }

  getColorClass(color?: DispositionColor): string {
    return `color-${color || 'gray'}`;
  }

  clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }
}
