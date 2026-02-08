import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Subject, takeUntil } from 'rxjs';
import { ManagerApiService, QueueConfig as ApiQueueConfig } from '../../../../core/services/manager-api.service';
import { PageLayoutComponent } from '../../../../shared/components/layout/page-layout.component';

interface QueueConfig {
  id: string;
  name: string;
  description: string;
  active: boolean;
  priority: number;
  slaTarget: number;
  maxWaitTime: number;
  requiredSkills: string[];
  workTypes: string[];
  assignedAgents: number;
  routingMode: 'round-robin' | 'least-busy' | 'skill-based' | 'priority';
}

@Component({
  selector: 'app-queue-config',
  standalone: true,
  imports: [CommonModule, FormsModule, PageLayoutComponent],
  templateUrl: './queue-config.component.html',
  styleUrl: './queue-config.component.scss',
})
export class QueueConfigComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private managerApi = inject(ManagerApiService);

  queues$ = new BehaviorSubject<QueueConfig[]>([]);
  loading$ = new BehaviorSubject<boolean>(false);

  selectedQueue: QueueConfig | null = null;
  isEditing = false;
  showModal = false;

  availableSkills = [
    'orders',
    'returns',
    'claims',
    'billing',
    'technical',
    'escalation',
    'spanish',
    'french',
  ];
  availableWorkTypes = [
    'ORDERS',
    'RETURNS',
    'CLAIMS',
    'UPDATES',
    'ESCALATIONS',
  ];
  routingModes: { value: string; label: string }[] = [
    { value: 'round-robin', label: 'Round Robin' },
    { value: 'least-busy', label: 'Least Busy Agent' },
    { value: 'skill-based', label: 'Skill-Based Routing' },
    { value: 'priority', label: 'Priority-Based' },
  ];

  ngOnInit(): void {
    this.loadQueues();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadQueues(): void {
    this.loading$.next(true);
    this.managerApi
      .getAllQueues()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (queues) => {
          this.queues$.next(queues.map((q) => this.transformQueue(q)));
          this.loading$.next(false);
        },
        error: (err) => {
          console.error('Failed to load queues:', err);
          this.loading$.next(false);
        },
      });
  }

  private transformQueue(queue: ApiQueueConfig): QueueConfig {
    return {
      id: queue.id,
      name: queue.name,
      description: queue.description || '',
      active: queue.active,
      priority: queue.priority,
      slaTarget: queue.slaTarget,
      maxWaitTime: queue.maxWaitTime,
      requiredSkills: queue.requiredSkills,
      workTypes: queue.workTypes,
      assignedAgents: 0, // Computed from stats, not a config field
      routingMode: queue.routingMode as 'round-robin' | 'least-busy' | 'skill-based' | 'priority',
    };
  }

  openAddModal(): void {
    this.selectedQueue = {
      id: '',
      name: '',
      description: '',
      active: true,
      priority: 3,
      slaTarget: 300,
      maxWaitTime: 600,
      requiredSkills: [],
      workTypes: [],
      assignedAgents: 0,
      routingMode: 'round-robin',
    };
    this.isEditing = false;
    this.showModal = true;
  }

  openEditModal(queue: QueueConfig): void {
    this.selectedQueue = { ...queue };
    this.isEditing = true;
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.selectedQueue = null;
  }

  saveQueue(): void {
    if (!this.selectedQueue) return;

    this.loading$.next(true);
    const queueData = {
      name: this.selectedQueue.name,
      description: this.selectedQueue.description,
      active: this.selectedQueue.active,
      priority: this.selectedQueue.priority,
      slaTarget: this.selectedQueue.slaTarget,
      maxWaitTime: this.selectedQueue.maxWaitTime,
      requiredSkills: this.selectedQueue.requiredSkills,
      workTypes: this.selectedQueue.workTypes,
      routingMode: this.selectedQueue.routingMode,
    };

    if (this.isEditing) {
      this.managerApi
        .updateQueue(this.selectedQueue.id, queueData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadQueues();
            this.closeModal();
          },
          error: (err) => {
            console.error('Failed to update queue:', err);
            this.loading$.next(false);
          },
        });
    } else {
      this.managerApi
        .createQueue(queueData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loadQueues();
            this.closeModal();
          },
          error: (err) => {
            console.error('Failed to create queue:', err);
            this.loading$.next(false);
          },
        });
    }
  }

  toggleQueueActive(queue: QueueConfig): void {
    this.managerApi
      .toggleQueue(queue.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.loadQueues(),
        error: (err) => console.error('Failed to toggle queue:', err),
      });
  }

  deleteQueue(queue: QueueConfig): void {
    if (confirm(`Are you sure you want to delete "${queue.name}"?`)) {
      this.managerApi
        .deleteQueue(queue.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => this.loadQueues(),
          error: (err) => console.error('Failed to delete queue:', err),
        });
    }
  }

  toggleSkill(skill: string): void {
    if (!this.selectedQueue) return;

    const skills = this.selectedQueue.requiredSkills;
    const index = skills.indexOf(skill);
    if (index >= 0) {
      skills.splice(index, 1);
    } else {
      skills.push(skill);
    }
  }

  toggleWorkType(workType: string): void {
    if (!this.selectedQueue) return;

    const workTypes = this.selectedQueue.workTypes;
    const index = workTypes.indexOf(workType);
    if (index >= 0) {
      workTypes.splice(index, 1);
    } else {
      workTypes.push(workType);
    }
  }

  hasSkill(skill: string): boolean {
    return this.selectedQueue?.requiredSkills.includes(skill) || false;
  }

  hasWorkType(workType: string): boolean {
    return this.selectedQueue?.workTypes.includes(workType) || false;
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  getRoutingLabel(mode: string): string {
    return (
      this.routingModes.find((m) => m.value === mode)?.label || mode
    );
  }

  getPriorityLabel(priority: number): string {
    const labels: Record<number, string> = {
      1: 'Highest',
      2: 'High',
      3: 'Normal',
      4: 'Low',
      5: 'Lowest',
    };
    return labels[priority] || `Priority ${priority}`;
  }
}
