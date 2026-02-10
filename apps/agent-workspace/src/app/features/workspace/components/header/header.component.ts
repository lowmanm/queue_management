import { Component, OnInit, OnDestroy, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { Observable, Subject, map, filter, takeUntil } from 'rxjs';
import { AgentState, UserRole, AgentSessionStats, formatDuration } from '@nexus-queue/shared-models';
import {
  AuthService,
  Agent,
  AuthenticatedUser,
} from '../../../../core/services/auth.service';
import { QueueService } from '../../../../core/services/queue.service';
import { AgentStatsService } from '../../../../core/services/agent-stats.service';
import { AgentControlsComponent } from '../agent-controls/agent-controls.component';

interface HeaderStats {
  tasksCompleted: number;
  avgHandleTime: string;
  loggedInTime: string;
  tasksPerHour: number;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, AgentControlsComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Output() toggleLogs = new EventEmitter<void>();

  private agentStatsService = inject(AgentStatsService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();


  agent$!: Observable<Agent | null>;
  user$!: Observable<AuthenticatedUser | null>;
  agentState$!: Observable<AgentState>;
  reservationCountdown$!: Observable<number>;
  headerStats$!: Observable<HeaderStats>;

  showRoleSwitcher = false;
  showMobileNav = false;
  currentUrl = '';
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

    // Track current URL for active states
    this.currentUrl = this.router.url;
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        this.currentUrl = event.urlAfterRedirects;
        this.closeMobileNav();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private formatSessionTime(stats: AgentSessionStats): string {
    const totalTime = stats.totalIdleTime + stats.totalActiveTime + stats.totalPausedTime;
    return formatDuration(totalTime);
  }

  /**
   * Check if manager section is active
   */
  get isManagerActive(): boolean {
    return this.currentUrl.startsWith('/manager');
  }

  /**
   * Check if designer section is active
   */
  get isDesignerActive(): boolean {
    return this.currentUrl.startsWith('/admin') && !this.currentUrl.includes('/admin/users');
  }

  /**
   * Check if admin section is active
   */
  get isAdminActive(): boolean {
    return this.currentUrl.includes('/admin/users');
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
   * Toggle mobile navigation drawer
   */
  toggleMobileNav(): void {
    this.showMobileNav = !this.showMobileNav;
  }

  /**
   * Close mobile navigation drawer
   */
  closeMobileNav(): void {
    this.showMobileNav = false;
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
