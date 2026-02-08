import { Routes } from '@angular/router';
import { designerGuard, adminGuard } from '../../core/guards';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'task-sources',
    pathMatch: 'full',
  },
  {
    path: 'task-sources',
    loadComponent: () =>
      import('./components/task-sources/task-sources.component').then(
        (m) => m.TaskSourcesComponent
      ),
    canActivate: [designerGuard],
    data: { permissions: ['design:task_sources'] },
  },
  {
    path: 'dispositions',
    loadComponent: () =>
      import('./components/dispositions/dispositions.component').then(
        (m) => m.DispositionsComponent
      ),
    canActivate: [designerGuard],
    data: { permissions: ['design:dispositions'] },
  },
  {
    path: 'logic-builder',
    loadComponent: () =>
      import('./components/logic-builder/logic-builder.component').then(
        (m) => m.LogicBuilderComponent
      ),
    canActivate: [designerGuard],
    data: { permissions: ['design:rules'] },
  },
  {
    path: 'users',
    loadComponent: () =>
      import('./components/users/users.component').then(
        (m) => m.UsersComponent
      ),
    canActivate: [adminGuard],
    data: { permissions: ['admin:users'] },
  },
  {
    path: 'routing',
    loadComponent: () =>
      import('./components/routing-config/routing-config.component').then(
        (m) => m.RoutingConfigComponent
      ),
    canActivate: [designerGuard],
    data: { permissions: ['design:routing'] },
  },
  {
    path: 'work-states',
    loadComponent: () =>
      import('./components/work-states/work-states.component').then(
        (m) => m.WorkStatesComponent
      ),
    canActivate: [adminGuard],
    data: { permissions: ['admin:settings'] },
  },
];
