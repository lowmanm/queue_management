import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AgentWorkState,
  WorkStateConfig,
  AgentSession,
  AgentSessionSummary,
  formatDuration,
} from '@nexus-queue/shared-models';
import { SessionApiService } from '../../../../core/services/session-api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Subject, takeUntil, interval, switchMap } from 'rxjs';

interface WorkStateButton {
  state: AgentWorkState;
  config: WorkStateConfig;
  selected: boolean;
  disabled: boolean;
}

@Component({
  selector: 'app-agent-controls',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './agent-controls.component.html',
  styleUrl: './agent-controls.component.scss',
})
export class AgentControlsComponent implements OnInit, OnDestroy {
  private sessionApi = inject(SessionApiService);
  private authService = inject(AuthService);
  private destroy$ = new Subject<void>();

  // State signals
  currentSession = signal<AgentSession | null>(null);
  sessionSummary = signal<AgentSessionSummary | null>(null);
  workStates = signal<WorkStateConfig[]>([]);
  selectableStates = signal<WorkStateConfig[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  showStateMenu = signal(false);
  timeInState = signal(0);

  // Computed properties
  currentState = computed(() => this.currentSession()?.currentState || 'LOGGED_OUT');
  currentStateConfig = computed(() => {
    const state = this.currentState();
    return this.workStates().find((s) => s.id === state) || null;
  });
  isLoggedIn = computed(() => this.currentSession()?.isActive ?? false);

  formattedTimeInState = computed(() => formatDuration(this.timeInState()));

  unavailableStates = computed(() =>
    this.selectableStates().filter((s) => s.category === 'unavailable')
  );

  stateButtons = computed<WorkStateButton[]>(() => {
    const current = this.currentState();
    return this.unavailableStates().map((config) => ({
      state: config.id,
      config,
      selected: current === config.id,
      disabled: this.loading() || !this.canTransitionTo(config.id),
    }));
  });

  ngOnInit(): void {
    this.loadWorkStates();
    this.loadCurrentSession();
    this.startTimeTracker();
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadWorkStates(): void {
    this.sessionApi.getAllWorkStates().pipe(takeUntil(this.destroy$)).subscribe({
      next: (states) => this.workStates.set(states),
      error: (err) => console.error('Failed to load work states:', err),
    });

    this.sessionApi.getSelectableStates().pipe(takeUntil(this.destroy$)).subscribe({
      next: (states) => this.selectableStates.set(states),
      error: (err) => console.error('Failed to load selectable states:', err),
    });
  }

  private loadCurrentSession(): void {
    const agentId = this.authService.currentAgent?.id;
    if (!agentId) return;

    this.sessionApi.getAgentSession(agentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (session) => {
        this.currentSession.set(session);
        this.loadSessionSummary(agentId);
      },
      error: (err) => console.error('Failed to load session:', err),
    });
  }

  private loadSessionSummary(agentId: string): void {
    this.sessionApi.getAgentSessionSummary(agentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (summary) => this.sessionSummary.set(summary),
      error: (err) => console.error('Failed to load summary:', err),
    });
  }

  private startTimeTracker(): void {
    // Update time in state every second
    interval(1000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      const session = this.currentSession();
      if (session?.lastStateChangeAt) {
        const elapsed = Math.floor(
          (Date.now() - new Date(session.lastStateChangeAt).getTime()) / 1000
        );
        this.timeInState.set(elapsed);
      }
    });
  }

  private startPolling(): void {
    // Refresh session data every 30 seconds
    interval(30000).pipe(
      takeUntil(this.destroy$),
      switchMap(() => {
        const agentId = this.authService.currentAgent?.id;
        if (!agentId) return [];
        return this.sessionApi.getAgentSession(agentId);
      })
    ).subscribe({
      next: (session) => {
        if (session) this.currentSession.set(session);
      },
    });
  }

  /**
   * Check if transition to target state is valid
   */
  private canTransitionTo(targetState: AgentWorkState): boolean {
    const current = this.currentState();
    // Allow return to READY from any unavailable state
    if (targetState === 'READY') return true;
    // Allow moving to unavailable states from READY or LOGGED_IN
    if (['READY', 'LOGGED_IN'].includes(current)) return true;
    return false;
  }

  /**
   * Login the agent
   */
  login(): void {
    const agent = this.authService.currentAgent;
    const user = this.authService.currentUser;
    if (!agent || !user) return;

    this.loading.set(true);
    this.error.set(null);

    this.sessionApi
      .login({
        agentId: agent.id,
        agentName: agent.name,
        teamId: user.teamId,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (session) => {
          this.currentSession.set(session);
          this.loading.set(false);
          this.loadSessionSummary(agent.id);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to login');
          this.loading.set(false);
        },
      });
  }

  /**
   * Logout the agent
   */
  logout(): void {
    const agentId = this.authService.currentAgent?.id;
    if (!agentId) return;

    this.loading.set(true);
    this.error.set(null);

    this.sessionApi.logout(agentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (session) => {
        this.currentSession.set(session);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to logout');
        this.loading.set(false);
      },
    });
  }

  /**
   * Set agent to ready state
   */
  setReady(): void {
    const agentId = this.authService.currentAgent?.id;
    if (!agentId) return;

    this.loading.set(true);
    this.error.set(null);
    this.showStateMenu.set(false);

    this.sessionApi.setReady(agentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (session) => {
        this.currentSession.set(session);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to set ready');
        this.loading.set(false);
      },
    });
  }

  /**
   * Change to a specific work state
   */
  changeState(state: AgentWorkState, reason?: string): void {
    const agentId = this.authService.currentAgent?.id;
    if (!agentId) return;

    this.loading.set(true);
    this.error.set(null);
    this.showStateMenu.set(false);

    this.sessionApi
      .changeState(agentId, {
        requestedState: state,
        reason,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (session) => {
          this.currentSession.set(session);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.message || 'Failed to change state');
          this.loading.set(false);
        },
      });
  }

  /**
   * Toggle the state selection menu
   */
  toggleStateMenu(): void {
    this.showStateMenu.update((v) => !v);
  }

  /**
   * Get icon symbol for a state (Unicode symbols, no icon font required)
   */
  getStateIcon(state: AgentWorkState): string {
    const icons: Record<AgentWorkState, string> = {
      LOGGED_OUT: '\u23FB',    // power symbol
      LOGGED_IN: '\u2713',     // check
      READY: '\u25CF',         // filled circle
      RESERVED: '\u23F1',      // stopwatch
      ACTIVE: '\u25B6',        // play
      WRAP_UP: '\u270E',       // pencil
      BREAK: '\u2615',         // hot beverage
      LUNCH: '\u{1F37D}',      // fork and knife with plate
      MEETING: '\u{1F465}',    // busts in silhouette
      TRAINING: '\u{1F393}',   // graduation cap
      COACHING: '\u{1F4AC}',   // speech balloon
      PROJECT: '\u{1F4C1}',    // file folder
      TECHNICAL_ISSUE: '\u26A0', // warning sign
      SUPERVISOR: '\u{1F464}', // bust in silhouette
    };
    return icons[state] || '\u2753';
  }
}
