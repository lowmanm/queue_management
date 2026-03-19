<plan>
  <name>DLQ Monitor and Pipeline Status Dashboard</name>
  <wave>2</wave>
  <requirements>P3-040, P3-041, P3-042, P3-043, P3-050, P3-051, P3-052</requirements>

  <files>
    <!-- New: DLQ API service (frontend) -->
    apps/agent-workspace/src/app/features/manager/services/dlq-api.service.ts

    <!-- New: DLQ Monitor component -->
    apps/agent-workspace/src/app/features/manager/components/dlq-monitor/dlq-monitor.component.ts
    apps/agent-workspace/src/app/features/manager/components/dlq-monitor/dlq-monitor.component.html
    apps/agent-workspace/src/app/features/manager/components/dlq-monitor/dlq-monitor.component.scss
    apps/agent-workspace/src/app/features/manager/components/dlq-monitor/dlq-monitor.component.spec.ts

    <!-- New: Pipeline Status Dashboard component -->
    apps/agent-workspace/src/app/features/manager/components/pipeline-status/pipeline-status.component.ts
    apps/agent-workspace/src/app/features/manager/components/pipeline-status/pipeline-status.component.html
    apps/agent-workspace/src/app/features/manager/components/pipeline-status/pipeline-status.component.scss
    apps/agent-workspace/src/app/features/manager/components/pipeline-status/pipeline-status.component.spec.ts

    <!-- Existing: SocketService — add pipeline metrics listener -->
    apps/agent-workspace/src/app/core/services/socket.service.ts

    <!-- Manager routing — add dlq and pipeline-status routes -->
    apps/agent-workspace/src/app/features/manager/manager.routes.ts

    <!-- Sidebar — add DLQ Monitor and Pipeline Status links -->
    apps/agent-workspace/src/app/shared/components/layout/ (sidebar component)
  </files>

  <tasks>
    <task id="1">
      <name>Create DlqApiService (frontend HTTP client for DLQ endpoints)</name>
      <action>
        Create `apps/agent-workspace/src/app/features/manager/services/dlq-api.service.ts`:

        ```typescript
        @Injectable({ providedIn: 'root' })
        export class DlqApiService {
          private apiUrl = inject(environment_apiUrl);  // from environment.ts

          getDlqTasks(filters?: DlqFilter): Observable&lt;DLQEntry[]&gt;
          getDlqStats(): Observable&lt;DlqStats&gt;
          retryTask(taskId: string): Observable&lt;void&gt;
          rerouteTask(taskId: string, targetQueueId: string): Observable&lt;void&gt;
          discardTask(taskId: string): Observable&lt;void&gt;
        }
        ```

        Define `DlqFilter` interface locally (pipelineId?, queueId?, reason?, fromDate?, toDate?).
        Define `DlqStats` interface locally (total, byReason: Record&lt;string, number&gt;,
        byQueue: Record&lt;string, number&gt;, byPipeline: Record&lt;string, number&gt;).
        Define `DLQEntry` interface locally (or import from shared-models if added there):
        `{ taskId, task, queueId, pipelineId?, reason, movedAt, retryCount }`.

        Note: If `DLQEntry` is not in shared-models, add it to
        `libs/shared-models/src/lib/task.interface.ts` and export from index.ts.

        Map HTTP calls to:
        - `GET /api/queues/dlq?{filters}` → `getDlqTasks()`
        - `GET /api/queues/dlq/stats` → `getDlqStats()`
        - `POST /api/queues/dlq/:taskId/retry` → `retryTask()`
        - `POST /api/queues/dlq/:taskId/reroute` body `{targetQueueId}` → `rerouteTask()`
        - `DELETE /api/queues/dlq/:taskId` → `discardTask()`
      </action>
      <files>
        apps/agent-workspace/src/app/features/manager/services/dlq-api.service.ts
        libs/shared-models/src/lib/task.interface.ts (if DLQEntry needs to be added)
        libs/shared-models/src/index.ts (if updated)
      </files>
      <verify>npx nx build agent-workspace</verify>
      <done>
        - `DlqApiService` injectable with all 5 methods
        - All methods return correct Observable types
        - Build passes
      </done>
    </task>

    <task id="2">
      <name>Add pipeline:metrics WebSocket listener to SocketService</name>
      <action>
        In `apps/agent-workspace/src/app/core/services/socket.service.ts`, add a new
        Observable stream for pipeline metrics events:

        ```typescript
        private pipelineMetricsSubject = new BehaviorSubject&lt;PipelineMetricsSummary | null&gt;(null);
        public pipelineMetrics$ = this.pipelineMetricsSubject.asObservable();
        ```

        In the existing socket event subscription setup (wherever `socket.on(...)` calls are made),
        add:
        ```typescript
        this.socket.on('pipeline:metrics', (data: PipelineMetricsSummary) => {
          this.pipelineMetricsSubject.next(data);
        });
        ```

        Also add a `latestPipelineMetrics` getter for components that want the current snapshot.

        Import `PipelineMetricsSummary` from `@nexus-queue/shared-models`.

        This is a passive listener — no client event sent. The server broadcasts every 10 seconds
        (wired in plan 1-1, task 5).
      </action>
      <files>
        apps/agent-workspace/src/app/core/services/socket.service.ts
      </files>
      <verify>npx nx build agent-workspace</verify>
      <done>
        - `pipelineMetrics$` Observable exists on SocketService
        - `pipeline:metrics` socket event updates the BehaviorSubject
        - Build passes without TypeScript errors
      </done>
    </task>

    <task id="3">
      <name>Create DlqMonitorComponent</name>
      <action>
        Create standalone component at `.../manager/components/dlq-monitor/`.

        **Inputs:** None (full page component, Manager/Admin only).

        **Layout:**
        ```
        ┌─────────────────────────────────────────────────────────────┐
        │  DLQ Monitor                              [Refresh]          │
        │                                                              │
        │  Stats: Total: 14 | Routing Failed: 8 | SLA Expired: 6      │
        │                                                              │
        │  Filters: [Pipeline ▼] [Queue ▼] [Reason ▼] [Date Range ▼] │
        │                                                              │
        │  ┌───┬──────────────┬──────────────┬──────────┬───────────┐ │
        │  │ # │ Task ID      │ Pipeline     │ Reason   │ Moved At  │ │
        │  ├───┼──────────────┼──────────────┼──────────┼───────────┤ │
        │  │ ☐ │ task-abc-123 │ Credit Cards │ sla_exp  │ 2m ago    │ │
        │  │ ☐ │ task-xyz-456 │ Loans        │ routing  │ 5m ago    │ │
        │  └───┴──────────────┴──────────────┴──────────┴───────────┘ │
        │                                                              │
        │  Selected: 2 tasks  [Retry All] [Discard All]               │
        │                                                              │
        │  [< Prev]  Page 1 of 3  [Next >]                            │
        └─────────────────────────────────────────────────────────────┘
        ```

        **Features:**

        **Filtering (P3-043):**
        - Pipeline dropdown (loads from `PipelineApiService.getAllPipelines()`)
        - Queue dropdown (loads queues filtered by selected pipeline, or all queues)
        - Reason dropdown (options: all, routing_failed, sla_expired, max_retries_exceeded)
        - Date range: from-date and to-date (HTML date inputs)
        - Filters call `DlqApiService.getDlqTasks(filters)` reactively on change

        **Task list (P3-042 metadata):**
        - Checkbox per row (for bulk actions)
        - Task ID (truncated with tooltip)
        - Pipeline name
        - Queue name
        - Failure reason (badge with color: red=routing_failed, orange=sla_expired, yellow=max_retries_exceeded)
        - Moved to DLQ timestamp (relative "2m ago")
        - Retry count
        - `[▶ Details]` expandable row showing full task payload as JSON

        **Row actions (P3-041):**
        - `[Retry]` — calls `DlqApiService.retryTask(taskId)`, removes from list on success
        - `[Reroute]` — opens inline queue selector dropdown → confirm → calls `rerouteTask()`
        - `[Discard]` — confirm dialog → calls `discardTask()`, removes from list on success

        **Bulk actions:**
        - Select all checkbox in header
        - `[Retry All Selected]` — sequential retry calls with progress indicator
        - `[Discard All Selected]` — confirm count → sequential discard calls

        **Stats bar:** Calls `DlqApiService.getDlqStats()` and shows total + per-reason counts.

        **Pagination:** Client-side or query-param based (limit=20, offset).

        **Auto-refresh:** Refresh button + optional 60-second auto-refresh toggle.

        **State:**
        - `dlqEntries$ = new BehaviorSubject&lt;DLQEntry[]&gt;([])`
        - `dlqStats$ = new BehaviorSubject&lt;DlqStats | null&gt;(null)`
        - `filters$ = new BehaviorSubject&lt;DlqFilter&gt;({})`
        - `selectedTaskIds = new Set&lt;string&gt;()`
        - `isLoading = false`

        **Change detection:** `OnPush`. Use `async` pipe throughout.

        Create basic spec testing: renders stats bar, renders task list, filter change triggers reload.
      </action>
      <files>
        apps/agent-workspace/src/app/features/manager/components/dlq-monitor/dlq-monitor.component.ts
        apps/agent-workspace/src/app/features/manager/components/dlq-monitor/dlq-monitor.component.html
        apps/agent-workspace/src/app/features/manager/components/dlq-monitor/dlq-monitor.component.scss
        apps/agent-workspace/src/app/features/manager/components/dlq-monitor/dlq-monitor.component.spec.ts
      </files>
      <verify>npx nx build agent-workspace &amp;&amp; npx nx test agent-workspace --testFile=dlq-monitor.component.spec.ts</verify>
      <done>
        - Stats bar shows total + per-reason counts from DlqApiService.getDlqStats()
        - Task list shows all DLQ entries with metadata columns
        - Pipeline/queue/reason/date filters call getDlqTasks() with correct query params
        - [Retry] / [Reroute] / [Discard] buttons call correct service methods
        - Bulk select + [Retry All Selected] / [Discard All Selected] work
        - Expandable row shows full task JSON
        - Spec passes
      </done>
    </task>

    <task id="4">
      <name>Create PipelineStatusDashboardComponent</name>
      <action>
        Create standalone component at `.../manager/components/pipeline-status/`.

        **Purpose:** Real-time view of all pipeline health metrics (P3-050, P3-051, P3-052).

        **Layout:**
        ```
        ┌─────────────────────────────────────────────────────────────────┐
        │  Pipeline Status Dashboard          Live ● (updated 3s ago)     │
        │                                                                  │
        │  Summary: 3 Active | 1 Inactive | 0 Error | 89% SLA Compliance │
        │                                                                  │
        │  ┌──────────────────────────────────────────────────────────────┐
        │  │ Credit Cards Pipeline            ● ACTIVE                   │
        │  │  Ingested: 1,240  Completed: 1,198  In Queue: 42            │
        │  │  Failed: 8  SLA Compliance: 96.5%  Error Rate: 0.6%         │
        │  │  [View Queues] [View DLQ (8)]                               │
        │  └──────────────────────────────────────────────────────────────┘
        │  ┌──────────────────────────────────────────────────────────────┐
        │  │ Loans Pipeline                   ● ACTIVE                   │
        │  │  Ingested: 430   Completed: 410   In Queue: 20              │
        │  │  Failed: 6   SLA Compliance: 95.3%  Error Rate: 1.4%        │
        │  │  [View Queues] [View DLQ (6)]                               │
        │  └──────────────────────────────────────────────────────────────┘
        └─────────────────────────────────────────────────────────────────┘
        ```

        **Data source (P3-052 real-time via WebSocket):**
        - Subscribe to `SocketService.pipelineMetrics$` (from task 2 of this plan)
        - On connect, also call `PipelineApiService.getAllPipelineMetrics()` for initial load
        - WebSocket broadcasts every 10 seconds (server-side timer from plan 1-1)
        - Show "Live ●" indicator with timestamp of last update

        **Per-pipeline card (P3-051):**
        - Pipeline name + status badge (ACTIVE=green, INACTIVE=grey, ERROR=red)
        - Metrics row: Ingested, Completed, In Queue, Failed (with count badges)
        - SLA Compliance % (color-coded: >95% green, 80-95% yellow, &lt;80% red)
        - Error Rate % (color-coded: &lt;1% green, 1-5% yellow, >5% red)
        - `[View DLQ (N)]` button — navigates to `/manager/dlq?pipelineId=...`
          with pipeline ID pre-filled in the DLQ filter
        - `[View Queues]` button — navigates to `/manager/queues?pipelineId=...`

        **Summary bar (P3-050):**
        - Total active / inactive / error counts
        - Overall SLA compliance (avg across all active pipelines)

        **State:**
        - `metrics$ = new BehaviorSubject&lt;PipelineMetricsSummary | null&gt;(null)`
        - `lastUpdated$ = new BehaviorSubject&lt;Date | null&gt;(null)`
        - Subscribe to `SocketService.pipelineMetrics$` in `ngOnInit`, update `metrics$` and
          `lastUpdated$` on each emission. Unsubscribe in `ngOnDestroy`.

        **Change detection:** `OnPush`. Use `async` pipe throughout.

        Create basic spec testing: renders pipeline cards, shows SLA compliance color coding.
      </action>
      <files>
        apps/agent-workspace/src/app/features/manager/components/pipeline-status/pipeline-status.component.ts
        apps/agent-workspace/src/app/features/manager/components/pipeline-status/pipeline-status.component.html
        apps/agent-workspace/src/app/features/manager/components/pipeline-status/pipeline-status.component.scss
        apps/agent-workspace/src/app/features/manager/components/pipeline-status/pipeline-status.component.spec.ts
      </files>
      <verify>npx nx build agent-workspace &amp;&amp; npx nx test agent-workspace --testFile=pipeline-status.component.spec.ts</verify>
      <done>
        - Summary bar shows active/inactive/error counts and overall SLA %
        - Per-pipeline cards show all 6 metrics (Ingested, Completed, In Queue, Failed, SLA %, Error Rate %)
        - SLA % is color-coded correctly (green/yellow/red thresholds)
        - Subscribes to `SocketService.pipelineMetrics$` and updates on each broadcast
        - "Live ●" indicator shows timestamp of last WebSocket update
        - [View DLQ] navigates to DLQ monitor with pipeline filter pre-applied
        - Specs pass
      </done>
    </task>

    <task id="5">
      <name>Register DLQ Monitor and Pipeline Status routes, add sidebar links</name>
      <action>
        In `apps/agent-workspace/src/app/features/manager/manager.routes.ts`, add:

        ```typescript
        {
          path: 'dlq',
          component: DlqMonitorComponent,
          canActivate: [managerGuard],
          data: { breadcrumb: 'DLQ Monitor', title: 'Dead Letter Queue' }
        },
        {
          path: 'pipeline-status',
          component: PipelineStatusDashboardComponent,
          canActivate: [managerGuard],
          data: { breadcrumb: 'Pipeline Status', title: 'Pipeline Status Dashboard' }
        }
        ```

        In the sidebar component, add navigation items under the "Operations" section (or wherever
        manager routes are listed):
        - "DLQ Monitor" → `/manager/dlq` (icon: warning/alert style)
        - "Pipeline Status" → `/manager/pipeline-status` (icon: activity/chart style)
        - Visibility: `managerGuard` — visible to MANAGER and ADMIN roles

        Both routes are Manager/Admin only per Phase 3 decision (Agents and Designers don't manage
        failed tasks or monitor pipeline health metrics).
      </action>
      <files>
        apps/agent-workspace/src/app/features/manager/manager.routes.ts
        apps/agent-workspace/src/app/shared/components/layout/ (sidebar component)
      </files>
      <verify>npx nx build agent-workspace</verify>
      <done>
        - `/manager/dlq` loads `DlqMonitorComponent`
        - `/manager/pipeline-status` loads `PipelineStatusDashboardComponent`
        - Both protected by `managerGuard`
        - Sidebar shows both links under Operations for MANAGER and ADMIN roles
        - Build passes
      </done>
    </task>

    <task id="6">
      <name>Commit DLQ Monitor and Pipeline Status Dashboard</name>
      <action>
        Stage and commit all DLQ monitor and pipeline status changes:
        ```
        feat(workspace): add DLQ monitor and real-time pipeline status dashboard
        ```
      </action>
      <files>ALL modified files above</files>
      <verify>npx nx build agent-workspace &amp;&amp; npx nx lint agent-workspace</verify>
      <done>
        - `git log --oneline -1` shows the commit
        - Build and lint pass
      </done>
    </task>
  </tasks>

  <dependencies>Plan 1-1 must complete before this plan (DLQ API endpoints and pipeline metrics API required).</dependencies>
</plan>
