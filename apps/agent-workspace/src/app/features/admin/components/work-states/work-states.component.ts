import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  WorkStateConfig,
  CreateWorkStateRequest,
  WORK_STATE_ICONS,
} from '@nexus-queue/shared-models';
import { SessionApiService } from '../../../../core/services/session-api.service';

type EditMode = 'view' | 'create' | 'edit';

@Component({
  selector: 'app-work-states',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './work-states.component.html',
  styleUrl: './work-states.component.scss',
})
export class WorkStatesComponent implements OnInit {
  private sessionApi = inject(SessionApiService);

  // State
  systemStates = signal<WorkStateConfig[]>([]);
  customStates = signal<WorkStateConfig[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);

  // Edit modal
  editMode = signal<EditMode>('view');
  editingState = signal<WorkStateConfig | null>(null);

  // Form fields
  formName = signal('');
  formColor = signal('#6366f1');
  formIcon = signal('coffee');
  formAgentSelectable = signal(true);
  formIsBillable = signal(true);
  formMaxDuration = signal(30);
  formWarnBeforeMax = signal(true);
  formWarnMinutes = signal(5);
  formRequiresApproval = signal(false);

  // Available icons
  availableIcons = WORK_STATE_ICONS;

  // Color presets
  colorPresets = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  ];

  // Computed
  isEditing = computed(() => this.editMode() !== 'view');
  modalTitle = computed(() => {
    switch (this.editMode()) {
      case 'create': return 'Create Work State';
      case 'edit': return 'Edit Work State';
      default: return '';
    }
  });

  ngOnInit(): void {
    this.loadStates();
  }

  loadStates(): void {
    this.loading.set(true);
    this.error.set(null);

    this.sessionApi.getSystemStates().subscribe({
      next: (states) => this.systemStates.set(states),
      error: (err) => console.error('Failed to load system states:', err),
    });

    this.sessionApi.getCustomStates().subscribe({
      next: (states) => {
        this.customStates.set(states);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load custom states');
        this.loading.set(false);
      },
    });
  }

  // Modal actions
  openCreate(): void {
    this.resetForm();
    this.editMode.set('create');
    this.editingState.set(null);
  }

  openEdit(state: WorkStateConfig): void {
    this.editingState.set(state);
    this.formName.set(state.name);
    this.formColor.set(state.color);
    this.formIcon.set(state.icon);
    this.formAgentSelectable.set(state.agentSelectable);
    this.formIsBillable.set(state.isBillable);
    this.formMaxDuration.set(state.maxDurationMinutes);
    this.formWarnBeforeMax.set(state.warnBeforeMax);
    this.formWarnMinutes.set(state.warnMinutesBefore);
    this.formRequiresApproval.set(state.requiresApproval);
    this.editMode.set('edit');
  }

  closeModal(): void {
    this.editMode.set('view');
    this.editingState.set(null);
    this.resetForm();
  }

  resetForm(): void {
    this.formName.set('');
    this.formColor.set('#6366f1');
    this.formIcon.set('coffee');
    this.formAgentSelectable.set(true);
    this.formIsBillable.set(true);
    this.formMaxDuration.set(30);
    this.formWarnBeforeMax.set(true);
    this.formWarnMinutes.set(5);
    this.formRequiresApproval.set(false);
  }

  save(): void {
    if (!this.formName().trim()) {
      this.error.set('Name is required');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    if (this.editMode() === 'create') {
      const request: CreateWorkStateRequest = {
        name: this.formName().trim(),
        color: this.formColor(),
        icon: this.formIcon(),
        agentSelectable: this.formAgentSelectable(),
        isBillable: this.formIsBillable(),
        maxDurationMinutes: this.formMaxDuration(),
        warnBeforeMax: this.formWarnBeforeMax(),
        warnMinutesBefore: this.formWarnMinutes(),
        requiresApproval: this.formRequiresApproval(),
      };

      this.sessionApi.createWorkState(request).subscribe({
        next: () => {
          this.success.set('Work state created successfully');
          this.closeModal();
          this.loadStates();
          setTimeout(() => this.success.set(null), 3000);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to create work state');
          this.loading.set(false);
        },
      });
    } else if (this.editMode() === 'edit' && this.editingState()) {
      this.sessionApi.updateWorkState(this.editingState()!.id, {
        name: this.formName().trim(),
        color: this.formColor(),
        icon: this.formIcon(),
        agentSelectable: this.formAgentSelectable(),
        isBillable: this.formIsBillable(),
        maxDurationMinutes: this.formMaxDuration(),
        warnBeforeMax: this.formWarnBeforeMax(),
        warnMinutesBefore: this.formWarnMinutes(),
        requiresApproval: this.formRequiresApproval(),
      }).subscribe({
        next: () => {
          this.success.set('Work state updated successfully');
          this.closeModal();
          this.loadStates();
          setTimeout(() => this.success.set(null), 3000);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to update work state');
          this.loading.set(false);
        },
      });
    }
  }

  toggleState(state: WorkStateConfig): void {
    this.loading.set(true);
    this.sessionApi.toggleWorkState(state.id).subscribe({
      next: () => {
        this.success.set(`Work state ${state.active ? 'disabled' : 'enabled'}`);
        this.loadStates();
        setTimeout(() => this.success.set(null), 3000);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to toggle work state');
        this.loading.set(false);
      },
    });
  }

  deleteState(state: WorkStateConfig): void {
    if (!confirm(`Are you sure you want to delete "${state.name}"?`)) {
      return;
    }

    this.loading.set(true);
    this.sessionApi.deleteWorkState(state.id).subscribe({
      next: () => {
        this.success.set('Work state deleted');
        this.loadStates();
        setTimeout(() => this.success.set(null), 3000);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to delete work state');
        this.loading.set(false);
      },
    });
  }

  selectColor(color: string): void {
    this.formColor.set(color);
  }

  selectIcon(icon: string): void {
    this.formIcon.set(icon);
  }

  getIconClass(icon: string): string {
    // Map to material icons or return as-is
    const iconMap: Record<string, string> = {
      'coffee': 'local_cafe',
      'utensils': 'restaurant',
      'users': 'groups',
      'book-open': 'menu_book',
      'message-circle': 'chat',
      'folder': 'folder',
      'alert-triangle': 'warning',
      'shield': 'shield',
      'clock': 'schedule',
      'phone': 'phone',
      'headphones': 'headset',
      'monitor': 'computer',
      'tool': 'build',
      'heart': 'favorite',
      'star': 'star',
      'zap': 'bolt',
      'home': 'home',
      'car': 'directions_car',
      'plane': 'flight',
      'calendar': 'event',
      'briefcase': 'work',
      'clipboard': 'assignment',
      'file-text': 'description',
      'mail': 'email',
      'bell': 'notifications',
      'settings': 'settings',
      'help-circle': 'help',
      'info': 'info',
      'pause-circle': 'pause_circle',
      'stop-circle': 'stop_circle',
    };
    return iconMap[icon] || icon;
  }
}
