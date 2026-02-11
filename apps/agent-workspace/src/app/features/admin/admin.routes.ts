import { Routes } from '@angular/router';
import { designerGuard, adminGuard } from '../../core/guards';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'volume-loaders',
    pathMatch: 'full',
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
    path: 'skills',
    loadComponent: () =>
      import('./components/skills/skills.component').then(
        (m) => m.SkillsComponent
      ),
    canActivate: [designerGuard],
    data: { permissions: ['design:skills'] },
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
];
