import { Routes } from '@angular/router';
import { designerGuard, adminGuard } from '../../core/guards';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'volume-loaders',
    pathMatch: 'full',
  },
  {
    // Must be declared before 'pipelines' to prevent 'new' being matched as a pipeline ID
    path: 'pipelines/new',
    loadComponent: () =>
      import('./components/pipeline-wizard/pipeline-wizard.component').then(
        (m) => m.PipelineWizardComponent
      ),
    canActivate: [designerGuard],
    data: { breadcrumb: 'New Pipeline', title: 'Create Pipeline', permissions: ['design:pipelines'] },
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
    path: 'rule-sets',
    loadComponent: () =>
      import('./components/rule-builder/rule-builder.component').then(
        (m) => m.RuleBuilderComponent
      ),
    canActivate: [designerGuard],
    data: { breadcrumb: 'Rule Sets', title: 'Rule Builder' },
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
    path: 'audit-log',
    loadComponent: () =>
      import('./components/audit-log/audit-log.component').then(
        (m) => m.AuditLogComponent
      ),
    canActivate: [adminGuard],
    data: { breadcrumb: 'Audit Log', title: 'Audit Log' },
  },
  {
    path: 'webhooks',
    loadComponent: () =>
      import('./components/webhooks/webhooks.component').then(
        (m) => m.WebhooksComponent
      ),
    canActivate: [designerGuard],
    data: { breadcrumb: 'Webhook Endpoints', title: 'Webhook Endpoints', permissions: ['design:pipelines'] },
  },
  {
    path: 'observability',
    loadComponent: () =>
      import('./components/observability/observability.component').then(
        (m) => m.ObservabilityComponent
      ),
    canActivate: [designerGuard],
    data: { breadcrumb: 'Observability', title: 'Observability' },
  },
];
