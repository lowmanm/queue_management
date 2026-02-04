import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { AgentState } from '@nexus-queue/shared-models';
import { AuthService, Agent } from '../../../../core/services/auth.service';
import { QueueService } from '../../../../core/services/queue.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit {
  agent$!: Observable<Agent | null>;
  agentState$!: Observable<AgentState>;
  reservationCountdown$!: Observable<number>;

  constructor(
    private authService: AuthService,
    private queueService: QueueService
  ) {}

  ngOnInit(): void {
    this.agent$ = this.authService.currentAgent$;
    this.agentState$ = this.queueService.agentState$;
    this.reservationCountdown$ = this.queueService.reservationCountdown$;
  }

  get metrics() {
    return this.queueService.metrics;
  }

  /**
   * Returns a display-friendly label for the agent state
   */
  getStateLabel(state: AgentState): string {
    const labels: Record<AgentState, string> = {
      IDLE: 'Ready',
      RESERVED: 'Task Pending',
      ACTIVE: 'Working',
      WRAP_UP: 'Wrap-Up',
      OFFLINE: 'Offline',
    };
    return labels[state] || state;
  }

  /**
   * Returns CSS class for state badge styling
   */
  getStateClass(state: AgentState): string {
    return `state-${state.toLowerCase()}`;
  }
}
