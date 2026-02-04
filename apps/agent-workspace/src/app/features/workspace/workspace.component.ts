import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { AgentState } from '@nexus-queue/shared-models';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { MainStageComponent } from './components/main-stage/main-stage.component';
import { ActionBarComponent } from './components/action-bar/action-bar.component';
import { QueueService } from '../../core/services/queue.service';

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
  agentState: AgentState = 'IDLE';

  constructor(private queueService: QueueService) {}

  ngOnInit(): void {
    // Subscribe to agent state changes
    this.queueService.agentState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.agentState = state;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Request the next task from the queue.
   * Only available when agent is in IDLE state.
   */
  onGetNextTask(): void {
    if (this.agentState !== 'IDLE') {
      console.warn('Cannot get next task: Agent is not IDLE');
      return;
    }

    this.queueService.getNextTask().subscribe({
      next: (task) => {
        console.log('Task received:', task.id);
      },
      error: (err) => {
        console.error('Failed to fetch next task:', err);
      },
    });
  }

  /**
   * Check if the "Get Next Task" button should be shown
   */
  get showGetNextButton(): boolean {
    return this.agentState === 'IDLE';
  }
}
