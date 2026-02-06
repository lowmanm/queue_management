import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'logic-builder',
    pathMatch: 'full',
  },
  {
    path: 'logic-builder',
    loadComponent: () =>
      import('./components/logic-builder/logic-builder.component').then(
        (m) => m.LogicBuilderComponent
      ),
  },
];
