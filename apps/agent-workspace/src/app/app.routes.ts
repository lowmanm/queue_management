import { Route } from '@angular/router';
import { authGuard } from './core/guards';
import { WorkspaceComponent } from './features/workspace';

export const appRoutes: Route[] = [
  {
    path: '',
    component: WorkspaceComponent,
    canActivate: [authGuard],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
