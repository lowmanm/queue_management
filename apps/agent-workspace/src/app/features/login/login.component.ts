import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
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

/** Seeded dev credentials — only used in non-production persona shortcuts. */
const DEV_CREDENTIALS: Record<string, string> = {
  admin: 'adminpass',
  designer: 'designerpass',
  manager: 'managerpass',
  agent1: 'agent1pass',
  agent2: 'agent2pass',
  agent3: 'agent3pass',
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  readonly isDevMode = !environment.production;

  /** Username/password form for production login. */
  loginForm = new FormGroup({
    username: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.required]),
  });

  loginLoading = false;
  loginError = '';

  // Dev-mode persona selector
  teams: Team[] = [];
  personaGroups: PersonaGroup[] = [];

  private readonly roleConfig: Record<UserRole, { label: string; description: string; color: string }> = {
    AGENT: { label: 'Agents', description: 'Work tasks from assigned queues', color: '#16a34a' },
    MANAGER: { label: 'Managers', description: 'Supervise teams and monitor queues', color: '#2563eb' },
    DESIGNER: { label: 'Designers', description: 'Configure workflows, rules, and pipelines', color: '#7c3aed' },
    ADMIN: { label: 'Administrators', description: 'Full system access and user management', color: '#dc2626' },
  };

  ngOnInit(): void {
    if (this.authService.isAuthenticated && this.authService.getToken()) {
      this.router.navigate([this.authService.getDefaultRoute()]);
      return;
    }

    if (this.isDevMode) {
      this.buildDevPersonas();
    }
  }

  private buildDevPersonas(): void {
    const devUsers: User[] = this.getSeededUsers();
    const roleOrder: UserRole[] = ['AGENT', 'MANAGER', 'DESIGNER', 'ADMIN'];
    this.personaGroups = roleOrder
      .map((role) => ({
        role,
        label: this.roleConfig[role].label,
        description: this.roleConfig[role].description,
        color: this.roleConfig[role].color,
        users: devUsers.filter((u) => u.role === role),
      }))
      .filter((g) => g.users.length > 0);
  }

  getPermissionCount(role: UserRole): number {
    const roleConfig = DEFAULT_ROLES.find((r) => r.id === role);
    return roleConfig?.permissions.length || 0;
  }

  /** Submit the username/password form. */
  onLoginSubmit(): void {
    if (this.loginForm.invalid || this.loginLoading) return;

    const { username, password } = this.loginForm.value;
    if (!username || !password) return;

    this.loginLoading = true;
    this.loginError = '';

    this.authService.login(username, password).subscribe({
      next: () => {
        this.router.navigate([this.authService.getDefaultRoute()]);
      },
      error: () => {
        this.loginError = 'Invalid username or password.';
        this.loginLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  /** Dev-mode shortcut: instantly login as a seeded persona. */
  quickLoginAs(username: string): void {
    const password = DEV_CREDENTIALS[username];
    if (!password) return;

    this.loginLoading = true;
    this.loginError = '';

    this.authService.login(username, password).subscribe({
      next: () => {
        this.router.navigate([this.authService.getDefaultRoute()]);
      },
      error: () => {
        this.loginError = `Quick-login failed for ${username}.`;
        this.loginLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  private getSeededUsers(): User[] {
    const now = new Date().toISOString();
    return [
      { id: 'user-admin', username: 'admin', displayName: 'System Administrator', email: 'admin@nexusqueue.com', role: 'ADMIN', active: true, createdAt: now, updatedAt: now },
      { id: 'user-designer', username: 'designer', displayName: 'Queue Designer', email: 'designer@nexusqueue.com', role: 'DESIGNER', active: true, createdAt: now, updatedAt: now },
      { id: 'user-manager', username: 'manager', displayName: 'Team Manager', email: 'manager@nexusqueue.com', role: 'MANAGER', teamId: 'team-orders', active: true, createdAt: now, updatedAt: now },
      { id: 'user-agent1', username: 'agent1', displayName: 'Agent One', email: 'agent1@nexusqueue.com', role: 'AGENT', teamId: 'team-orders', skills: ['orders', 'general'], active: true, createdAt: now, updatedAt: now },
      { id: 'user-agent2', username: 'agent2', displayName: 'Agent Two', email: 'agent2@nexusqueue.com', role: 'AGENT', teamId: 'team-returns', skills: ['returns', 'refunds'], active: true, createdAt: now, updatedAt: now },
      { id: 'user-agent3', username: 'agent3', displayName: 'Agent Three', email: 'agent3@nexusqueue.com', role: 'AGENT', teamId: 'team-claims', skills: ['claims', 'disputes'], active: true, createdAt: now, updatedAt: now },
    ];
  }
}
