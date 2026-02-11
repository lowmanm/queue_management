import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  userName = computed(() => this.authService.currentUser?.displayName ?? 'User');
  userRole = computed(() => this.authService.currentRole ?? 'AGENT');

  canAccessWorkspace = computed(() => this.authService.hasPermission('tasks:work'));
  canAccessOperations = computed(() => this.authService.hasAnyRole(['MANAGER', 'ADMIN']));
  canAccessConfiguration = computed(() => this.authService.hasAnyRole(['DESIGNER', 'ADMIN']));
  canAccessSystem = computed(() => this.authService.hasRole('ADMIN'));

  navigateTo(path: string): void {
    this.router.navigate([path]);
  }
}
