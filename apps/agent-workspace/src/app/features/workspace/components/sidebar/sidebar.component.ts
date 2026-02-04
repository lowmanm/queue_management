import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { Task } from '@nexus-queue/shared-models';
import { QueueService } from '../../../../core/services/queue.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit {
  currentTask$!: Observable<Task | null>;

  constructor(private queueService: QueueService) {}

  ngOnInit(): void {
    this.currentTask$ = this.queueService.currentTask$;
  }
}
