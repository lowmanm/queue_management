import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, tap, catchError, map } from 'rxjs';
import {
  User,
  Permission,
  UserRole,
  getUserPermissions,
} from '@nexus-queue/shared-models';
import { environment } from '../../../environments/environment';

/**
 * Extended user with computed permissions
 */
export interface AuthenticatedUser extends User {
  permissions: Permission[];
}

/**
 * Legacy Agent interface for backwards compatibility
 */
export interface Agent {
  id: string;
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);

  private currentUserSubject = new BehaviorSubject<AuthenticatedUser | null>(null);
  public currentUser$: Observable<AuthenticatedUser | null> =
    this.currentUserSubject.asObservable();

  // Legacy observable for backwards compatibility
  public currentAgent$: Observable<Agent | null> = this.currentUser$.pipe(
    map((user) =>
      user ? { id: user.id, name: user.displayName } : null
    )
  );

  constructor() {
    this.initializeAuth();
  }

  private initializeAuth(): void {
    // Auto-login in development mode
    if (!environment.production) {
      this.autoLoginDev();
    }
  }

  /**
   * Auto-login with a specific role for development
   */
  private autoLoginDev(): void {
    // Default to agent role, but can be changed via localStorage
    const savedRole = localStorage.getItem('devRole') as UserRole || 'AGENT';
    this.loginAsRole(savedRole);
  }

  /**
   * Login as a specific role (for development/demo)
   */
  loginAsRole(role: UserRole): void {
    const users: Record<UserRole, AuthenticatedUser> = {
      AGENT: {
        id: 'user-agent1',
        username: 'agent1',
        displayName: 'Agent One',
        email: 'agent1@nexusqueue.com',
        role: 'AGENT',
        teamId: 'team-orders',
        skills: ['orders', 'general'],
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        permissions: [
          'tasks:work',
          'tasks:view_own',
          'agents:view_own',
          'stats:own',
        ],
      },
      MANAGER: {
        id: 'user-manager',
        username: 'manager',
        displayName: 'Team Manager',
        email: 'manager@nexusqueue.com',
        role: 'MANAGER',
        teamId: 'team-orders',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        permissions: [
          'tasks:work',
          'tasks:view_own',
          'tasks:view_all',
          'tasks:reassign',
          'queues:view',
          'queues:jump',
          'agents:view_own',
          'agents:view_team',
          'agents:force_state',
          'stats:own',
          'stats:team',
          'stats:queue',
        ],
      },
      DESIGNER: {
        id: 'user-designer',
        username: 'designer',
        displayName: 'Queue Designer',
        email: 'designer@nexusqueue.com',
        role: 'DESIGNER',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        permissions: [
          'tasks:view_all',
          'queues:view',
          'queues:manage',
          'agents:view_all',
          'stats:queue',
          'stats:system',
          'design:dispositions',
          'design:workflows',
          'design:rules',
          'design:pipelines',
          'design:volume_loaders',
        ],
      },
      ADMIN: {
        id: 'user-admin',
        username: 'admin',
        displayName: 'System Administrator',
        email: 'admin@nexusqueue.com',
        role: 'ADMIN',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        permissions: [
          'tasks:work',
          'tasks:view_own',
          'tasks:view_all',
          'tasks:reassign',
          'tasks:priority_override',
          'queues:view',
          'queues:manage',
          'queues:jump',
          'agents:view_own',
          'agents:view_team',
          'agents:view_all',
          'agents:manage',
          'agents:force_state',
          'stats:own',
          'stats:team',
          'stats:queue',
          'stats:system',
          'stats:export',
          'design:dispositions',
          'design:workflows',
          'design:rules',
          'design:pipelines',
          'design:volume_loaders',
          'admin:users',
          'admin:settings',
          'admin:audit',
          'admin:health',
          'admin:integrations',
        ],
      },
    };

    localStorage.setItem('devRole', role);
    this.currentUserSubject.next(users[role]);
  }

  /**
   * Get current authenticated user
   */
  get currentUser(): AuthenticatedUser | null {
    return this.currentUserSubject.value;
  }

  /**
   * Legacy getter for backwards compatibility
   */
  get currentAgent(): Agent | null {
    const user = this.currentUser;
    return user ? { id: user.id, name: user.displayName } : null;
  }

  /**
   * Check if user is authenticated
   */
  get isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }

  /**
   * Get current user's role
   */
  get currentRole(): UserRole | null {
    return this.currentUser?.role || null;
  }

  /**
   * Get current user's permissions
   */
  get currentPermissions(): Permission[] {
    return this.currentUser?.permissions || [];
  }

  /**
   * Check if current user has a specific permission
   */
  hasPermission(permission: Permission): boolean {
    return this.currentPermissions.includes(permission);
  }

  /**
   * Check if current user has any of the specified permissions
   */
  hasAnyPermission(permissions: Permission[]): boolean {
    return permissions.some((p) => this.hasPermission(p));
  }

  /**
   * Check if current user has all of the specified permissions
   */
  hasAllPermissions(permissions: Permission[]): boolean {
    return permissions.every((p) => this.hasPermission(p));
  }

  /**
   * Check if current user has a specific role
   */
  hasRole(role: UserRole): boolean {
    return this.currentRole === role;
  }

  /**
   * Check if current user has any of the specified roles
   */
  hasAnyRole(roles: UserRole[]): boolean {
    return this.currentRole !== null && roles.includes(this.currentRole);
  }

  /**
   * Login with agent data (legacy method for backwards compatibility)
   */
  login(agent: Agent): void {
    // Convert legacy agent to user
    const user: AuthenticatedUser = {
      id: agent.id,
      username: agent.name.toLowerCase().replace(/\s+/g, '_'),
      displayName: agent.name,
      role: 'AGENT',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      permissions: [
        'tasks:work',
        'tasks:view_own',
        'agents:view_own',
        'stats:own',
      ],
    };
    this.currentUserSubject.next(user);
  }

  /**
   * Login with full user data
   */
  loginWithUser(user: User): void {
    const authenticatedUser: AuthenticatedUser = {
      ...user,
      permissions: getUserPermissions(user),
    };
    this.currentUserSubject.next(authenticatedUser);
  }

  /**
   * Logout current user
   */
  logout(): void {
    localStorage.removeItem('devRole');
    this.currentUserSubject.next(null);
  }

  /**
   * Switch role (for development/demo)
   */
  switchRole(role: UserRole): void {
    this.loginAsRole(role);
  }
}
