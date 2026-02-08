import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SessionApiService } from '../../../../core/services/session-api.service';
import {
  WorkStateConfig,
  CreateWorkStateRequest,
  UpdateWorkStateRequest,
  WORK_STATE_ICONS,
} from '@nexus-queue/shared-models';

@Component({
  selector: 'app-work-states',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './work-states.component.html',
  styleUrls: ['./work-states.component.scss'],
})
export class WorkStatesComponent implements OnInit {
  private readonly sessionApi = inject(SessionApiService);

  // Data
  systemStates = signal<WorkStateConfig[]>([]);
  customStates = signal<WorkStateConfig[]>([]);

  // UI State
  isLoading = signal(false);
  showEditor = signal(false);
  editingState = signal<WorkStateConfig | null>(null);
  errorMessage = signal('');
  successMessage = signal('');

  // Form state
  formData = signal<Partial<CreateWorkStateRequest>>({
    name: '',
    color: '#f97316',
    icon: 'coffee',
    agentSelectable: true,
    isBillable: true,
    maxDurationMinutes: 15,
    warnBeforeMax: true,
    warnMinutesBefore: 2,
    requiresApproval: false,
  });

  // Available icons
  readonly iconOptions = WORK_STATE_ICONS;

  // Color presets
  readonly colorPresets = [
    { value: '#f97316', label: 'Orange' },
    { value: '#ef4444', label: 'Red' },
    { value: '#a855f7', label: 'Purple' },
    { value: '#ec4899', label: 'Pink' },
    { value: '#14b8a6', label: 'Teal' },
    { value: '#6366f1', label: 'Indigo' },
    { value: '#dc2626', label: 'Dark Red' },
    { value: '#1d4ed8', label: 'Blue' },
    { value: '#059669', label: 'Green' },
    { value: '#78716c', label: 'Gray' },
  ];

  // Computed
  activeCustomStates = computed(() =>
    this.customStates().filter((s) => s.active)
  );

  inactiveCustomStates = computed(() =>
    this.customStates().filter((s) => !s.active)
  );

  isEditMode = computed(() => this.editingState() !== null);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);
    this.clearMessages();

    // Load system and custom states
    this.sessionApi.getSystemStates().subscribe({
      next: (states) => {
        this.systemStates.set(states);
      },
      error: (err) => {
        console.error('Failed to load system states', err);
      },
    });

    this.sessionApi.getCustomStates().subscribe({
      next: (states) => {
        this.customStates.set(states);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load custom states', err);
        this.errorMessage.set('Failed to load work states');
        this.isLoading.set(false);
      },
    });
  }

  // ============ Editor ============

  openNewEditor(): void {
    this.editingState.set(null);
    this.formData.set({
      name: '',
      color: '#f97316',
      icon: 'coffee',
      agentSelectable: true,
      isBillable: true,
      maxDurationMinutes: 15,
      warnBeforeMax: true,
      warnMinutesBefore: 2,
      requiresApproval: false,
    });
    this.showEditor.set(true);
    this.clearMessages();
  }

  openEditEditor(state: WorkStateConfig): void {
    this.editingState.set(state);
    this.formData.set({
      name: state.name,
      color: state.color,
      icon: state.icon,
      agentSelectable: state.agentSelectable,
      isBillable: state.isBillable,
      maxDurationMinutes: state.maxDurationMinutes,
      warnBeforeMax: state.warnBeforeMax,
      warnMinutesBefore: state.warnMinutesBefore,
      requiresApproval: state.requiresApproval,
    });
    this.showEditor.set(true);
    this.clearMessages();
  }

  closeEditor(): void {
    this.showEditor.set(false);
    this.editingState.set(null);
    this.clearMessages();
  }

  saveState(): void {
    const data = this.formData();
    if (!data.name) {
      this.errorMessage.set('Name is required');
      return;
    }

    this.isLoading.set(true);
    this.clearMessages();

    const editing = this.editingState();
    if (editing) {
      // Update existing
      const updates: UpdateWorkStateRequest = {
        name: data.name,
        color: data.color,
        icon: data.icon,
        agentSelectable: data.agentSelectable,
        isBillable: data.isBillable,
        maxDurationMinutes: data.maxDurationMinutes,
        warnBeforeMax: data.warnBeforeMax,
        warnMinutesBefore: data.warnMinutesBefore,
        requiresApproval: data.requiresApproval,
      };
      this.sessionApi.updateWorkState(editing.id, updates).subscribe({
        next: (updated) => {
          const list = this.customStates();
          const index = list.findIndex((s) => s.id === updated.id);
          if (index >= 0) {
            list[index] = updated;
            this.customStates.set([...list]);
          }
          this.successMessage.set('Work state updated successfully');
          this.isLoading.set(false);
          this.closeEditor();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update work state');
          this.isLoading.set(false);
        },
      });
    } else {
      // Create new
      this.sessionApi.createWorkState(data as CreateWorkStateRequest).subscribe({
        next: (created) => {
          this.customStates.set([...this.customStates(), created]);
          this.successMessage.set('Work state created successfully');
          this.isLoading.set(false);
          this.closeEditor();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to create work state');
          this.isLoading.set(false);
        },
      });
    }
  }

  toggleState(state: WorkStateConfig): void {
    this.isLoading.set(true);
    this.clearMessages();

    this.sessionApi.toggleWorkState(state.id).subscribe({
      next: (updated) => {
        const list = this.customStates();
        const index = list.findIndex((s) => s.id === updated.id);
        if (index >= 0) {
          list[index] = updated;
          this.customStates.set([...list]);
        }
        this.successMessage.set(`Work state ${updated.active ? 'enabled' : 'disabled'}`);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to toggle work state');
        this.isLoading.set(false);
      },
    });
  }

  deleteState(state: WorkStateConfig): void {
    if (!confirm(`Are you sure you want to delete "${state.name}"? This cannot be undone.`)) {
      return;
    }

    this.isLoading.set(true);
    this.clearMessages();

    this.sessionApi.deleteWorkState(state.id).subscribe({
      next: () => {
        this.customStates.set(this.customStates().filter((s) => s.id !== state.id));
        this.successMessage.set('Work state deleted');
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete work state');
        this.isLoading.set(false);
      },
    });
  }

  // ============ Form Helpers ============

  updateFormField<K extends keyof CreateWorkStateRequest>(
    field: K,
    value: CreateWorkStateRequest[K]
  ): void {
    this.formData.set({ ...this.formData(), [field]: value });
  }

  // ============ Display Helpers ============

  getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      offline: 'Offline',
      available: 'Available',
      productive: 'Productive',
      unavailable: 'Unavailable',
    };
    return labels[category] || category;
  }

  formatDuration(minutes: number): string {
    if (minutes === 0) return 'Unlimited';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }
}
