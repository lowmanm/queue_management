<plan>
  <name>Pipeline Creation Wizard, Queue Config Panel, and Routing Rule Editor</name>
  <wave>2</wave>
  <requirements>P3-001, P3-002, P3-003, P3-004, P3-005, P3-006, P3-007, P3-020, P3-021, P3-022, P3-023, P3-030, P3-031, P3-032, P3-033</requirements>

  <files>
    <!-- Shared models — add wizard-specific request types -->
    libs/shared-models/src/lib/pipeline.interface.ts

    <!-- Pipeline API service — add validate method -->
    apps/agent-workspace/src/app/features/admin/services/pipeline.service.ts

    <!-- New: Pipeline Wizard component (multi-step) -->
    apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.ts
    apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.html
    apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.scss
    apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.spec.ts

    <!-- New: Queue Config Panel component -->
    apps/agent-workspace/src/app/features/admin/components/queue-config-panel/queue-config-panel.component.ts
    apps/agent-workspace/src/app/features/admin/components/queue-config-panel/queue-config-panel.component.html
    apps/agent-workspace/src/app/features/admin/components/queue-config-panel/queue-config-panel.component.scss

    <!-- Modify: Pipelines component — launch wizard for new, use QueueConfigPanel for queue editing -->
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.ts
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.html

    <!-- Admin routing — add wizard route -->
    apps/agent-workspace/src/app/features/admin/admin.routes.ts
  </files>

  <tasks>
    <task id="1">
      <name>Add PipelineApiService.validatePipeline() and queue real-time stats method</name>
      <action>
        In `apps/agent-workspace/src/app/features/admin/services/pipeline.service.ts`, add:

        ```typescript
        validatePipeline(pipelineId: string, request: PipelineValidationRequest): Observable&lt;PipelineValidationResult&gt; {
          return this.http.post&lt;PipelineValidationResult&gt;(`${this.apiUrl}/pipelines/${pipelineId}/validate`, request);
        }

        getPipelineMetrics(pipelineId: string): Observable&lt;PipelineMetrics&gt; {
          return this.http.get&lt;PipelineMetrics&gt;(`${this.apiUrl}/pipelines/${pipelineId}/metrics`);
        }

        getAllPipelineMetrics(): Observable&lt;PipelineMetricsSummary&gt; {
          return this.http.get&lt;PipelineMetricsSummary&gt;(`${this.apiUrl}/pipelines/metrics`);
        }

        getPipelineVersions(pipelineId: string): Observable&lt;PipelineVersion[]&gt; {
          return this.http.get&lt;PipelineVersion[]&gt;(`${this.apiUrl}/pipelines/${pipelineId}/versions`);
        }

        rollbackPipelineVersion(pipelineId: string, versionId: string): Observable&lt;Pipeline&gt; {
          return this.http.post&lt;Pipeline&gt;(`${this.apiUrl}/pipelines/${pipelineId}/versions/${versionId}/rollback`, {});
        }

        getQueueStats(queueId: string): Observable&lt;QueueStats&gt; {
          return this.http.get&lt;QueueStats&gt;(`${this.apiUrl}/queues/${queueId}/stats`);
        }

        getAllQueueStats(): Observable&lt;QueueStats[]&gt; {
          return this.http.get&lt;QueueStats[]&gt;(`${this.apiUrl}/queues/stats`);
        }
        ```

        Import `PipelineValidationRequest`, `PipelineValidationResult`, `PipelineMetrics`,
        `PipelineMetricsSummary`, `PipelineVersion` from `@nexus-queue/shared-models`.

        Note: `QueueStats` is the existing stats type from the backend — check and define interface
        in shared-models if not already present (depth, agentCount, dlqCount, healthStatus).
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/services/pipeline.service.ts
        libs/shared-models/src/lib/pipeline.interface.ts
      </files>
      <verify>npx nx build agent-workspace</verify>
      <done>
        - All 7 new methods exist on PipelineApiService
        - `QueueStats` interface defined in shared-models
        - Build passes
      </done>
    </task>

    <task id="2">
      <name>Create PipelineWizardComponent (6-step creation wizard)</name>
      <action>
        Create a standalone Angular component at
        `apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/`.

        **Wizard steps** (state machine via `currentStep: number` 1-6):
        - **Step 1 — Basic Info:** `name` (required), `description`, `active` toggle (default inactive)
        - **Step 2 — Data Schema:** Dynamic field list. Each field: name, type (string/number/date/boolean), required toggle. `[+ Add Field]` button, remove button per row. Produces `dataSchema: PipelineDataSchema`.
        - **Step 3 — Routing Rules:** List of routing rules. Each rule: name, conditions (field from step-2 schema + operator + value), target queue (temporary label — queue added in step 4). `[+ Add Rule]` button. Drag-and-drop order OR up/down arrows for rule priority. Set default/fallback route (queue label or "Reject" or "Hold").
        - **Step 4 — Queue Assignment:** List of queues to create. Each queue: name, description, priority (1-10), required skills (multi-select from routing skills API), max capacity. `[+ Add Queue]` button. Queue names feed back into Step 3's target queue selector.
        - **Step 5 — SLA Config:** `warningThresholdPercent` (default 80), `breachThresholdPercent` (default 100), `escalationAction` (select: escalate_priority / move_to_dlq / notify), `defaultHandleTimeMs`, `maxQueueWaitMs`.
        - **Step 6 — Review:** Summary of all steps. Shows pipeline name, schema fields count, routing rules count, queues list, SLA thresholds. `[Validate Config]` button calls `PipelineApiService.validatePipeline()` with a synthetic sample task built from the schema fields. Shows validation result (success/errors). Two submit buttons: `[Save as Draft]` (active=false) and `[Activate Pipeline]` (active=true).

        **State:** Single `wizardState` object holding the full form state across steps.
        **Navigation:** `[Next]` validates current step before advancing. `[Back]` always allowed.
        **Progress indicator:** Step numbers at top (1–6) with labels.

        **Component class features:**
        - `ChangeDetectionStrategy.OnPush`
        - `currentStep = signal(1)` (Angular signals for step)
        - `wizardState = signal&lt;WizardState&gt;({...})` or use `BehaviorSubject` + async pipe
        - Step validation method per step (`validateStep(step): string[]` returns errors)
        - `submit(active: boolean)` calls `PipelineApiService.createPipeline()` then creates
          queues and routing rules in sequence, then navigates to `/admin/pipelines`

        **Output:** On successful creation, emits a success toast and navigates to pipeline detail.
        On error, shows error message inline.

        Use `FormArray` for schema fields and queues. Use `ReactiveFormsModule`.

        Create a basic spec file testing: step rendering, next/back navigation, step 1 validation.
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.ts
        apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.html
        apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.scss
        apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.spec.ts
      </files>
      <verify>npx nx build agent-workspace &amp;&amp; npx nx test agent-workspace --testFile=pipeline-wizard.component.spec.ts</verify>
      <done>
        - Component renders all 6 steps with correct form fields
        - [Next] button validates before advancing (step 1: name required)
        - [Back] always works
        - Step 6 review shows summary of all entered data
        - [Validate Config] triggers API call (can be mocked in spec)
        - [Save as Draft] and [Activate Pipeline] create pipeline + queues + routing rules via API
        - Component builds without TypeScript errors
        - Spec passes
      </done>
    </task>

    <task id="3">
      <name>Create QueueConfigPanelComponent (dedicated queue CRUD panel)</name>
      <action>
        Create a standalone Angular component at
        `apps/agent-workspace/src/app/features/admin/components/queue-config-panel/`.

        **Purpose:** Standalone panel for managing queues within a pipeline. Used in:
        1. Pipeline detail view (replacing the existing inline queue form in PipelinesComponent)
        2. Future use as a dedicated queue management route

        **Inputs:**
        - `@Input() pipelineId: string` — which pipeline owns these queues
        - `@Input() queues: PipelineQueue[]` — current queues list
        - `@Output() queuesChanged = new EventEmitter&lt;PipelineQueue[]&gt;()`

        **Features:**
        - Queue list with real-time depth from `PipelineApiService.getQueueStats(queueId)` — show depth and agent count as live badges (poll every 30s or via WebSocket)
        - Create queue form: name, description, priority (1-10 number input), required skills (multi-select), max capacity (number)
        - Edit existing queue (inline edit mode on row click)
        - Delete queue with confirmation dialog
        - SLA config per queue: `warningThresholdPercent`, `breachThresholdPercent`
        - Visual queue health indicator (healthy/warning/critical) based on stats

        **State management:**
        - `queues$ = new BehaviorSubject&lt;PipelineQueue[]&gt;([])` (synced from input)
        - `queueStats$ = new BehaviorSubject&lt;Map&lt;string, QueueStats&gt;&gt;(new Map())`
        - Use `takeUntil(this.destroy$)` for all subscriptions

        **Change detection:** `OnPush`

        **Skills data:** Inject `SkillApiService` to load available skills for the multi-select.
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/queue-config-panel/queue-config-panel.component.ts
        apps/agent-workspace/src/app/features/admin/components/queue-config-panel/queue-config-panel.component.html
        apps/agent-workspace/src/app/features/admin/components/queue-config-panel/queue-config-panel.component.scss
      </files>
      <verify>npx nx build agent-workspace</verify>
      <done>
        - Component renders queue list with depth badges
        - Create form validates name (required) and priority (1-10 range)
        - Edit mode opens inline form pre-filled with queue data
        - Delete shows confirmation before calling `deleteQueue()`
        - Required skills multi-select shows available skills from API
        - `queuesChanged` emits after any CRUD operation
        - Builds without TypeScript errors
      </done>
    </task>

    <task id="4">
      <name>Update PipelinesComponent to launch wizard and use QueueConfigPanel</name>
      <action>
        In `apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.ts`:

        1. **Replace the inline pipeline create form** with a button `[+ Create Pipeline]` that
           navigates to `/admin/pipelines/new` (the wizard route). Remove the `createPipelineForm`
           from this component; it's now in the wizard.

        2. **Replace the inline queue editor** in detail view with `&lt;app-queue-config-panel&gt;`.
           Pass `[pipelineId]="selectedPipeline.id"` and `[queues]="selectedPipelineQueues"`.
           Listen to `(queuesChanged)` to refresh queue list.

        3. **Enhance routing rule editor** with the following improvements (P3-020 to P3-023):
           - Add "Default/Fallback Route" field below the rules list: dropdown of queues or
             "Reject (drop task)" / "Hold (keep in DLQ)". Maps to `defaultRouting.action` on
             the pipeline's routing config.
           - Add "Test with Sample Data" button that opens an inline panel:
             - JSON textarea for sample task data (pre-filled with pipeline schema field names)
             - [Run Test] button calls `PipelineApiService.validatePipeline(pipelineId, { sampleTask })`
             - Shows result: target queue matched, routing rule name, any errors
           - Condition tree remains flat (field + operator + value per condition, AND logic)
             consistent with existing implementation. No nested groups in this phase.

        4. **Update the pipeline edit form** (name, description, work types) to call
           `snapshotPipeline` implicitly (backend handles this on `updatePipeline` after task 5
           of plan 1-1). Add a "Version History" tab in the detail view showing
           `PipelineApiService.getPipelineVersions()` with a `[Rollback]` button per version.
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.ts
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.html
      </files>
      <verify>npx nx build agent-workspace &amp;&amp; npx nx lint agent-workspace</verify>
      <done>
        - `[+ Create Pipeline]` navigates to `/admin/pipelines/new` (no inline form)
        - Queue section uses `QueueConfigPanelComponent` instead of inline form
        - Routing rule section has "Default Route" dropdown + "Test with Sample Data" panel
        - Version History tab shows pipeline versions with rollback button
        - Build and lint pass
      </done>
    </task>

    <task id="5">
      <name>Register wizard route in admin routing module</name>
      <action>
        In `apps/agent-workspace/src/app/features/admin/admin.routes.ts`, add:

        ```typescript
        {
          path: 'pipelines/new',
          component: PipelineWizardComponent,
          canActivate: [designerGuard],
          data: { breadcrumb: 'New Pipeline', title: 'Create Pipeline' }
        }
        ```

        This route must appear **before** `{ path: 'pipelines', component: PipelinesComponent }`
        to avoid `new` being matched as a pipeline ID.

        Also update the sidebar navigation (if it has a hardcoded link for pipelines) to ensure
        `[+ Create]` links go to `/admin/pipelines/new`.

        Check `apps/agent-workspace/src/app/shared/components/layout/` for the sidebar component
        and update navigation items if the pipelines link is listed there.
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/admin.routes.ts
        apps/agent-workspace/src/app/shared/components/layout/ (if sidebar needs update)
      </files>
      <verify>npx nx build agent-workspace</verify>
      <done>
        - Navigating to `/admin/pipelines/new` loads `PipelineWizardComponent`
        - `designerGuard` protects the route
        - No route conflicts (new before :id)
        - Build passes
      </done>
    </task>

    <task id="6">
      <name>Commit pipeline wizard, queue config panel, and routing enhancements</name>
      <action>
        Stage and commit all frontend changes:
        ```
        feat(workspace): add pipeline creation wizard, queue config panel, and routing rule editor enhancements
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

  <dependencies>Plan 1-1 must complete before this plan (validation endpoint, metrics endpoint, versioning API).</dependencies>
</plan>
