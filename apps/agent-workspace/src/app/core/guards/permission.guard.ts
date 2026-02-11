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
 * Redirect to the user's role-appropriate landing page.
 * Falls back to /login if no default route is available.
 */
function redirectToLanding(router: Router, authService: AuthService): false {
  const defaultRoute = authService.getDefaultRoute();
  router.navigate([defaultRoute]);
  return false;
}

/**
 * Guard that checks if user has required permissions
 */
export const permissionGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated) {
    router.navigate(['/login']);
    return false;
  }

  const data = route.data as PermissionRouteData;

  if (!data?.permissions?.length && !data?.roles?.length) {
    return true;
  }

  if (data.roles?.length) {
    if (!authService.hasAnyRole(data.roles)) {
      return redirectToLanding(router, authService);
    }
  }

  if (data.permissions?.length) {
    const hasAccess = data.requireAll
      ? authService.hasAllPermissions(data.permissions)
      : authService.hasAnyPermission(data.permissions);

    if (!hasAccess) {
      return redirectToLanding(router, authService);
    }
  }

  return true;
};

/**
 * Guard that requires user to have tasks:work permission (agents, managers, admins)
 */
export const agentGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated) {
    router.navigate(['/login']);
    return false;
  }

  if (!authService.hasPermission('tasks:work')) {
    return redirectToLanding(router, authService);
  }

  return true;
};

/**
 * Guard that requires user to be a manager or admin
 */
export const managerGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated) {
    router.navigate(['/login']);
    return false;
  }

  if (!authService.hasAnyRole(['MANAGER', 'ADMIN'])) {
    return redirectToLanding(router, authService);
  }

  return true;
};

/**
 * Guard that requires user to be a designer or admin
 */
export const designerGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated) {
    router.navigate(['/login']);
    return false;
  }

  if (!authService.hasAnyRole(['DESIGNER', 'ADMIN'])) {
    return redirectToLanding(router, authService);
  }

  return true;
};

/**
 * Guard that requires user to be an admin
 */
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated) {
    router.navigate(['/login']);
    return false;
  }

  if (!authService.hasRole('ADMIN')) {
    return redirectToLanding(router, authService);
  }

  return true;
};
