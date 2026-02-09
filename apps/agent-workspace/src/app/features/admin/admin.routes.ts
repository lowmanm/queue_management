import { Routes } from '@angular/router';
import { designerGuard, adminGuard } from '../../core/guards';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'pipelines',
    pathMatch: 'full',
  },
  {
    path: 'pipelines',
    loadComponent: () =>
      import('./components/pipelines/pipelines.component').then(
        (m) => m.PipelinesComponent
      ),
    canActivate: [designerGuard],
    data: { permissions: ['design:pipelines'] },
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
    path: 'work-states',
    loadComponent: () =>
      import('./components/work-states/work-states.component').then(
        (m) => m.WorkStatesComponent
      ),
    canActivate: [designerGuard],
    data: { permissions: ['design:work_states'] },
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
    path: 'volume-loaders',
    loadComponent: () =>
      import('./components/volume-loader/volume-loader.component').then(
        (m) => m.VolumeLoaderComponent
      ),
    canActivate: [designerGuard],
    data: { permissions: ['design:volume_loaders'] },
  },
];
