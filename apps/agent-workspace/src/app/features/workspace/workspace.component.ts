import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil, filter } from 'rxjs';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { MainStageComponent } from './components/main-stage/main-stage.component';
import { QueueService, AgentStatus } from '../../core/services/queue.service';

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, HeaderComponent, SidebarComponent, MainStageComponent],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss',
})
export class WorkspaceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(private queueService: QueueService) {}

  ngOnInit(): void {
    // Subscribe to agent status changes
    // When agent becomes "Available", automatically fetch the next task
    this.queueService.agentStatus$
      .pipe(
        takeUntil(this.destroy$),
        filter((status: AgentStatus) => status === 'Available')
      )
      .subscribe(() => {
        this.fetchNextTask();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private fetchNextTask(): void {
    // Only fetch if no current task
    if (!this.queueService.currentTask) {
      this.queueService.getNextTask().subscribe({
        error: (err) => {
          console.error('Failed to fetch next task:', err);
        },
      });
    }
  }
}
