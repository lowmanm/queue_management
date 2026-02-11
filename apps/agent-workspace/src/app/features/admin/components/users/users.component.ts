import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import {
  User,
  Team,
  Role,
  UserRole,
  Permission,
  CreateUserRequest,
  UpdateUserRequest,
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
} from '@nexus-queue/shared-models';
import { environment } from '../../../../../environments/environment';

interface RbacConfig {
  users: User[];
  roles: Role[];
  teams: Team[];
  permissions: typeof ALL_PERMISSIONS;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  users: User[] = [];
  teams: Team[] = [];
  roles: Role[] = DEFAULT_ROLES;
  loading = true;
  error: string | null = null;

  // Toast notification state
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  toastVisible = false;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  // Modal state
  showModal = false;
  modalMode: 'create' | 'edit' = 'create';
  modalError: string | null = null;
  editingUser: User | null = null;

  // Form data
  formData: CreateUserRequest = {
    username: '',
    displayName: '',
    email: '',
    role: 'AGENT',
    teamId: '',
    skills: [],
  };
  skillsInput = '';

  // Filter state
  filterRole: UserRole | '' = '';
  filterTeam = '';
  filterActive = '';
  searchTerm = '';

  ngOnInit(): void {
    this.loadConfig();
  }

  /**
   * Load RBAC configuration from backend
   */
  loadConfig(): void {
    this.loading = true;
    this.error = null;

    this.http.get<RbacConfig>(`${environment.apiUrl}/rbac/config`).subscribe({
      next: (config) => {
        this.users = config.users;
        this.teams = config.teams;
        this.roles = config.roles;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = 'Failed to load users';
        this.loading = false;
        this.cdr.detectChanges();
        console.error('Failed to load RBAC config:', err);
      },
    });
  }

  /**
   * Get filtered users based on current filters
   */
  get filteredUsers(): User[] {
    return this.users.filter((user) => {
      // Role filter
      if (this.filterRole && user.role !== this.filterRole) {
        return false;
      }

      // Team filter
      if (this.filterTeam && user.teamId !== this.filterTeam) {
        return false;
      }

      // Active filter
      if (this.filterActive !== '') {
        const isActive = this.filterActive === 'true';
        if (user.active !== isActive) {
          return false;
        }
      }

      // Search filter
      if (this.searchTerm) {
        const search = this.searchTerm.toLowerCase();
        return (
          user.username.toLowerCase().includes(search) ||
          user.displayName.toLowerCase().includes(search) ||
          user.email?.toLowerCase().includes(search)
        );
      }

      return true;
    });
  }

  /**
   * Get user counts by role
   */
  get userCountsByRole(): Record<UserRole, number> {
    const counts: Record<UserRole, number> = {
      AGENT: 0,
      MANAGER: 0,
      DESIGNER: 0,
      ADMIN: 0,
    };

    this.users.forEach((user) => {
      if (user.active) {
        counts[user.role]++;
      }
    });

    return counts;
  }

  /**
   * Get team name by ID
   */
  getTeamName(teamId: string | undefined): string {
    if (!teamId) return '-';
    const team = this.teams.find((t) => t.id === teamId);
    return team?.name || teamId;
  }

  /**
   * Get role display info
   */
  getRoleInfo(roleId: UserRole): Role | undefined {
    return this.roles.find((r) => r.id === roleId);
  }

  /**
   * Show a toast notification
   */
  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = setTimeout(() => {
      this.toastVisible = false;
    }, 4000);
  }

  /**
   * Open modal for creating new user
   */
  openCreateModal(): void {
    this.modalMode = 'create';
    this.editingUser = null;
    this.modalError = null;
    this.formData = {
      username: '',
      displayName: '',
      email: '',
      role: 'AGENT',
      teamId: '',
      skills: [],
    };
    this.skillsInput = '';
    this.showModal = true;
  }

  /**
   * Open modal for editing user
   */
  openEditModal(user: User): void {
    this.modalMode = 'edit';
    this.editingUser = user;
    this.modalError = null;
    this.formData = {
      username: user.username,
      displayName: user.displayName,
      email: user.email || '',
      role: user.role,
      teamId: user.teamId || '',
      skills: user.skills || [],
    };
    this.skillsInput = (user.skills || []).join(', ');
    this.showModal = true;
  }

  /**
   * Close modal
   */
  closeModal(): void {
    this.showModal = false;
    this.editingUser = null;
  }

  /**
   * Save user (create or update)
   */
  saveUser(): void {
    // Parse skills from input
    this.formData.skills = this.skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (this.modalMode === 'create') {
      this.createUser();
    } else {
      this.updateUser();
    }
  }

  /**
   * Create new user
   */
  private createUser(): void {
    this.modalError = null;
    this.http
      .post<User>(`${environment.apiUrl}/rbac/users`, this.formData)
      .subscribe({
        next: (user) => {
          this.users.push(user);
          this.closeModal();
          this.showToast(`User "${user.displayName}" created successfully`);
        },
        error: (err) => {
          this.modalError = err.error?.message || 'Failed to create user';
          console.error('Failed to create user:', err);
        },
      });
  }

  /**
   * Update existing user
   */
  private updateUser(): void {
    if (!this.editingUser) return;

    this.modalError = null;
    const updateRequest: UpdateUserRequest = {
      displayName: this.formData.displayName,
      email: this.formData.email,
      role: this.formData.role,
      teamId: this.formData.teamId || undefined,
      skills: this.formData.skills,
    };

    this.http
      .put<User>(
        `${environment.apiUrl}/rbac/users/${this.editingUser.id}`,
        updateRequest
      )
      .subscribe({
        next: (user) => {
          const index = this.users.findIndex((u) => u.id === user.id);
          if (index >= 0) {
            this.users[index] = user;
          }
          this.closeModal();
          this.showToast(`User "${user.displayName}" updated successfully`);
        },
        error: (err) => {
          this.modalError = err.error?.message || 'Failed to update user';
          console.error('Failed to update user:', err);
        },
      });
  }

  /**
   * Toggle user active status
   */
  toggleUserActive(user: User): void {
    const endpoint = user.active
      ? `${environment.apiUrl}/rbac/users/${user.id}`
      : `${environment.apiUrl}/rbac/users/${user.id}/activate`;

    const request = user.active
      ? this.http.delete<User>(endpoint)
      : this.http.post<User>(endpoint, {});

    request.subscribe({
      next: (updatedUser) => {
        const index = this.users.findIndex((u) => u.id === updatedUser.id);
        if (index >= 0) {
          this.users[index] = updatedUser;
        }
        this.showToast(
          `User "${updatedUser.displayName}" ${updatedUser.active ? 'activated' : 'deactivated'}`
        );
      },
      error: (err) => {
        this.showToast('Failed to update user status', 'error');
        console.error('Failed to toggle user active:', err);
      },
    });
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.filterRole = '';
    this.filterTeam = '';
    this.filterActive = '';
    this.searchTerm = '';
  }
}
