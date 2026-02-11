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
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable, Subject, takeUntil } from 'rxjs';
import { Task, AgentState } from '@nexus-queue/shared-models';
import { QueueService, LoggerService, AuthService } from '../../../../core/services';
import { environment } from '../../../../../environments/environment';

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

/** Display mode for the current task's external URL */
type DisplayMode = 'iframe' | 'popup';

/** Result of the server-side embeddability check */
interface EmbeddableCheckResult {
  url: string;
  origin: string;
  embeddable: boolean;
  reason: string;
  cached: boolean;
  recommendedMode: string;
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

  /** The current safe iframe URL — only changes when the origin differs */
  safePayloadUrl: SafeResourceUrl | null = null;
  /** Whether any task has a payload URL (controls visibility) */
  hasPayloadUrl = false;
  iframeLoaded = false;
  /** Whether the iframe app has signaled READY (session is initialized) */
  iframeReady = false;
  /** Whether the iframe was blocked by CSP (detected via timeout or security event) */
  iframeBlocked = false;
  /** Reason the iframe was blocked */
  iframeBlockedReason = '';

  /** Current display mode for the task: iframe (embedded) or popup (new window) */
  activeDisplayMode: DisplayMode = 'iframe';
  /** Whether the embeddability check is still in progress */
  checkingEmbeddability = false;

  /** Reference to the managed popup window (for screen pop mode) */
  private popupWindow: Window | null = null;
  /** URL currently open in the popup window */
  popupUrl = '';

  private http = inject(HttpClient);
  private logger = inject(LoggerService);
  private authService = inject(AuthService);
  private destroy$ = new Subject<void>();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private securityHandler: ((event: SecurityPolicyViolationEvent) => void) | null = null;

  /** Track the current iframe origin to detect same-origin task transitions */
  private currentIframeOrigin = '';
  /** Cache embeddability check results per origin */
  private embeddableCache = new Map<string, boolean>();
  /** Timeout for iframe load detection */
  private iframeLoadTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Interval for polling popup.closed status */
  private popupPollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private queueService: QueueService,
    private sanitizer: DomSanitizer,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.currentTask$ = this.queueService.currentTask$;

    // Listen for CSP violation events (catches frame-ancestors blocks)
    this.securityHandler = (event: SecurityPolicyViolationEvent) => {
      if (event.violatedDirective?.includes('frame-ancestors')) {
        this.ngZone.run(() => {
          this.handleIframeBlocked(`CSP ${event.violatedDirective}: ${event.blockedURI}`);
        });
      }
    };
    document.addEventListener('securitypolicyviolation', this.securityHandler);

    // Subscribe to task changes — manage display lifecycle
    this.currentTask$.pipe(takeUntil(this.destroy$)).subscribe((task) => {
      if (task?.payloadUrl) {
        this.hasPayloadUrl = true;
        this.handleTaskPayload(task);
        this.setupMessageListener(task);
      } else {
        this.hasPayloadUrl = false;
        this.removeMessageListener();
      }
    });

    // Close popup when agent transitions to IDLE (disposition complete)
    this.queueService.agentState$.pipe(takeUntil(this.destroy$)).subscribe((state: AgentState) => {
      if (state === 'IDLE' || state === 'OFFLINE') {
        this.closePopupWindow();
      }
    });
  }

  /**
   * Determine how to display the task's external URL.
   * Checks displayMode on the task, embeddability cache, or runs a server-side check.
   */
  private handleTaskPayload(task: Task): void {
    const newOrigin = this.extractOrigin(task.payloadUrl!);
    const originChanged = newOrigin !== this.currentIframeOrigin;

    // If task specifies a display mode, use it directly
    if (task.displayMode === 'popup') {
      this.openInPopup(task);
      return;
    }
    if (task.displayMode === 'iframe') {
      this.openInIframe(task, originChanged);
      return;
    }

    // Auto mode: check if we already know this origin's embeddability
    const cached = this.embeddableCache.get(newOrigin);
    if (cached === false) {
      // Known non-embeddable: open as popup
      this.openInPopup(task);
      return;
    }
    if (cached === true) {
      // Known embeddable: use iframe
      this.openInIframe(task, originChanged);
      return;
    }

    // Unknown: run server-side check, default to iframe while checking
    this.checkingEmbeddability = true;
    this.openInIframe(task, originChanged);
    this.checkEmbeddability(task.payloadUrl!, newOrigin);
  }

  /**
   * Open the task URL in an iframe (embedded mode).
   */
  private openInIframe(task: Task, originChanged: boolean): void {
    this.activeDisplayMode = 'iframe';
    this.iframeBlocked = false;
    this.iframeBlockedReason = '';
    this.closePopupWindow();

    const newOrigin = this.extractOrigin(task.payloadUrl!);

    if (originChanged || !this.safePayloadUrl) {
      this.logger.info(LOG_CONTEXT, 'Loading iframe URL', {
        taskId: task.id,
        origin: newOrigin,
        previousOrigin: this.currentIframeOrigin || '(none)',
      });
      this.iframeLoaded = false;
      this.iframeReady = false;
      this.currentIframeOrigin = newOrigin;
      this.safePayloadUrl = this.sanitizer.bypassSecurityTrustResourceUrl(task.payloadUrl!);

      // Start a timeout to detect if the iframe silently failed
      this.startIframeLoadTimeout(task);
    } else {
      // Same origin: keep iframe alive, send task context via postMessage
      this.logger.info(LOG_CONTEXT, 'Same origin — sending task context via postMessage', {
        taskId: task.id,
        origin: newOrigin,
      });
      this.sendTaskContext(task);
    }
  }

  /**
   * Open the task URL in a managed popup window (screen pop mode).
   * This is used when the external site blocks iframe embedding.
   */
  private openInPopup(task: Task): void {
    this.activeDisplayMode = 'popup';
    this.safePayloadUrl = null;
    this.iframeLoaded = false;
    this.currentIframeOrigin = '';

    const url = task.payloadUrl!;
    this.popupUrl = url;

    // Reuse existing popup if still open
    if (this.popupWindow && !this.popupWindow.closed) {
      this.popupWindow.location.href = url;
      this.popupWindow.focus();
      this.logger.info(LOG_CONTEXT, 'Navigated existing popup to new task', { taskId: task.id });
    } else {
      // Open a new popup window with reasonable dimensions
      const width = Math.min(1200, window.screen.availWidth - 100);
      const height = Math.min(900, window.screen.availHeight - 100);
      const left = window.screen.availWidth - width - 50;
      const top = 50;

      this.popupWindow = window.open(
        url,
        'nexus-task-window',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=yes,menubar=no,location=yes`
      );
      this.logger.info(LOG_CONTEXT, 'Opened popup window for task', { taskId: task.id, url });
    }

    // Poll for popup closure
    this.startPopupPolling();
  }

  /**
   * Manually open/re-open the popup window (called from template)
   */
  openPopup(): void {
    const task = this.queueService.currentTask;
    if (task?.payloadUrl) {
      this.openInPopup(task);
    }
  }

  /**
   * Switch from blocked iframe to popup mode (called from template)
   */
  switchToPopup(): void {
    const task = this.queueService.currentTask;
    if (task?.payloadUrl) {
      const origin = this.extractOrigin(task.payloadUrl);
      this.embeddableCache.set(origin, false);
      this.openInPopup(task);
    }
  }

  /**
   * Close the popup window and stop polling.
   * Called when agent finishes disposition or goes offline.
   */
  private closePopupWindow(): void {
    this.stopPopupPolling();
    if (this.popupWindow && !this.popupWindow.closed) {
      this.logger.info(LOG_CONTEXT, 'Closing popup window (disposition complete)');
      this.popupWindow.close();
      this.popupWindow = null;
    }
  }

  /**
   * Start polling for popup closure (detect if user manually closed the window)
   */
  private startPopupPolling(): void {
    this.stopPopupPolling();
    this.popupPollInterval = setInterval(() => {
      if (this.popupWindow && this.popupWindow.closed) {
        this.ngZone.run(() => {
          this.logger.info(LOG_CONTEXT, 'Popup window was closed by user');
          this.popupWindow = null;
          this.stopPopupPolling();
        });
      }
    }, 2000);
  }

  /**
   * Stop polling for popup closure
   */
  private stopPopupPolling(): void {
    if (this.popupPollInterval) {
      clearInterval(this.popupPollInterval);
      this.popupPollInterval = null;
    }
  }

  /**
   * Run server-side embeddability check and update accordingly.
   */
  private checkEmbeddability(url: string, origin: string): void {
    this.http.get<EmbeddableCheckResult>(
      `${environment.apiUrl}/proxy/check-embeddable`,
      { params: { url } }
    ).subscribe({
      next: (result) => {
        this.checkingEmbeddability = false;
        this.embeddableCache.set(origin, result.embeddable);

        if (!result.embeddable) {
          this.logger.warn(LOG_CONTEXT, 'URL not embeddable, switching to popup', {
            origin,
            reason: result.reason,
          });
          this.handleIframeBlocked(result.reason);
        } else {
          this.logger.info(LOG_CONTEXT, 'URL confirmed embeddable', { origin });
        }
      },
      error: () => {
        this.checkingEmbeddability = false;
        this.logger.warn(LOG_CONTEXT, 'Embeddability check failed, keeping iframe mode');
      },
    });
  }

  /**
   * Handle iframe being blocked (CSP, timeout, or server-side check)
   */
  private handleIframeBlocked(reason: string): void {
    this.iframeBlocked = true;
    this.iframeBlockedReason = reason;
    this.iframeLoaded = false;
    this.clearIframeLoadTimeout();
    this.logger.warn(LOG_CONTEXT, 'iFrame blocked', { reason });
  }

  /**
   * Start a timeout to detect silent iframe load failures.
   * If the iframe doesn't fire onload within 8 seconds, assume it's blocked.
   */
  private startIframeLoadTimeout(task: Task): void {
    this.clearIframeLoadTimeout();
    this.iframeLoadTimeout = setTimeout(() => {
      if (!this.iframeLoaded && this.activeDisplayMode === 'iframe') {
        this.logger.warn(LOG_CONTEXT, 'iFrame load timeout — may be blocked', {
          taskId: task.id,
        });
        // Don't auto-switch — just show the blocked message with option to switch
        if (!this.iframeBlocked) {
          this.handleIframeBlocked('Page did not load within the expected time. The site may block iframe embedding.');
        }
      }
    }, 8000);
  }

  private clearIframeLoadTimeout(): void {
    if (this.iframeLoadTimeout) {
      clearTimeout(this.iframeLoadTimeout);
      this.iframeLoadTimeout = null;
    }
  }

  /**
   * Extract the origin (protocol + host) from a URL.
   * Returns empty string for invalid URLs.
   */
  private extractOrigin(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.origin;
    } catch {
      return '';
    }
  }

  /**
   * Send task context to the iframe via postMessage.
   * Used when the origin hasn't changed to preserve session state.
   */
  private sendTaskContext(task: Task): void {
    const user = this.authService.currentUser;
    this.sendMessageToIframe({
      type: 'NEXUS_TASK_UPDATE',
      taskId: task.id,
      payloadUrl: task.payloadUrl,
      workType: task.workType,
      priority: task.priority,
      metadata: task.metadata || {},
      agent: user ? {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
      } : undefined,
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.removeMessageListener();
    this.clearIframeLoadTimeout();
    this.stopPopupPolling();

    if (this.securityHandler) {
      document.removeEventListener('securitypolicyviolation', this.securityHandler);
      this.securityHandler = null;
    }

    // Close popup window on workspace exit
    if (this.popupWindow && !this.popupWindow.closed) {
      this.popupWindow.close();
    }
  }

  /**
   * Handle iframe load event — clears the load timeout
   */
  onIframeLoad(): void {
    this.iframeLoaded = true;
    this.clearIframeLoadTimeout();
    this.logger.info(LOG_CONTEXT, 'iFrame loaded successfully');
  }

  /**
   * Handle iframe error event
   */
  onIframeError(): void {
    this.logger.error(LOG_CONTEXT, 'iFrame failed to load');
    this.iframeLoaded = false;
    this.handleIframeBlocked('iFrame failed to load (network error or security restriction)');
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
  }

  /**
   * Handle NAVIGATION message - source app navigated internally
   */
  private handleNavigation(payload?: Record<string, unknown>): void {
    this.logger.debug(LOG_CONTEXT, 'Source app navigation', payload);
  }

  /**
   * Handle ERROR message from source app
   */
  private handleError(payload?: Record<string, unknown>): void {
    this.logger.error(LOG_CONTEXT, 'Source app error', payload);
  }

  /**
   * Handle READY message - source app finished initializing.
   * Send full session context so the iframe app can authenticate/initialize.
   */
  private handleIframeReady(payload?: Record<string, unknown>): void {
    this.logger.info(LOG_CONTEXT, 'Source app is ready', payload);
    this.iframeReady = true;

    const task = this.queueService.currentTask;
    const user = this.authService.currentUser;

    this.sendMessageToIframe({
      type: 'NEXUS_CONNECTED',
      taskId: task?.id,
      payloadUrl: task?.payloadUrl,
      workType: task?.workType,
      priority: task?.priority,
      metadata: task?.metadata || {},
      agent: user ? {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
      } : undefined,
    });
  }

  /**
   * Handle CUSTOM messages for extensibility
   */
  private handleCustomMessage(payload?: Record<string, unknown>): void {
    this.logger.debug(LOG_CONTEXT, 'Custom message received', payload);
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
