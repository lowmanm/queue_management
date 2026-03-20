<plan>
  <name>Portability Completions</name>
  <wave>3</wave>
  <requirements>P6-060, P6-061, P6-062, P6-063, P6-064</requirements>
  <files>
    <!-- Shared models -->
    libs/shared-models/src/lib/rule.interface.ts
    libs/shared-models/src/lib/pipeline.interface.ts
    libs/shared-models/src/lib/index.ts

    <!-- Backend -->
    apps/api-server/src/app/rules/rules.controller.ts
    apps/api-server/src/app/services/rule-engine.service.ts
    apps/api-server/src/app/pipelines/pipeline.controller.ts
    apps/api-server/src/app/pipelines/pipeline.service.ts
    apps/api-server/src/app/pipelines/pipeline-version.service.ts

    <!-- Frontend -->
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.ts
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.html
    apps/agent-workspace/src/app/features/admin/services/rules.service.ts
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.ts
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.html
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-diff-modal.component.ts   [NEW]
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-diff-modal.component.html [NEW]
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-diff-modal.component.scss [NEW]
    apps/agent-workspace/src/app/features/admin/services/pipeline.service.ts
  </files>
  <tasks>
    <task id="1">
      <name>Rule set export/import shared models and backend endpoints</name>
      <action>
        ### Shared Model (P6-060)

        Add to `libs/shared-models/src/lib/rule.interface.ts`:
        ```typescript
        /** Standalone rule set export bundle */
        export interface RuleSetBundle {
          version: '1.0';
          exportedAt: string;      // ISO timestamp
          ruleSet: RuleSet;        // full rule set object
          rules: Rule[];           // ordered rules
        }

        export interface RuleSetImportResult {
          ruleSetId: string;
          rulesCreated: number;
        }

        export interface RuleSetImportError {
          field: string;
          message: string;
        }
        ```

        Ensure `RuleSetBundle`, `RuleSetImportResult`, `RuleSetImportError` are exported from `index.ts`.

        ### Backend Export (P6-060)

        In `RuleEngineService`, add:
        ```typescript
        async exportRuleSet(id: string): Promise<RuleSetBundle> {
          const ruleSet = await this.findRuleSetById(id);
          const rules = await this.findRulesBySetId(id);
          return {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            ruleSet,
            rules,
          };
        }
        ```

        In `RulesController`, add:
        ```typescript
        @Get('sets/:id/export')
        @Header('Content-Disposition', 'attachment; filename="rule-set.json"')
        @Header('Content-Type', 'application/json')
        async exportRuleSet(@Param('id') id: string) {
          return this.ruleEngine.exportRuleSet(id);
        }
        ```

        ### Backend Import (P6-061)

        In `RuleEngineService`, add:
        ```typescript
        async importRuleSet(bundle: RuleSetBundle): Promise<RuleSetImportResult> {
          // Validate bundle structure — throw BadRequestException with field errors if invalid
          const errors = this.validateRuleSetBundle(bundle);
          if (errors.length > 0) throw new BadRequestException({ errors });

          // Create new rule set with new UUID
          const newRuleSet = await this.createRuleSet({
            ...bundle.ruleSet,
            id: undefined,         // let TypeORM generate
            name: bundle.ruleSet.name,
            createdAt: undefined,
            updatedAt: undefined,
          });

          // Create rules with new UUIDs, referencing new rule set ID
          let rulesCreated = 0;
          for (const rule of bundle.rules) {
            await this.createRule({
              ...rule,
              id: undefined,
              ruleSetId: newRuleSet.id,
            });
            rulesCreated++;
          }
          return { ruleSetId: newRuleSet.id, rulesCreated };
        }

        private validateRuleSetBundle(bundle: unknown): RuleSetImportError[] {
          const errors: RuleSetImportError[] = [];
          if (!bundle || typeof bundle !== 'object') {
            errors.push({ field: 'bundle', message: 'Must be a JSON object' });
            return errors;
          }
          const b = bundle as Record<string, unknown>;
          if (b['version'] !== '1.0') errors.push({ field: 'version', message: 'Must be "1.0"' });
          if (!b['ruleSet'] || typeof b['ruleSet'] !== 'object') errors.push({ field: 'ruleSet', message: 'Required object' });
          if (!Array.isArray(b['rules'])) errors.push({ field: 'rules', message: 'Must be an array' });
          return errors;
        }
        ```

        Add import endpoint to `RulesController`:
        ```typescript
        @Post('sets/import')  // MUST be declared before 'sets/:id' to avoid :id matching "import"
        async importRuleSet(@Body() bundle: RuleSetBundle) {
          return this.ruleEngine.importRuleSet(bundle);
        }
        ```

        Ensure `POST /api/rules/sets/import` is declared before `POST /api/rules/sets/:id/test` and
        `GET /api/rules/sets/:id` routes to avoid NestJS route ambiguity.

        Commit: `feat(rules): add rule set export/import endpoints and shared bundle model (P6-060, P6-061)`
      </action>
      <files>
        libs/shared-models/src/lib/rule.interface.ts
        libs/shared-models/src/lib/index.ts
        apps/api-server/src/app/rules/rules.controller.ts
        apps/api-server/src/app/services/rule-engine.service.ts
      </files>
      <verify>
        npx nx build shared-models
        npx nx build api-server
        npx nx run api-server:eslint:lint
        npx nx test api-server
      </verify>
      <done>
        - `RuleSetBundle`, `RuleSetImportResult`, `RuleSetImportError` in shared-models
        - `GET /api/rules/sets/:id/export` returns JSON bundle with attachment header
        - `POST /api/rules/sets/import` creates new rule set from bundle with new UUIDs
        - Import validates structure and returns field-level errors on invalid bundle
        - Import declared before parameterised `:id` routes (no routing ambiguity)
        - 0 lint errors
        - All tests pass
      </done>
    </task>

    <task id="2">
      <name>Rule Builder export/import UI (frontend)</name>
      <action>
        ### Frontend service extension

        In `apps/agent-workspace/src/app/features/admin/services/rules.service.ts`, add:
        ```typescript
        exportRuleSet(id: string): Observable<Blob> {
          return this.http.get(`${this.apiUrl}/rules/sets/${id}/export`, { responseType: 'blob' });
        }

        importRuleSet(bundle: RuleSetBundle): Observable<RuleSetImportResult> {
          return this.http.post<RuleSetImportResult>(`${this.apiUrl}/rules/sets/import`, bundle);
        }
        ```

        ### Rule Builder Component (P6-062)

        In `rule-builder.component.ts`:
        - Add `importError = signal<string>('')`
        - Add `importSuccess = signal<string>('')`

        Add `exportRuleSet(ruleSet: RuleSet)` method:
        - Calls `this.rulesService.exportRuleSet(ruleSet.id)`
        - Creates a blob URL and triggers `<a download="rule-set-[name].json">` click
        - Pattern: `const url = URL.createObjectURL(blob); a.href = url; a.click(); URL.revokeObjectURL(url);`

        Add `onImportFile(event: Event)` method:
        - Reads selected file via `FileReader`
        - Parses JSON; calls `this.rulesService.importRuleSet(bundle)`
        - On success: reloads rule set list, shows success message with new ID
        - On error: shows validation error messages

        In `rule-builder.component.html` (in list view, beside each rule set row):
        - Add **Export JSON** button (download icon) next to existing Edit/Delete actions
          → calls `exportRuleSet(ruleSet)`
        - Add **Import JSON** button above the rule set list (header bar):
          → hidden `<input type="file" accept=".json">` triggered by button click
          → calls `onImportFile($event)` on change
        - Show import success banner: "Rule set imported — ID: [id], [N] rules created"
        - Show import error banner with validation field errors

        Commit: `feat(rule-builder): add export/import JSON UI for rule sets (P6-062)`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/services/rules.service.ts
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.ts
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.html
      </files>
      <verify>
        npx nx build agent-workspace
        npx nx lint agent-workspace
        npx nx test agent-workspace
      </verify>
      <done>
        - Export JSON button per rule set row triggers file download
        - Import JSON button opens file picker; accepts .json files
        - Successful import reloads list and shows success message
        - Failed import shows field-level validation errors
        - 0 lint errors
        - All tests pass
      </done>
    </task>

    <task id="3">
      <name>Pipeline version diff endpoint (backend)</name>
      <action>
        ### Shared Model (P6-063)

        Add to `libs/shared-models/src/lib/pipeline.interface.ts`:
        ```typescript
        export interface VersionDiffEntry {
          path: string;          // dot-notation path, e.g. "name", "queues[0].priority"
          oldValue: unknown;
          newValue: unknown;
          changeType: 'added' | 'removed' | 'changed';
        }

        export interface VersionDiffResult {
          v1Index: number;
          v2Index: number;
          v1SnapshotAt: string;
          v2SnapshotAt: string;
          entries: VersionDiffEntry[];
        }
        ```

        Export from `index.ts`.

        ### Backend diff logic (P6-063)

        In `PipelineVersionService`, add:
        ```typescript
        getDiff(versions: PipelineVersion[], v1Index: number, v2Index: number): VersionDiffResult {
          const v1 = versions[v1Index];
          const v2 = versions[v2Index];
          if (!v1 || !v2) throw new NotFoundException('Version index out of range');

          const entries = this.diffObjects(v1.config, v2.config, '');
          return {
            v1Index,
            v2Index,
            v1SnapshotAt: v1.createdAt,
            v2SnapshotAt: v2.createdAt,
            entries,
          };
        }

        private diffObjects(a: unknown, b: unknown, path: string): VersionDiffEntry[] {
          const entries: VersionDiffEntry[] = [];
          if (JSON.stringify(a) === JSON.stringify(b)) return entries;

          if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
            entries.push({ path: path || '(root)', oldValue: a, newValue: b,
              changeType: a === undefined ? 'added' : b === undefined ? 'removed' : 'changed' });
            return entries;
          }

          const aObj = a as Record<string, unknown>;
          const bObj = b as Record<string, unknown>;
          const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);

          for (const key of allKeys) {
            const childPath = path ? `${path}.${key}` : key;
            if (!(key in aObj)) {
              entries.push({ path: childPath, oldValue: undefined, newValue: bObj[key], changeType: 'added' });
            } else if (!(key in bObj)) {
              entries.push({ path: childPath, oldValue: aObj[key], newValue: undefined, changeType: 'removed' });
            } else {
              entries.push(...this.diffObjects(aObj[key], bObj[key], childPath));
            }
          }
          return entries;
        }
        ```

        In `PipelineController`, add diff endpoint:
        ```typescript
        @Get(':id/versions/diff')
        async getVersionDiff(
          @Param('id') id: string,
          @Query('v1') v1: string,
          @Query('v2') v2: string,
        ) {
          const versions = await this.pipelineService.getVersions(id);
          return this.pipelineVersionService.getDiff(versions, parseInt(v1, 10), parseInt(v2, 10));
        }
        ```

        Ensure the new `diff` route is declared before `/:id/versions/:versionId/rollback`
        to avoid route conflicts.

        Commit: `feat(pipelines): add version diff endpoint with field-level change detection (P6-063)`
      </action>
      <files>
        libs/shared-models/src/lib/pipeline.interface.ts
        libs/shared-models/src/lib/index.ts
        apps/api-server/src/app/pipelines/pipeline-version.service.ts
        apps/api-server/src/app/pipelines/pipeline.controller.ts
      </files>
      <verify>
        npx nx build shared-models
        npx nx build api-server
        npx nx run api-server:eslint:lint
        npx nx test api-server
      </verify>
      <done>
        - `VersionDiffEntry` and `VersionDiffResult` in shared-models
        - `GET /api/pipelines/:id/versions/diff?v1=:idx&v2=:idx` returns `VersionDiffResult`
        - Diff correctly identifies added, removed, changed fields at any nesting level
        - Returns 404 if version index out of range
        - 0 lint errors
        - All tests pass
      </done>
    </task>

    <task id="4">
      <name>Pipeline diff view modal (frontend)</name>
      <action>
        ### Pipeline service extension

        In `apps/agent-workspace/src/app/features/admin/services/pipeline.service.ts`, add:
        ```typescript
        getVersions(pipelineId: string): Observable<PipelineVersion[]> {
          return this.http.get<PipelineVersion[]>(`${this.apiUrl}/pipelines/${pipelineId}/versions`);
        }

        getVersionDiff(pipelineId: string, v1: number, v2: number): Observable<VersionDiffResult> {
          return this.http.get<VersionDiffResult>(
            `${this.apiUrl}/pipelines/${pipelineId}/versions/diff?v1=${v1}&v2=${v2}`
          );
        }
        ```

        ### PipelineDiffModalComponent (NEW — P6-064)

        Create `pipeline-diff-modal.component.ts`:
        - Standalone component, `ChangeDetectionStrategy.OnPush`
        - Inputs: `@Input() pipelineId: string`, `@Input() versions: PipelineVersion[]`
        - Outputs: `@Output() closed = new EventEmitter<void>()`
        - Signals: `selectedV1 = signal(0)`, `selectedV2 = signal(1)`, `diffResult = signal<VersionDiffResult | null>(null)`, `isLoading = signal(false)`, `error = signal('')`
        - `loadDiff()` method: calls `pipelineService.getVersionDiff()` with selected indices
        - Auto-triggers diff load when selectedV1 or selectedV2 change (effect or explicit button)

        Create `pipeline-diff-modal.component.html`:
        - Modal overlay with backdrop
        - Title: "Version Comparison — [pipeline name]"
        - Two version selectors (dropdowns): "Version A" (v1) and "Version B" (v2)
          - Options show version index + creation timestamp
        - "Compare" button → triggers `loadDiff()`
        - Diff table when `diffResult()` is non-null:
          - Columns: Path, Old Value (v1), New Value (v2), Change Type
          - Row background: green for added, red for removed, yellow for changed
          - Empty state: "No differences between selected versions"
        - Loading spinner + error message states
        - "Close" button → emits `closed`

        Create `pipeline-diff-modal.component.scss`:
        - Modal overlay, backdrop, table row color coding

        ### Pipelines Component Integration

        In `pipelines.component.ts`:
        - Add `showDiffModal = signal(false)`, `diffPipelineId = signal<string | null>(null)`, `diffVersions = signal<PipelineVersion[]>([])`
        - Add `openVersionDiff(pipeline: Pipeline)` method:
          - Calls `pipelineService.getVersions(pipeline.id)`
          - Sets `diffVersions`, `diffPipelineId`, `showDiffModal(true)`
        - Add `closeDiff()` method: sets `showDiffModal(false)`
        - Import `PipelineDiffModalComponent` in imports array

        In `pipelines.component.html`:
        - Add "Version Diff" button in the pipeline versions panel (beside existing rollback actions)
        - Also add a "Compare Versions" action button in the pipeline list row actions
        - Add `<app-pipeline-diff-modal>` below the versions panel, shown when `showDiffModal()` is true

        Commit: `feat(pipelines): add version diff modal UI with field-level change visualization (P6-064)`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/services/pipeline.service.ts
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-diff-modal.component.ts
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-diff-modal.component.html
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-diff-modal.component.scss
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.ts
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.html
      </files>
      <verify>
        npx nx build agent-workspace
        npx nx lint agent-workspace
        npx nx test agent-workspace
      </verify>
      <done>
        - `PipelineDiffModalComponent` standalone component created
        - Version A/B dropdowns populate from pipeline version history
        - "Compare" button loads diff from `GET /api/pipelines/:id/versions/diff`
        - Diff table shows path, old value, new value, change type with color coding
        - No-differences empty state handled
        - Modal dismissable via "Close" button
        - Pipelines component integrates the modal with "Compare Versions" trigger
        - 0 lint errors
        - All tests pass
      </done>
    </task>
  </tasks>
  <dependencies>
    Wave 1 (1-1-platform-hardening) must complete first.
    Wave 2 plans (2-1-observability-alerting, 2-2-storage-connectors) should complete before Wave 3,
    though 3-1-portability-completions has no direct code dependency on them.
  </dependencies>
</plan>
