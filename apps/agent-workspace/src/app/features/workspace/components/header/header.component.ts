import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { AuthService, Agent } from '../../../../core/services/auth.service';
import { QueueService, AgentStatus } from '../../../../core/services/queue.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit {
  agent$!: Observable<Agent | null>;
  status$!: Observable<AgentStatus>;

  constructor(
    private authService: AuthService,
    private queueService: QueueService
  ) {}

  ngOnInit(): void {
    this.agent$ = this.authService.currentAgent$;
    this.status$ = this.queueService.agentStatus$;
  }

  toggleStatus(): void {
    this.queueService.toggleStatus();
  }
}
