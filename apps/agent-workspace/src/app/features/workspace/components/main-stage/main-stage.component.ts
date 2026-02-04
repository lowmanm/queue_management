import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable, map } from 'rxjs';
import { Task } from '@nexus-queue/shared-models';
import { QueueService } from '../../../../core/services/queue.service';

@Component({
  selector: 'app-main-stage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './main-stage.component.html',
  styleUrl: './main-stage.component.scss',
})
export class MainStageComponent implements OnInit {
  currentTask$!: Observable<Task | null>;
  safePayloadUrl$!: Observable<SafeResourceUrl | null>;

  constructor(
    private queueService: QueueService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.currentTask$ = this.queueService.currentTask$;

    this.safePayloadUrl$ = this.currentTask$.pipe(
      map((task) => {
        if (task?.payloadUrl) {
          return this.sanitizer.bypassSecurityTrustResourceUrl(task.payloadUrl);
        }
        return null;
      })
    );
  }
}
