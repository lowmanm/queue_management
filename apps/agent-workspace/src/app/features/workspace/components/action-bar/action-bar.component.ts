import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, map } from 'rxjs';
import { Task, TaskAction, AgentState } from '@nexus-queue/shared-models';
import { QueueService, LoggerService } from '../../../../core/services';

const LOG_CONTEXT = 'ActionBar';

@Component({
  selector: 'app-action-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './action-bar.component.html',
  styleUrl: './action-bar.component.scss',
})
export class ActionBarComponent implements OnInit {
  currentTask$!: Observable<Task | null>;
  agentState$!: Observable<AgentState>;
  actions$!: Observable<TaskAction[]>;
  showBar$!: Observable<boolean>;
  countdown$!: Observable<number>;
  workType$!: Observable<string>;

  private logger = inject(LoggerService);

  constructor(private queueService: QueueService) {}

  ngOnInit(): void {
    this.currentTask$ = this.queueService.currentTask$;
    this.agentState$ = this.queueService.agentState$;
    this.countdown$ = this.queueService.reservationCountdown$;

    // Extract actions from current task
    this.actions$ = this.currentTask$.pipe(
      map((task) => task?.actions || [])
    );

    // Extract work type for display
    this.workType$ = this.currentTask$.pipe(
      map((task) => task?.workType || '')
    );

    // Show bar when in RESERVED, ACTIVE, or WRAP_UP state
    this.showBar$ = this.agentState$.pipe(
      map((state) => ['RESERVED', 'ACTIVE', 'WRAP_UP'].includes(state))
    );
  }

  /**
   * Handle action button click based on action type
   */
  onActionClick(action: TaskAction): void {
    switch (action.type) {
      case 'COMPLETE':
        this.handleComplete(action);
        break;
      case 'TRANSFER':
        this.handleTransfer();
        break;
      case 'LINK':
        this.handleLink(action);
        break;
      case 'CUSTOM':
        this.handleCustom(action);
        break;
    }
  }

  /**
   * Accept the reserved task
   */
  onAccept(): void {
    this.queueService.acceptTask();
  }

  /**
   * Reject the reserved task
   */
  onReject(): void {
    this.queueService.rejectTask();
  }

  /**
   * Get button style class based on action
   */
  getButtonClass(action: TaskAction): string {
    const classes = ['action-btn'];

    if (action.primary) {
      classes.push('primary');
    }

    if (action.type === 'COMPLETE') {
      // Check if this is a deny/reject action
      const isDeny =
        action.dispositionCode?.toLowerCase().includes('denied') ||
        action.dispositionCode?.toLowerCase().includes('reject') ||
        action.label.toLowerCase().includes('deny');

      if (isDeny) {
        classes.push('deny');
      } else {
        classes.push('complete');
      }
    } else if (action.type === 'TRANSFER') {
      classes.push('transfer');
    } else if (action.type === 'LINK') {
      classes.push('link');
    }

    return classes.join(' ');
  }

  private handleComplete(action: TaskAction): void {
    const state = this.queueService.agentState;

    if (state === 'ACTIVE') {
      // Move to wrap-up
      this.queueService.completeTask();
    } else if (state === 'WRAP_UP') {
      // Submit disposition
      this.queueService.submitDisposition({
        code: action.dispositionCode || 'COMPLETED',
        label: action.label,
      });
    }
  }

  private handleTransfer(): void {
    // For now, just transfer directly
    // In a real implementation, this would open a transfer dialog
    this.queueService.transferTask();
  }

  private handleLink(action: TaskAction): void {
    if (action.url) {
      window.open(action.url, '_blank', 'noopener,noreferrer');
    }
  }

  private handleCustom(action: TaskAction): void {
    this.logger.info(LOG_CONTEXT, 'Custom action triggered', { actionId: action.id, label: action.label });
    // Custom actions would be handled via configuration
  }
}
