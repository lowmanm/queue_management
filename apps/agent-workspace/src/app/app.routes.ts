import { Route } from '@angular/router';
import { authGuard, agentGuard } from './core/guards';
import { WorkspaceComponent } from './features/workspace';

export const appRoutes: Route[] = [
  {
    path: '',
    component: WorkspaceComponent,
    canActivate: [agentGuard],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: 'manager',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/manager/manager.routes').then((m) => m.MANAGER_ROUTES),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
