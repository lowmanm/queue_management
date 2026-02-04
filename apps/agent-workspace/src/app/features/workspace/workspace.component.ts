import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { AgentState } from '@nexus-queue/shared-models';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { MainStageComponent } from './components/main-stage/main-stage.component';
import { ActionBarComponent } from './components/action-bar/action-bar.component';
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
  ],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss',
})
export class WorkspaceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  agentState: AgentState = 'OFFLINE';
  isConnected = false;

  constructor(
    private queueService: QueueService,
    private socketService: SocketService
  ) {}

  ngOnInit(): void {
    // Subscribe to agent state changes
    this.queueService.agentState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.agentState = state;
      });

    // Subscribe to connection status
    this.socketService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe((status) => {
        this.isConnected = status.connected;
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
   * Check if the workspace is in "waiting" state
   * (connected but waiting for task in Force Mode)
   */
  get isWaitingForTask(): boolean {
    return this.isConnected && this.agentState === 'IDLE';
  }

  /**
   * Check if we're still connecting
   */
  get isConnecting(): boolean {
    return !this.isConnected && this.agentState === 'OFFLINE';
  }
}
