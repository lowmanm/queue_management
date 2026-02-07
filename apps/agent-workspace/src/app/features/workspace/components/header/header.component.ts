import { Component, OnInit, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Observable, map } from 'rxjs';
import { AgentState, UserRole, AgentSessionStats, formatDuration } from '@nexus-queue/shared-models';
import {
  AuthService,
  Agent,
  AuthenticatedUser,
} from '../../../../core/services/auth.service';
import { QueueService } from '../../../../core/services/queue.service';
import { AgentStatsService } from '../../../../core/services/agent-stats.service';

interface HeaderStats {
  tasksCompleted: number;
  avgHandleTime: string;
  loggedInTime: string;
  tasksPerHour: number;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit {
  @Output() toggleLogs = new EventEmitter<void>();

  private agentStatsService = inject(AgentStatsService);

  agent$!: Observable<Agent | null>;
  user$!: Observable<AuthenticatedUser | null>;
  agentState$!: Observable<AgentState>;
  reservationCountdown$!: Observable<number>;
  headerStats$!: Observable<HeaderStats>;

  showRoleSwitcher = false;
  roles: UserRole[] = ['AGENT', 'MANAGER', 'DESIGNER', 'ADMIN'];

  constructor(
    private authService: AuthService,
    private queueService: QueueService
  ) {}

  ngOnInit(): void {
    this.agent$ = this.authService.currentAgent$;
    this.user$ = this.authService.currentUser$;
    this.agentState$ = this.queueService.agentState$;
    this.reservationCountdown$ = this.queueService.reservationCountdown$;

    // Real-time stats from AgentStatsService
    this.headerStats$ = this.agentStatsService.stats$.pipe(
      map((stats) => ({
        tasksCompleted: stats.tasksCompleted,
        avgHandleTime: formatDuration(stats.averageHandleTime),
        loggedInTime: this.formatSessionTime(stats),
        tasksPerHour: stats.tasksPerHour,
      }))
    );
  }

  private formatSessionTime(stats: AgentSessionStats): string {
    const totalTime = stats.totalIdleTime + stats.totalActiveTime + stats.totalPausedTime;
    return formatDuration(totalTime);
  }

  /**
   * Check if user can access manager features
   */
  get canAccessManager(): boolean {
    return this.authService.hasAnyRole(['MANAGER', 'ADMIN']);
  }

  /**
   * Check if user can access designer features
   */
  get canAccessDesigner(): boolean {
    return this.authService.hasAnyRole(['DESIGNER', 'ADMIN']);
  }

  /**
   * Check if user can access admin features
   */
  get canAccessAdmin(): boolean {
    return this.authService.hasRole('ADMIN');
  }

  /**
   * Get current role display label
   */
  get currentRoleLabel(): string {
    const role = this.authService.currentRole;
    const labels: Record<UserRole, string> = {
      AGENT: 'Agent',
      MANAGER: 'Manager',
      DESIGNER: 'Designer',
      ADMIN: 'Admin',
    };
    return role ? labels[role] : 'Unknown';
  }

  /**
   * Switch to a different role (for demo/development)
   */
  switchRole(role: UserRole): void {
    this.authService.switchRole(role);
    this.showRoleSwitcher = false;
  }

  /**
   * Toggle the role switcher dropdown
   */
  toggleRoleSwitcher(): void {
    this.showRoleSwitcher = !this.showRoleSwitcher;
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

  /**
   * Open the debug logs viewer
   */
  onToggleLogs(): void {
    this.toggleLogs.emit();
  }
}
