import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Permission, UserRole } from '@nexus-queue/shared-models';

/**
 * Route data interface for permission-based access control
 */
export interface PermissionRouteData {
  /** Required permissions (user must have at least one) */
  permissions?: Permission[];
  /** Required roles (user must have at least one) */
  roles?: UserRole[];
  /** Require all permissions instead of any */
  requireAll?: boolean;
}

/**
 * Guard that checks if user has required permissions
 */
export const permissionGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Check authentication first
  if (!authService.isAuthenticated) {
    router.navigate(['/login']);
    return false;
  }

  const data = route.data as PermissionRouteData;

  // If no permissions or roles specified, allow access
  if (!data?.permissions?.length && !data?.roles?.length) {
    return true;
  }

  // Check roles first
  if (data.roles?.length) {
    if (!authService.hasAnyRole(data.roles)) {
      router.navigate(['/unauthorized']);
      return false;
    }
  }

  // Check permissions
  if (data.permissions?.length) {
    const hasAccess = data.requireAll
      ? authService.hasAllPermissions(data.permissions)
      : authService.hasAnyPermission(data.permissions);

    if (!hasAccess) {
      router.navigate(['/unauthorized']);
      return false;
    }
  }

  return true;
};

/**
 * Guard that requires user to be an agent (or have task:work permission)
 */
export const agentGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated) {
    router.navigate(['/login']);
    return false;
  }

  if (!authService.hasPermission('tasks:work')) {
    router.navigate(['/unauthorized']);
    return false;
  }

  return true;
};

/**
 * Guard that requires user to be a manager
 */
export const managerGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated) {
    router.navigate(['/login']);
    return false;
  }

  if (!authService.hasAnyRole(['MANAGER', 'ADMIN'])) {
    router.navigate(['/unauthorized']);
    return false;
  }

  return true;
};

/**
 * Guard that requires user to be a designer
 */
export const designerGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated) {
    router.navigate(['/login']);
    return false;
  }

  if (!authService.hasAnyRole(['DESIGNER', 'ADMIN'])) {
    router.navigate(['/unauthorized']);
    return false;
  }

  return true;
};

/**
 * Guard that requires user to be an admin
 */
export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated) {
    router.navigate(['/login']);
    return false;
  }

  if (!authService.hasRole('ADMIN')) {
    router.navigate(['/unauthorized']);
    return false;
  }

  return true;
};
