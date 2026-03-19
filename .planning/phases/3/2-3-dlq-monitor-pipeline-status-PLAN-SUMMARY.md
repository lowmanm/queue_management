## Execution Summary: DLQ Monitor and Pipeline Status Dashboard

**Status:** Complete
**Tasks:** 6/6
**Commits:** 08bca26 feat(workspace): add DLQ monitor and real-time pipeline status dashboard

### What Was Built

- `DLQEntry` and `DLQReason` interfaces added to shared-models (`task.interface.ts`)
- `DlqApiService` — HTTP client with 5 methods for DLQ CRUD (`getDlqTasks`, `getDlqStats`, `retryTask`, `rerouteTask`, `discardTask`)
- `SocketService` updated — `pipelineMetrics$` BehaviorSubject + `pipeline:metrics` event listener + `latestPipelineMetrics` getter
- `DlqMonitorComponent` — full-page DLQ management UI:
  - Stats bar (total + per-reason counts)
  - Pipeline/queue/reason/date range filters
  - Task table with checkbox selection, expandable JSON detail rows
  - Per-row actions: Retry, Reroute (inline queue selector), Discard
  - Bulk actions: Retry All Selected, Discard All Selected
  - Client-side pagination (page size 20)
- `PipelineStatusDashboardComponent` — real-time pipeline health dashboard:
  - Summary bar (active/inactive/error counts + overall SLA%)
  - Per-pipeline cards with 6 metrics (Ingested, Completed, In Queue, Failed, SLA%, Error Rate%)
  - SLA and error rate color-coded (green/yellow/red thresholds)
  - Live indicator with last-update timestamp
  - [View DLQ] navigates to DLQ monitor with pipelineId pre-filtered
  - [View Queues] navigates to queue monitor
  - Subscribes to `SocketService.pipelineMetrics$` for real-time updates
- `/manager/dlq` and `/manager/pipeline-status` routes added (managerGuard)
- Sidebar Operations section extended with DLQ Monitor and Pipeline Status links

### Files Created

- `libs/shared-models/src/lib/task.interface.ts` (modified — DLQEntry, DLQReason added)
- `apps/agent-workspace/src/app/features/manager/services/dlq-api.service.ts`
- `apps/agent-workspace/src/app/features/manager/components/dlq-monitor/dlq-monitor.component.{ts,html,scss,spec.ts}`
- `apps/agent-workspace/src/app/features/manager/components/pipeline-status/pipeline-status.component.{ts,html,scss,spec.ts}`

### Files Modified

- `apps/agent-workspace/src/app/core/services/socket.service.ts`
- `apps/agent-workspace/src/app/features/manager/manager.routes.ts`
- `apps/agent-workspace/src/app/shared/components/layout/app-shell.component.ts`

### Test Results

- 5 test files, 51 tests — all pass
- DlqMonitorComponent: 11 tests
- PipelineStatusDashboardComponent: 13 tests

### Issues Encountered

- Vitest (not Jest) is used; spec imports needed to use `vi` from `vitest` instead of `jest`
- The `--testFile` / `--testPathPattern` flags don't work with the `@angular/build:unit-test` executor; tests run with `--include` or all at once
