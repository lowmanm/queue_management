import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { AgentState } from '@nexus-queue/shared-models';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { MainStageComponent } from './components/main-stage/main-stage.component';
import { ActionBarComponent } from './components/action-bar/action-bar.component';
import { LogViewerComponent } from './components/log-viewer/log-viewer.component';
import { QueueService } from '../../core/services/queue.service';
import { SocketService } from '../../core/services/socket.service';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    SidebarComponent,
    MainStageComponent,
    ActionBarComponent,
    LogViewerComponent,
  ],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss',
})
export class WorkspaceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  agentState: AgentState = 'OFFLINE';
  private previousState: AgentState = 'OFFLINE';
  isConnected = false;
  showLogViewer = false;
  /** True when agent just completed a task (in post-disposition flow) */
  isPostDisposition = false;

  constructor(
    private queueService: QueueService,
    private socketService: SocketService
  ) {}

  ngOnInit(): void {
    // Subscribe to agent state changes
    this.queueService.agentState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        // Track post-disposition state: if transitioning from WRAP_UP to IDLE
        if (state === 'IDLE' && this.previousState === 'WRAP_UP') {
          this.isPostDisposition = true;
        } else if (state !== 'IDLE') {
          this.isPostDisposition = false;
        }
        this.previousState = this.agentState;
        this.agentState = state;
      });

    // Subscribe to connection status
    this.socketService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe((status) => {
        this.isConnected = status.connected;
      });

    // When agent explicitly requests next task, clear post-disposition state
    this.queueService.agentReady$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isPostDisposition = false;
    });

    // Initialize queue service (connects to WebSocket)
    this.queueService.initialize();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.queueService.disconnect();
  }

  /**
   * Check if the workspace is in "waiting" state.
   * Shows the waiting overlay only when connected, IDLE, and NOT in post-disposition flow
   * (post-disposition IDLE shows the "Get Next Task" action bar instead).
   */
  get isWaitingForTask(): boolean {
    return this.isConnected && this.agentState === 'IDLE' && !this.isPostDisposition;
  }

  /**
   * Check if we're still connecting
   */
  get isConnecting(): boolean {
    return !this.isConnected && this.agentState === 'OFFLINE';
  }

  /**
   * Toggle the log viewer panel
   */
  toggleLogViewer(): void {
    this.showLogViewer = !this.showLogViewer;
  }

  /**
   * Close the log viewer panel
   */
  closeLogViewer(): void {
    this.showLogViewer = false;
  }
}
