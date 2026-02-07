import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './queue-config.component.html',
  styleUrl: './queue-config.component.scss',
})
export class QueueConfigComponent implements OnInit {
  queues$ = new BehaviorSubject<QueueConfig[]>([]);

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

  // Mock data
  private mockQueues: QueueConfig[] = [
    {
      id: 'queue-001',
      name: 'Order Processing',
      description: 'New orders and order modifications',
      active: true,
      priority: 1,
      slaTarget: 300,
      maxWaitTime: 600,
      requiredSkills: ['orders'],
      workTypes: ['ORDERS'],
      assignedAgents: 4,
      routingMode: 'round-robin',
    },
    {
      id: 'queue-002',
      name: 'Returns & Refunds',
      description: 'Return requests and refund processing',
      active: true,
      priority: 2,
      slaTarget: 300,
      maxWaitTime: 900,
      requiredSkills: ['returns'],
      workTypes: ['RETURNS'],
      assignedAgents: 3,
      routingMode: 'least-busy',
    },
    {
      id: 'queue-003',
      name: 'Claims Processing',
      description: 'Insurance and warranty claims',
      active: true,
      priority: 3,
      slaTarget: 600,
      maxWaitTime: 1800,
      requiredSkills: ['claims'],
      workTypes: ['CLAIMS'],
      assignedAgents: 2,
      routingMode: 'skill-based',
    },
    {
      id: 'queue-004',
      name: 'Escalations',
      description: 'Escalated issues requiring supervisor attention',
      active: true,
      priority: 1,
      slaTarget: 600,
      maxWaitTime: 900,
      requiredSkills: ['escalation'],
      workTypes: ['ESCALATIONS'],
      assignedAgents: 2,
      routingMode: 'priority',
    },
    {
      id: 'queue-005',
      name: 'Customer Updates',
      description: 'Address changes, account updates',
      active: false,
      priority: 4,
      slaTarget: 300,
      maxWaitTime: 600,
      requiredSkills: [],
      workTypes: ['UPDATES'],
      assignedAgents: 2,
      routingMode: 'round-robin',
    },
  ];

  ngOnInit(): void {
    this.queues$.next(this.mockQueues);
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

    const queues = this.queues$.value;

    if (this.isEditing) {
      const index = queues.findIndex((q) => q.id === this.selectedQueue!.id);
      if (index >= 0) {
        queues[index] = { ...this.selectedQueue };
      }
    } else {
      this.selectedQueue.id = `queue-${Date.now()}`;
      queues.push({ ...this.selectedQueue });
    }

    this.queues$.next([...queues]);
    this.closeModal();
  }

  toggleQueueActive(queue: QueueConfig): void {
    const queues = this.queues$.value;
    const index = queues.findIndex((q) => q.id === queue.id);
    if (index >= 0) {
      queues[index] = { ...queues[index], active: !queues[index].active };
      this.queues$.next([...queues]);
    }
  }

  deleteQueue(queue: QueueConfig): void {
    if (confirm(`Are you sure you want to delete "${queue.name}"?`)) {
      const queues = this.queues$.value.filter((q) => q.id !== queue.id);
      this.queues$.next(queues);
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
