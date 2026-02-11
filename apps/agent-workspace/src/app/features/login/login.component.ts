import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { User, Team, UserRole, DEFAULT_ROLES } from '@nexus-queue/shared-models';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface PersonaGroup {
  role: UserRole;
  label: string;
  description: string;
  color: string;
  users: User[];
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private router = inject(Router);

  users: User[] = [];
  teams: Team[] = [];
  personaGroups: PersonaGroup[] = [];
  loading = true;
  error = '';
  selectedUser: User | null = null;
  searchQuery = '';

  /** Role metadata for display */
  private readonly roleConfig: Record<UserRole, { label: string; description: string; color: string }> = {
    AGENT: {
      label: 'Agents',
      description: 'Work tasks from assigned queues',
      color: '#16a34a',
    },
    MANAGER: {
      label: 'Managers',
      description: 'Supervise teams and monitor queues',
      color: '#2563eb',
    },
    DESIGNER: {
      label: 'Designers',
      description: 'Configure workflows, rules, and pipelines',
      color: '#7c3aed',
    },
    ADMIN: {
      label: 'Administrators',
      description: 'Full system access and user management',
      color: '#dc2626',
    },
  };

  ngOnInit(): void {
    // If already authenticated, redirect to appropriate landing
    if (this.authService.isAuthenticated) {
      this.router.navigate([this.authService.getDefaultRoute()]);
      return;
    }

    this.loadPersonas();
  }

  /**
   * Fetch users and teams from the backend API
   */
  private loadPersonas(): void {
    this.loading = true;
    this.error = '';

    // Fetch users and teams in parallel
    this.http.get<User[]>(`${environment.apiUrl}/rbac/users`).subscribe({
      next: (users) => {
        this.users = users.filter((u) => u.active);
        this.buildPersonaGroups();
        this.loadTeams();
      },
      error: () => {
        // Fallback to hardcoded defaults if API unavailable
        this.users = this.getDefaultUsers();
        this.buildPersonaGroups();
        this.loading = false;
      },
    });
  }

  private loadTeams(): void {
    this.http.get<Team[]>(`${environment.apiUrl}/rbac/teams`).subscribe({
      next: (teams) => {
        this.teams = teams;
        this.loading = false;
      },
      error: () => {
        this.teams = [];
        this.loading = false;
      },
    });
  }

  /**
   * Build persona groups organized by role
   */
  private buildPersonaGroups(): void {
    const roleOrder: UserRole[] = ['AGENT', 'MANAGER', 'DESIGNER', 'ADMIN'];

    this.personaGroups = roleOrder
      .map((role) => ({
        role,
        label: this.roleConfig[role].label,
        description: this.roleConfig[role].description,
        color: this.roleConfig[role].color,
        users: this.users.filter((u) => u.role === role),
      }))
      .filter((group) => group.users.length > 0);
  }

  /**
   * Get team name by ID
   */
  getTeamName(teamId?: string): string {
    if (!teamId) return 'No team';
    const team = this.teams.find((t) => t.id === teamId);
    return team?.name || teamId;
  }

  /**
   * Get skills display string
   */
  getSkillsDisplay(skills?: string[]): string {
    if (!skills || skills.length === 0) return 'No skills assigned';
    return skills.join(', ');
  }

  /**
   * Get the permission count for a role
   */
  getPermissionCount(role: UserRole): number {
    const roleConfig = DEFAULT_ROLES.find((r) => r.id === role);
    return roleConfig?.permissions.length || 0;
  }

  /**
   * Filter users by search query
   */
  get filteredGroups(): PersonaGroup[] {
    if (!this.searchQuery.trim()) return this.personaGroups;

    const query = this.searchQuery.toLowerCase();
    return this.personaGroups
      .map((group) => ({
        ...group,
        users: group.users.filter(
          (u) =>
            u.displayName.toLowerCase().includes(query) ||
            u.username.toLowerCase().includes(query) ||
            u.skills?.some((s) => s.toLowerCase().includes(query)) ||
            this.getTeamName(u.teamId).toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.users.length > 0);
  }

  /**
   * Select a user persona
   */
  selectUser(user: User): void {
    this.selectedUser = user;
  }

  /**
   * Login as the selected user and route to their landing page
   */
  loginAsSelected(): void {
    if (!this.selectedUser) return;

    this.authService.loginWithUser(this.selectedUser);
    const route = this.authService.getDefaultRoute();
    this.router.navigate([route]);
  }

  /**
   * Quick-login directly without selection preview
   */
  quickLogin(user: User): void {
    this.authService.loginWithUser(user);
    const route = this.authService.getDefaultRoute();
    this.router.navigate([route]);
  }

  /**
   * Fallback default users when API is unavailable
   */
  private getDefaultUsers(): User[] {
    const now = new Date().toISOString();
    return [
      {
        id: 'user-admin',
        username: 'admin',
        displayName: 'System Administrator',
        email: 'admin@nexusqueue.com',
        role: 'ADMIN',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'user-designer',
        username: 'designer',
        displayName: 'Queue Designer',
        email: 'designer@nexusqueue.com',
        role: 'DESIGNER',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'user-manager',
        username: 'manager',
        displayName: 'Team Manager',
        email: 'manager@nexusqueue.com',
        role: 'MANAGER',
        teamId: 'team-orders',
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'user-agent1',
        username: 'agent1',
        displayName: 'Agent One',
        email: 'agent1@nexusqueue.com',
        role: 'AGENT',
        teamId: 'team-orders',
        skills: ['orders', 'general'],
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'user-agent2',
        username: 'agent2',
        displayName: 'Agent Two',
        email: 'agent2@nexusqueue.com',
        role: 'AGENT',
        teamId: 'team-returns',
        skills: ['returns', 'refunds'],
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'user-agent3',
        username: 'agent3',
        displayName: 'Agent Three',
        email: 'agent3@nexusqueue.com',
        role: 'AGENT',
        teamId: 'team-claims',
        skills: ['claims', 'disputes'],
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }
}
