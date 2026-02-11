import { Route } from '@angular/router';
import { authGuard, agentGuard } from './core/guards';
import { AppShellComponent } from './shared/components/layout';

/**
 * SPA Route Tree
 *
 * AppShellComponent is the persistent layout shell with sidebar, top-bar,
 * breadcrumbs, and footer. It uses <router-outlet> so it survives route
 * transitions (true SPA behaviour — no full re-renders).
 *
 * Routes with `data: { fullscreen: true }` hide the shell chrome so the
 * child component (e.g. Workspace) can manage its own layout.
 */
export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent
          ),
      },
      {
        path: 'workspace',
        loadComponent: () =>
          import('./features/workspace').then((m) => m.WorkspaceComponent),
        canActivate: [agentGuard],
        data: { fullscreen: true },
      },
      {
        path: 'admin',
        loadChildren: () =>
          import('./features/admin/admin.routes').then(
            (m) => m.ADMIN_ROUTES
          ),
      },
      {
        path: 'manager',
        loadChildren: () =>
          import('./features/manager/manager.routes').then(
            (m) => m.MANAGER_ROUTES
          ),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
