<plan>
  <name>Cross-Pipeline Routing UI &amp; Pipeline Portability</name>
  <wave>2</wave>
  <requirements>P5-024, P5-030, P5-031, P5-032, P5-033, P5-034</requirements>
  <files>
    <!-- Pipeline wizard: cross-pipeline routing action -->
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.ts   [MODIFY]
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.html [MODIFY]
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.spec.ts [MODIFY]

    <!-- Pipeline portability component (export/import/clone) -->
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.ts   [NEW]
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.html [NEW]
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.scss [NEW]
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.spec.ts [NEW]

    <!-- Frontend pipeline service: export/import/clone API calls -->
    apps/agent-workspace/src/app/features/admin/services/pipeline.service.ts          [MODIFY]
    apps/agent-workspace/src/app/features/admin/services/pipeline.service.spec.ts     [MODIFY]

    <!-- Pipelines list component: add portability actions -->
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.ts   [MODIFY]
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.html [MODIFY]

    <!-- Backend: pipeline export/import/clone endpoints -->
    apps/api-server/src/app/pipelines/pipeline.controller.ts    [MODIFY]
    apps/api-server/src/app/pipelines/pipeline.service.ts       [MODIFY]
    apps/api-server/src/app/pipelines/pipeline.service.spec.ts  [MODIFY]

    <!-- Shared models: PipelineBundle export type -->
    libs/shared-models/src/lib/pipeline.interface.ts   [MODIFY] add PipelineBundle interface
    libs/shared-models/src/lib/index.ts                [no change needed — pipeline.interface already exported]
  </files>
  <tasks>
    <task id="1">
      <name>Shared model — PipelineBundle + backend export/import/clone</name>
      <action>
        **Step A — Add PipelineBundle to shared models:**

        Add to `libs/shared-models/src/lib/pipeline.interface.ts`:
        ```typescript
        /** JSON export/import envelope for a complete pipeline configuration. */
        export interface PipelineBundle {
          exportVersion: '1';
          exportedAt: string;           // ISO timestamp
          pipeline: {
            name: string;
            description?: string;
            workTypes: string[];
            dataSchema: PipelineDataSchema[];
            sla?: PipelineSLA;
            callbackUrl?: string;
            callbackEvents?: string[];
          };
          queues: Array&lt;{
            name: string;
            priority: number;
            requiredSkills: string[];   // skill names (not IDs — portable)
            maxCapacity?: number;
          }&gt;;
          routingRules: Array&lt;{
            name: string;
            priority: number;
            conditions: RoutingCondition[];
            targetQueueName?: string;      // resolved from name on import
            targetPipelineId?: string;     // cross-pipeline (preserved as-is)
            isDefault?: boolean;
          }&gt;;
          ruleSets: Array&lt;{
            name: string;
            rules: Array&lt;{ conditions: RuleCondition[]; actions: RuleAction[] }&gt;;
          }&gt;;
        }

        export interface PipelineImportResult {
          success: boolean;
          pipelineId?: string;
          errors?: Array&lt;{ field: string; message: string }&gt;;
        }
        ```

        Import `RuleCondition`, `RuleAction` from `rule.interface.ts`.

        **Step B — Backend export/import/clone endpoints:**

        Add to `apps/api-server/src/app/pipelines/pipeline.controller.ts`:
        ```typescript
        @Get(':id/export')
        async exportPipeline(@Param('id') id: string): Promise&lt;PipelineBundle&gt;

        @Post('import')
        @HttpCode(201)
        async importPipeline(@Body() bundle: PipelineBundle): Promise&lt;PipelineImportResult&gt;

        @Post(':id/clone')
        @HttpCode(201)
        async clonePipeline(@Param('id') id: string): Promise&lt;Pipeline&gt;
        ```

        Add to `apps/api-server/src/app/pipelines/pipeline.service.ts`:

        `exportPipeline(id: string): PipelineBundle`
        - Load pipeline with queues, routing rules, and associated rule sets from repositories
        - Serialize to PipelineBundle format (use queue names instead of IDs for portability)
        - Set `exportedAt` to current timestamp

        `importPipeline(bundle: PipelineBundle): PipelineImportResult`
        - Validate bundle structure (check required fields, valid routing condition operators, valid skill names)
        - Create new pipeline entity with new UUID
        - Create queue entities with new UUIDs; build name→id map
        - Create routing rule entities — resolve `targetQueueName` to new queue IDs via map
        - Create rule set entities with new UUIDs
        - Return `{ success: true, pipelineId: newId }` or `{ success: false, errors: [...] }`

        `clonePipeline(id: string): Pipeline`
        - Load existing pipeline with all associations
        - Deep-clone with new IDs throughout
        - Set name to `${original.name} (Copy)`
        - Set status to inactive (clone starts as draft)

        Write spec additions to `pipeline.service.spec.ts`:
        - exportPipeline: bundle contains correct queue names
        - importPipeline: valid bundle → new pipeline with matching logical config
        - importPipeline: bundle with unknown skill names → validation error
        - clonePipeline: new pipeline has "(Copy)" suffix and inactive status

        Commit: `feat(models,api): add PipelineBundle model and pipeline export/import/clone endpoints`
      </action>
      <files>
        libs/shared-models/src/lib/pipeline.interface.ts
        apps/api-server/src/app/pipelines/pipeline.controller.ts
        apps/api-server/src/app/pipelines/pipeline.service.ts
        apps/api-server/src/app/pipelines/pipeline.service.spec.ts
      </files>
      <verify>
        npx nx build shared-models
        npx nx test api-server --testFile=pipeline.service.spec.ts
        npx nx run api-server:eslint:lint
        npx nx build api-server
      </verify>
      <done>
        - PipelineBundle + PipelineImportResult exported from shared-models
        - GET /api/pipelines/:id/export returns valid PipelineBundle
        - POST /api/pipelines/import creates new pipeline; returns field errors on invalid bundle
        - POST /api/pipelines/:id/clone creates copy with "(Copy)" suffix and inactive status
        - 4+ spec tests passing, build and lint clean
      </done>
    </task>

    <task id="2">
      <name>Frontend pipeline service — export/import/clone API calls</name>
      <action>
        Modify `apps/agent-workspace/src/app/features/admin/services/pipeline.service.ts`:

        Add methods:
        ```typescript
        exportPipeline(id: string): Observable&lt;PipelineBundle&gt; {
          return this.http.get&lt;PipelineBundle&gt;(`${this.base}/${id}/export`);
        }

        importPipeline(bundle: PipelineBundle): Observable&lt;PipelineImportResult&gt; {
          return this.http.post&lt;PipelineImportResult&gt;(`${this.base}/import`, bundle);
        }

        clonePipeline(id: string): Observable&lt;Pipeline&gt; {
          return this.http.post&lt;Pipeline&gt;(`${this.base}/${id}/clone`, {});
        }

        /** Trigger browser file download for a pipeline bundle JSON. */
        downloadBundle(bundle: PipelineBundle, pipelineName: string): void {
          const json = JSON.stringify(bundle, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${pipelineName.replace(/\s+/g, '-').toLowerCase()}-pipeline.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
        ```

        Imports: `PipelineBundle`, `PipelineImportResult` from `@nexus-queue/shared-models`.

        Add spec tests:
        - exportPipeline: calls GET /pipelines/:id/export
        - importPipeline: calls POST /pipelines/import with bundle body
        - clonePipeline: calls POST /pipelines/:id/clone

        Commit: `feat(workspace): add export/import/clone methods to PipelineService`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/services/pipeline.service.ts
        apps/agent-workspace/src/app/features/admin/services/pipeline.service.spec.ts
      </files>
      <verify>
        npx nx test agent-workspace --testFile=pipeline.service.spec.ts
        npx nx lint agent-workspace
      </verify>
      <done>
        - 3 new methods on PipelineService (export, import, clone)
        - downloadBundle utility method for triggering browser download
        - 3+ new spec tests passing, lint clean
      </done>
    </task>

    <task id="3">
      <name>PipelinePortabilityComponent — import/export/clone dialog</name>
      <action>
        Create `apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.ts` as a standalone `OnPush` component. This is a panel/dialog that can be triggered from the pipeline list.

        **Inputs (Angular signals):**
        - `pipelineId = input&lt;string | null&gt;(null)` — set for export/clone; null for import-only mode
        - `pipelineName = input&lt;string&gt;('')`

        **Outputs:**
        - `cloned = output&lt;Pipeline&gt;()` — emitted after successful clone
        - `imported = output&lt;Pipeline&gt;()` — emitted after successful import
        - `closed = output&lt;void&gt;()`

        **State signals:**
        - `mode = signal&lt;'idle' | 'import' | 'export' | 'clone'&gt;('idle')`
        - `importBundle = signal&lt;PipelineBundle | null&gt;(null)` — parsed from file upload
        - `importErrors = signal&lt;Array&lt;{ field: string; message: string }&gt;&gt;([])`
        - `importing = signal&lt;boolean&gt;(false)`
        - `cloning = signal&lt;boolean&gt;(false)`

        **Methods:**
        - `startExport()` — calls `pipelineService.exportPipeline(pipelineId)`, then `pipelineService.downloadBundle(bundle, pipelineName)`; shows toast "Exported."
        - `startClone()` — sets cloning=true, calls `pipelineService.clonePipeline(pipelineId)`, emits `cloned`, closes
        - `onFileSelected(event: Event)` — reads JSON file from input, parses, sets `importBundle`; validates JSON parse (catches syntax errors)
        - `submitImport()` — sets importing=true, calls `pipelineService.importPipeline(importBundle)`:
          - on success: emits `imported(pipeline)`, closes
          - on validation failure: sets `importErrors` and shows per-field messages

        **Template (`pipeline-portability.component.html`):**
        ```
        Modal panel with title "Pipeline Portability"

        [Mode Selector — 3 action cards]
        - Export: "Download this pipeline as a JSON file"
          [Export JSON button] — only shown when pipelineId is set
        - Import: "Create a new pipeline from a JSON file"
          [File input for .json files]
          [Import validation errors list]
          [Import button — disabled until file parsed]
        - Clone: "Duplicate this pipeline as a new draft"
          [Clone button with spinner] — only shown when pipelineId is set

        [Close / Cancel button]
        ```

        Write spec `pipeline-portability.component.spec.ts`:
        - Export: calls pipelineService.exportPipeline and downloadBundle
        - Clone: calls pipelineService.clonePipeline and emits cloned output
        - Import: valid JSON file → button enabled
        - Import: service returns errors → errors displayed

        Commit: `feat(workspace): add PipelinePortabilityComponent for export/import/clone`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.ts
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.html
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.scss
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.spec.ts
      </files>
      <verify>
        npx nx test agent-workspace --testFile=pipeline-portability.component.spec.ts
        npx nx lint agent-workspace
        npx nx build agent-workspace
      </verify>
      <done>
        - Standalone OnPush component with signal-based state
        - Export triggers browser download
        - Clone triggers API + emits output
        - Import: file upload → parse → validate → submit flow with per-field error display
        - 4+ tests passing, build compiles, lint 0 errors
      </done>
    </task>

    <task id="4">
      <name>Cross-pipeline routing action in pipeline wizard + portability integration in pipeline list</name>
      <action>
        **Part A — Cross-pipeline routing in Pipeline Wizard:**

        Modify `apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.ts` (Routing Rules step):

        Each routing rule row currently has a "Target Queue" dropdown. Extend the row to support two routing action types:
        - **Enqueue in Queue** (existing) — dropdown of pipeline's queues
        - **Transfer to Pipeline** (new) — dropdown of all other active pipelines (fetched via PipelineService.getAllPipelines(), filtered to exclude current)

        UI changes:
        ```typescript
        // Add to routing rule form group
        routingActionType: new FormControl&lt;'queue' | 'pipeline'&gt;('queue'),
        targetPipelineId: new FormControl&lt;string | null&gt;(null),
        ```

        Template: When `routingActionType === 'pipeline'`, show the pipeline dropdown; when `'queue'`, show the queue dropdown. Validation: one of `targetQueueId` or `targetPipelineId` must be set.

        On wizard save: set `targetPipelineId` on `RoutingRule` if action type is pipeline.

        **Part B — Portability actions in Pipelines list:**

        Modify `apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.ts` and `.html`:

        In the pipeline list table (existing), add an actions column with a "⋮" dropdown (or additional buttons) that includes:
        - Edit (existing)
        - Export JSON (new) — calls `pipelineService.exportPipeline()` + `downloadBundle()`
        - Clone (new) — calls `pipelineService.clonePipeline()`, reloads pipeline list on success
        - Delete (existing, if present)

        Add an "Import Pipeline" button in the list header that opens `PipelinePortabilityComponent` in import-only mode (pipelineId = null).

        On clone success: reload pipelines, show a toast "Pipeline cloned as '${name} (Copy)'."
        On import success: reload pipelines, show a toast "Pipeline imported."

        Write spec additions to `pipeline-wizard.component.spec.ts`:
        - Routing step: selecting "Transfer to Pipeline" shows pipeline dropdown
        - Routing step: validation fails if neither targetQueueId nor targetPipelineId set

        Commit: `feat(workspace): cross-pipeline routing UI in wizard + portability actions in pipeline list`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.ts
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.html
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.spec.ts
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.ts
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.html
      </files>
      <verify>
        npx nx test agent-workspace --testFile=pipeline-wizard.component.spec.ts
        npx nx lint agent-workspace
        npx nx build agent-workspace
      </verify>
      <done>
        - Routing rule editor supports "Transfer to Pipeline" action type with pipeline dropdown
        - targetPipelineId included in RoutingRule payload on save
        - Pipeline list has Export, Clone, Import actions
        - 2+ new wizard spec tests passing, all existing tests still pass
        - Build compiles, lint 0 errors
      </done>
    </task>
  </tasks>
  <dependencies>
    Wave 1 plan `1-1-backend-integration-core-PLAN.md` must be complete:
    - PipelineBundle and PipelineImportResult models must be in shared-models (Task 1 of this plan adds them)
    - Backend pipeline service must support cross-pipeline RoutingRule.targetPipelineId
    - Pipeline.callbackUrl/callbackEvents must be in the model

    This plan is independent of `2-1-webhook-ui-PLAN.md` — the two Wave 2 plans can execute in parallel.
  </dependencies>
</plan>
