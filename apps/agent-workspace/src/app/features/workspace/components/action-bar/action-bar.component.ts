import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Observable,
  map,
  Subject,
  takeUntil,
  filter,
  switchMap,
  of,
  combineLatest,
} from 'rxjs';
import {
  Task,
  TaskAction,
  AgentState,
  Disposition,
} from '@nexus-queue/shared-models';
import {
  QueueService,
  LoggerService,
  DispositionService,
} from '../../../../core/services';

const LOG_CONTEXT = 'ActionBar';

@Component({
  selector: 'app-action-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './action-bar.component.html',
  styleUrl: './action-bar.component.scss',
})
export class ActionBarComponent implements OnInit, OnDestroy {
  currentTask$!: Observable<Task | null>;
  agentState$!: Observable<AgentState>;
  actions$!: Observable<TaskAction[]>;
  showBar$!: Observable<boolean>;
  countdown$!: Observable<number>;
  workType$!: Observable<string>;
  dispositions$!: Observable<Disposition[]>;

  // Modal state
  showNoteModal = false;
  noteText = '';
  selectedDisposition: Disposition | null = null;

  private logger = inject(LoggerService);
  private destroy$ = new Subject<void>();

  constructor(
    private queueService: QueueService,
    private dispositionService: DispositionService
  ) {}

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

    // Load dispositions from the backend
    this.dispositions$ = this.dispositionService.dispositions$;

    // Load dispositions when entering WRAP_UP state
    combineLatest([this.agentState$, this.currentTask$])
      .pipe(
        takeUntil(this.destroy$),
        filter(([state, task]) => state === 'WRAP_UP' && task !== null),
        switchMap(([, task]) => {
          if (!task) return of([]);
          // Load dispositions for the task's work type
          return this.dispositionService.getDispositionsForContext(
            task.queueId,
            task.workType
          );
        })
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
   * Handle disposition selection in WRAP_UP state
   */
  onDispositionSelect(disposition: Disposition): void {
    this.logger.info(LOG_CONTEXT, 'Disposition selected', {
      code: disposition.code,
      name: disposition.name,
      requiresNote: disposition.requiresNote,
    });

    if (disposition.requiresNote) {
      // Show note modal
      this.selectedDisposition = disposition;
      this.noteText = '';
      this.showNoteModal = true;
    } else {
      // Complete immediately
      this.completeWithDisposition(disposition);
    }
  }

  /**
   * Submit disposition with note from modal
   */
  onSubmitNote(): void {
    if (!this.selectedDisposition) return;

    this.completeWithDisposition(this.selectedDisposition, this.noteText);
    this.closeNoteModal();
  }

  /**
   * Close the note modal
   */
  closeNoteModal(): void {
    this.showNoteModal = false;
    this.noteText = '';
    this.selectedDisposition = null;
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

  /**
   * Get button class for disposition based on category/color
   */
  getDispositionButtonClass(disposition: Disposition): string {
    const classes = ['action-btn', 'disposition-btn'];

    // Map category/color to button style
    const color = disposition.color || 'gray';
    classes.push(`color-${color}`);

    return classes.join(' ');
  }

  private handleComplete(action: TaskAction): void {
    const state = this.queueService.agentState;

    if (state === 'ACTIVE') {
      // Move to wrap-up
      this.queueService.completeTask();
    } else if (state === 'WRAP_UP') {
      // Submit disposition using legacy method (for backwards compatibility)
      this.queueService.submitDisposition({
        code: action.dispositionCode || 'COMPLETED',
        label: action.label,
      });
    }
  }

  private completeWithDisposition(
    disposition: Disposition,
    note?: string
  ): void {
    const task = this.queueService.currentTask;
    if (!task) {
      this.logger.error(LOG_CONTEXT, 'No task to complete');
      return;
    }

    // Complete task via API
    this.dispositionService
      .completeTaskWithDisposition({
        taskId: task.id,
        dispositionId: disposition.id,
        note: note,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Also update local state via QueueService
          this.queueService.submitDisposition({
            code: disposition.code,
            label: disposition.name,
            note: note,
          });
        },
        error: (error) => {
          this.logger.error(LOG_CONTEXT, 'Failed to complete task', error);
          // Still submit locally to maintain state consistency
          this.queueService.submitDisposition({
            code: disposition.code,
            label: disposition.name,
            note: note,
          });
        },
      });
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
    this.logger.info(LOG_CONTEXT, 'Custom action triggered', {
      actionId: action.id,
      label: action.label,
    });
    // Custom actions would be handled via configuration
  }
}
