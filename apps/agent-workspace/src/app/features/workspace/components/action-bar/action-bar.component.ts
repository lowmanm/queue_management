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
  WorkStateConfig,
} from '@nexus-queue/shared-models';
import {
  QueueService,
  LoggerService,
  DispositionService,
  AuthService,
} from '../../../../core/services';
import { SessionApiService } from '../../../../core/services/session-api.service';

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
  workType$!: Observable<string>;
  dispositions$!: Observable<Disposition[]>;

  // Post-disposition state
  showPostDisposition = false;
  selectableWorkStates: WorkStateConfig[] = [];
  requestingNext = false;

  // Modal state
  showNoteModal = false;
  noteText = '';
  selectedDisposition: Disposition | null = null;

  // Disposition submission guard
  private dispositionInProgress = false;

  private logger = inject(LoggerService);
  private authService = inject(AuthService);
  private sessionApi = inject(SessionApiService);
  private destroy$ = new Subject<void>();

  constructor(
    private queueService: QueueService,
    private dispositionService: DispositionService
  ) {}

  ngOnInit(): void {
    this.currentTask$ = this.queueService.currentTask$;
    this.agentState$ = this.queueService.agentState$;

    // Extract actions from current task
    this.actions$ = this.currentTask$.pipe(
      map((task) => task?.actions || [])
    );

    // Extract work type for display
    this.workType$ = this.currentTask$.pipe(
      map((task) => task?.workType || '')
    );

    // Show bar when in ACTIVE, WRAP_UP, or IDLE state (IDLE shows post-disposition options)
    this.showBar$ = this.agentState$.pipe(
      map((state) => ['ACTIVE', 'WRAP_UP', 'IDLE'].includes(state))
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

    // Track state transitions to show post-disposition UI
    this.agentState$.pipe(takeUntil(this.destroy$)).subscribe((state) => {
      if (state === 'IDLE') {
        // Show post-disposition options when transitioning to IDLE after wrap-up
        this.showPostDisposition = true;
        this.requestingNext = false;
      } else {
        this.showPostDisposition = false;
      }
    });

    // Load selectable work states for post-disposition options
    this.sessionApi.getSelectableStates().pipe(takeUntil(this.destroy$)).subscribe({
      next: (states) => {
        this.selectableWorkStates = states.filter((s) => s.category === 'unavailable');
      },
    });
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
   * Request the next task (Get Next Task button)
   */
  onGetNextTask(): void {
    this.requestingNext = true;
    this.showPostDisposition = false;

    // Notify server that agent is ready for next task
    this.queueService.setReady();
  }

  /**
   * Switch to a work state (break, lunch, etc.) after disposition
   */
  onSelectWorkState(state: WorkStateConfig): void {
    const agentId = this.authService.currentAgent?.id;
    if (!agentId) return;

    this.showPostDisposition = false;

    this.sessionApi.changeState(agentId, {
      requestedState: state.id,
      reason: 'Agent selected post-disposition work state',
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.logger.info(LOG_CONTEXT, 'Changed to work state', { state: state.id });
        this.queueService.setOffline();
      },
      error: (err) => {
        this.logger.error(LOG_CONTEXT, 'Failed to change work state', err);
      },
    });
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

    // Prevent double-submission
    if (this.dispositionInProgress) {
      this.logger.warn(LOG_CONTEXT, 'Disposition already in progress, ignoring duplicate');
      return;
    }
    this.dispositionInProgress = true;

    const agentId = this.authService.currentAgent?.id || 'unknown';

    // Complete task via REST API with all required fields
    this.dispositionService
      .completeTaskWithDisposition({
        taskId: task.id,
        dispositionId: disposition.id,
        note: note,
        agentId,
        workType: task.workType,
        queue: task.queue,
        assignedAt: task.acceptedAt || task.reservedAt || task.createdAt,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.logger.info(LOG_CONTEXT, 'Task completed via REST API', {
            taskId: task.id,
            disposition: disposition.code,
          });
          // Update local state only (skip socket — REST API already notified backend)
          this.queueService.submitDisposition(
            {
              code: disposition.code,
              label: disposition.name,
              note: note,
            },
            true // skipSocketNotify
          );
          this.dispositionInProgress = false;
        },
        error: (error) => {
          this.logger.error(LOG_CONTEXT, 'REST disposition failed, using socket fallback', error);
          // Fall back to socket-based completion
          this.queueService.submitDisposition({
            code: disposition.code,
            label: disposition.name,
            note: note,
          });
          this.dispositionInProgress = false;
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
