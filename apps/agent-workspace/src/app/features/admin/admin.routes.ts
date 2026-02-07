import { Routes } from '@angular/router';

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
  },
  {
    path: 'dispositions',
    loadComponent: () =>
      import('./components/dispositions/dispositions.component').then(
        (m) => m.DispositionsComponent
      ),
  },
  {
    path: 'logic-builder',
    loadComponent: () =>
      import('./components/logic-builder/logic-builder.component').then(
        (m) => m.LogicBuilderComponent
      ),
  },
];
