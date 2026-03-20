import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, EMPTY, tap, catchError, map } from 'rxjs';
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

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export interface TokenPair {
  accessToken: string;
  expiresIn: number;
}

interface JwtTokenPayload {
  sub: string;
  exp: number;
  username: string;
  role: string;
  permissions: string[];
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private currentUserSubject = new BehaviorSubject<AuthenticatedUser | null>(null);
  public currentUser$: Observable<AuthenticatedUser | null> =
    this.currentUserSubject.asObservable();

  // Legacy observable for backwards compatibility
  public currentAgent$: Observable<Agent | null> = this.currentUser$.pipe(
    map((user) =>
      user ? { id: user.id, name: user.displayName } : null
    )
  );

  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.restoreSession();
  }

  /**
   * Restore session from localStorage on app init.
   * Validates token expiry; clears session if expired.
   */
  private restoreSession(): void {
    const token = this.getToken();
    if (!token) return;

    try {
      const payload = this.decodeToken(token);
      if (payload.exp * 1000 < Date.now()) {
        this.clearSession();
        return;
      }

      const savedUser = localStorage.getItem('currentUser');
      if (savedUser) {
        const user: AuthenticatedUser = JSON.parse(savedUser);
        this.currentUserSubject.next(user);
        const msUntilExpiry = payload.exp * 1000 - Date.now();
        this.scheduleRefresh(msUntilExpiry - 60_000);
      }
    } catch {
      this.clearSession();
    }
  }

  /**
   * Authenticate with username + password against the real API.
   * Stores tokens in localStorage and schedules auto-refresh.
   */
  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, {
        username,
        password,
      })
      .pipe(
        tap((response) => {
          localStorage.setItem('accessToken', response.accessToken);
          localStorage.setItem('refreshToken', response.refreshToken);
          const authenticatedUser: AuthenticatedUser = {
            ...response.user,
            permissions: getUserPermissions(response.user),
          };
          localStorage.setItem('currentUser', JSON.stringify(authenticatedUser));
          this.currentUserSubject.next(authenticatedUser);
          this.scheduleRefresh((response.expiresIn - 60) * 1000);
        })
      );
  }

  /**
   * Exchange the stored refresh token for a new access token.
   * Logs out if the refresh token is expired or invalid.
   */
  refreshToken(): Observable<void> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      this.logout();
      return EMPTY;
    }

    return this.http
      .post<TokenPair>(`${environment.apiUrl}/auth/refresh`, { refreshToken })
      .pipe(
        tap((response) => {
          localStorage.setItem('accessToken', response.accessToken);
          this.scheduleRefresh((response.expiresIn - 60) * 1000);
        }),
        map(() => void 0),
        catchError(() => {
          this.logout();
          return EMPTY;
        })
      );
  }

  /**
   * Returns the current access token from localStorage.
   */
  getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  /**
   * Logout: clear all tokens, cancel refresh timer, navigate to login.
   */
  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /**
   * Login with full user data — kept for dev-mode persona shortcuts
   * that bypass the real auth flow (non-production only).
   */
  loginWithUser(user: User): void {
    const authenticatedUser: AuthenticatedUser = {
      ...user,
      permissions: getUserPermissions(user),
    };
    this.currentUserSubject.next(authenticatedUser);
    localStorage.setItem('currentUser', JSON.stringify(authenticatedUser));
  }

  // ===== Getters =====

  get currentUser(): AuthenticatedUser | null {
    return this.currentUserSubject.value;
  }

  get currentAgent(): Agent | null {
    const user = this.currentUser;
    return user ? { id: user.id, name: user.displayName } : null;
  }

  get isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }

  get currentRole(): UserRole | null {
    return this.currentUser?.role || null;
  }

  get currentPermissions(): Permission[] {
    return this.currentUser?.permissions || [];
  }

  // ===== Permission / Role helpers =====

  hasPermission(permission: Permission): boolean {
    return this.currentPermissions.includes(permission);
  }

  hasAnyPermission(permissions: Permission[]): boolean {
    return permissions.some((p) => this.hasPermission(p));
  }

  hasAllPermissions(permissions: Permission[]): boolean {
    return permissions.every((p) => this.hasPermission(p));
  }

  hasRole(role: UserRole): boolean {
    return this.currentRole === role;
  }

  hasAnyRole(roles: UserRole[]): boolean {
    return this.currentRole !== null && roles.includes(this.currentRole);
  }

  /**
   * Switch role — with real JWT auth this logs out so the user must re-authenticate.
   * Kept for API compatibility; role-switching now requires a fresh login.
   */
  switchRole(_role: UserRole): void {
    this.logout();
  }

  /**
   * Get the default landing route for the current user's role.
   */
  getDefaultRoute(): string {
    switch (this.currentRole) {
      case 'AGENT':
        return '/workspace';
      default:
        return '/';
    }
  }

  // ===== Private helpers =====

  private clearSession(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUser');
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.currentUserSubject.next(null);
  }

  private scheduleRefresh(delayMs: number): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
    }
    if (delayMs > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshToken().subscribe();
      }, delayMs);
    }
  }

  private decodeToken(token: string): JwtTokenPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT structure');
    }
    return JSON.parse(atob(parts[1])) as JwtTokenPayload;
  }
}
