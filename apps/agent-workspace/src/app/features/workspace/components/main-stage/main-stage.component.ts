import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  NgZone,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable, map, Subject, takeUntil } from 'rxjs';
import { Task } from '@nexus-queue/shared-models';
import { QueueService, LoggerService } from '../../../../core/services';

const LOG_CONTEXT = 'MainStage';

/**
 * Message types that can be received from the iFrame source application.
 * Source apps should postMessage with { type: string, payload?: any }
 */
export interface IFrameMessage {
  /** Message type identifier */
  type: 'TASK_COMPLETE' | 'TASK_SAVED' | 'NAVIGATION' | 'ERROR' | 'READY' | 'CUSTOM';
  /** Optional payload data */
  payload?: Record<string, unknown>;
  /** Task ID this message relates to (for validation) */
  taskId?: string;
}

@Component({
  selector: 'app-main-stage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './main-stage.component.html',
  styleUrl: './main-stage.component.scss',
})
export class MainStageComponent implements OnInit, OnDestroy {
  @ViewChild('taskIframe') iframeRef?: ElementRef<HTMLIFrameElement>;

  currentTask$!: Observable<Task | null>;
  safePayloadUrl$!: Observable<SafeResourceUrl | null>;
  iframeLoaded = false;

  private logger = inject(LoggerService);
  private destroy$ = new Subject<void>();
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor(
    private queueService: QueueService,
    private sanitizer: DomSanitizer,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.currentTask$ = this.queueService.currentTask$;

    this.safePayloadUrl$ = this.currentTask$.pipe(
      map((task) => {
        if (task?.payloadUrl) {
          this.iframeLoaded = false;
          return this.sanitizer.bypassSecurityTrustResourceUrl(task.payloadUrl);
        }
        return null;
      })
    );

    // Subscribe to task changes to manage iframe communication
    this.currentTask$.pipe(takeUntil(this.destroy$)).subscribe((task) => {
      if (task) {
        this.setupMessageListener(task);
      } else {
        this.removeMessageListener();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.removeMessageListener();
  }

  /**
   * Handle iframe load event
   */
  onIframeLoad(): void {
    this.iframeLoaded = true;
    this.logger.info(LOG_CONTEXT, 'iFrame loaded successfully');
  }

  /**
   * Handle iframe error event
   */
  onIframeError(): void {
    this.logger.error(LOG_CONTEXT, 'iFrame failed to load');
    this.iframeLoaded = false;
  }

  /**
   * Set up the postMessage listener for iFrame communication
   */
  private setupMessageListener(task: Task): void {
    this.removeMessageListener();

    this.messageHandler = (event: MessageEvent) => {
      // Validate message origin if needed
      // In production, validate against allowed origins
      // if (!this.isAllowedOrigin(event.origin)) return;

      this.ngZone.run(() => {
        this.handleIframeMessage(event.data, task);
      });
    };

    window.addEventListener('message', this.messageHandler);
    this.logger.debug(LOG_CONTEXT, 'postMessage listener registered', { taskId: task.id });
  }

  /**
   * Remove the postMessage listener
   */
  private removeMessageListener(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
  }

  /**
   * Process messages received from the iFrame
   */
  private handleIframeMessage(data: unknown, currentTask: Task): void {
    // Validate message structure
    if (!this.isValidMessage(data)) {
      return;
    }

    const message = data as IFrameMessage;

    // Optionally validate task ID matches
    if (message.taskId && message.taskId !== currentTask.id) {
      this.logger.warn(LOG_CONTEXT, 'Received message for different task', { expectedTaskId: currentTask.id, receivedTaskId: message.taskId });
      return;
    }

    this.logger.debug(LOG_CONTEXT, 'Received iFrame message', { type: message.type, payload: message.payload });

    switch (message.type) {
      case 'TASK_COMPLETE':
        this.handleTaskComplete(message.payload);
        break;

      case 'TASK_SAVED':
        this.handleTaskSaved(message.payload);
        break;

      case 'NAVIGATION':
        this.handleNavigation(message.payload);
        break;

      case 'ERROR':
        this.handleError(message.payload);
        break;

      case 'READY':
        this.handleIframeReady(message.payload);
        break;

      case 'CUSTOM':
        this.handleCustomMessage(message.payload);
        break;

      default:
        this.logger.debug(LOG_CONTEXT, 'Unknown message type received');
    }
  }

  /**
   * Validate that the message has the expected structure
   */
  private isValidMessage(data: unknown): data is IFrameMessage {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const msg = data as Record<string, unknown>;
    return (
      typeof msg['type'] === 'string' &&
      ['TASK_COMPLETE', 'TASK_SAVED', 'NAVIGATION', 'ERROR', 'READY', 'CUSTOM'].includes(
        msg['type'] as string
      )
    );
  }

  /**
   * Handle TASK_COMPLETE message - auto-complete the task
   */
  private handleTaskComplete(payload?: Record<string, unknown>): void {
    this.logger.info(LOG_CONTEXT, 'Source app signaled task completion', payload);

    // Only auto-complete if agent is in ACTIVE state
    if (this.queueService.agentState === 'ACTIVE') {
      this.queueService.completeTask();
    }
  }

  /**
   * Handle TASK_SAVED message - work was saved but not complete
   */
  private handleTaskSaved(payload?: Record<string, unknown>): void {
    this.logger.info(LOG_CONTEXT, 'Source app saved work', payload);
    // Could show a toast notification or update UI
  }

  /**
   * Handle NAVIGATION message - source app navigated internally
   */
  private handleNavigation(payload?: Record<string, unknown>): void {
    this.logger.debug(LOG_CONTEXT, 'Source app navigation', payload);
    // Could track for analytics or handle specific navigation events
  }

  /**
   * Handle ERROR message from source app
   */
  private handleError(payload?: Record<string, unknown>): void {
    this.logger.error(LOG_CONTEXT, 'Source app error', payload);
    // Could show error notification to agent
  }

  /**
   * Handle READY message - source app finished initializing
   */
  private handleIframeReady(payload?: Record<string, unknown>): void {
    this.logger.info(LOG_CONTEXT, 'Source app is ready', payload);
    // Could send initial data to the iframe
    this.sendMessageToIframe({ type: 'NEXUS_CONNECTED', taskId: this.queueService.currentTask?.id });
  }

  /**
   * Handle CUSTOM messages for extensibility
   */
  private handleCustomMessage(payload?: Record<string, unknown>): void {
    this.logger.debug(LOG_CONTEXT, 'Custom message received', payload);
    // Handle based on payload content
  }

  /**
   * Send a message to the iFrame
   */
  sendMessageToIframe(message: Record<string, unknown>): void {
    if (this.iframeRef?.nativeElement?.contentWindow) {
      // In production, specify target origin instead of '*'
      this.iframeRef.nativeElement.contentWindow.postMessage(message, '*');
    }
  }
}
