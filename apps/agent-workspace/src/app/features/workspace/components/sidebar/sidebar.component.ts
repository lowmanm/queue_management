import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { Task } from '@nexus-queue/shared-models';
import { QueueService } from '../../../../core/services/queue.service';
import { AgentStatsComponent } from '../agent-stats/agent-stats.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, AgentStatsComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit {
  currentTask$!: Observable<Task | null>;

  constructor(private queueService: QueueService) {}

  ngOnInit(): void {
    this.currentTask$ = this.queueService.currentTask$;
  }

  /**
   * Check if metadata object has any entries
   */
  hasMetadata(metadata: Record<string, string> | undefined): boolean {
    return !!metadata && Object.keys(metadata).length > 0;
  }

  /**
   * Convert metadata object to array for iteration
   */
  getMetadataEntries(
    metadata: Record<string, string>
  ): { key: string; value: string }[] {
    return Object.entries(metadata).map(([key, value]) => ({ key, value }));
  }

  /**
   * Open task URL in a new browser tab
   */
  openTaskUrl(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
