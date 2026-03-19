import { Routes } from '@angular/router';
import { managerGuard } from '../../core/guards';

export const MANAGER_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'team',
    pathMatch: 'full',
  },
  {
    path: 'team',
    loadComponent: () =>
      import('./components/team-dashboard/team-dashboard.component').then(
        (m) => m.TeamDashboardComponent
      ),
    canActivate: [managerGuard],
    data: { permissions: ['stats:view_team'] },
  },
  {
    path: 'queues',
    loadComponent: () =>
      import('./components/queue-monitor/queue-monitor.component').then(
        (m) => m.QueueMonitorComponent
      ),
    canActivate: [managerGuard],
    data: { permissions: ['queues:view'] },
  },
  {
    path: 'skills',
    loadComponent: () =>
      import('./components/skill-assignments/skill-assignments.component').then(
        (m) => m.SkillAssignmentsComponent
      ),
    canActivate: [managerGuard],
    data: { permissions: ['skills:assign'] },
  },
  {
    path: 'dlq',
    loadComponent: () =>
      import('./components/dlq-monitor/dlq-monitor.component').then(
        (m) => m.DlqMonitorComponent
      ),
    canActivate: [managerGuard],
    data: { breadcrumb: 'DLQ Monitor', title: 'Dead Letter Queue' },
  },
  {
    path: 'pipeline-status',
    loadComponent: () =>
      import('./components/pipeline-status/pipeline-status.component').then(
        (m) => m.PipelineStatusDashboardComponent
      ),
    canActivate: [managerGuard],
    data: { breadcrumb: 'Pipeline Status', title: 'Pipeline Status Dashboard' },
  },
];
