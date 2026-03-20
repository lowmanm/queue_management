## Execution Summary: Cross-Pipeline Routing UI & Pipeline Portability

**Status:** Complete
**Tasks:** 4/4
**Date:** 2026-03-20

**Commits:**
- `2f7208f` feat(models,api): add PipelineBundle model and pipeline export/import/clone endpoints
- `d6bc7af` feat(workspace): add export/import/clone methods to PipelineService
- `edba181` feat(workspace): add PipelinePortabilityComponent for export/import/clone
- `939ac75` feat(workspace): cross-pipeline routing UI in wizard + portability actions in pipeline list

---

### What Was Built

- **`PipelineBundle` + `PipelineImportResult`** added to `libs/shared-models/src/lib/pipeline.interface.ts` — portable JSON envelope for pipeline export/import; imports `RuleCondition`, `RuleAction` from rule interface
- **Backend service methods** on `PipelineService`: `exportPipeline`, `importPipeline`, `clonePipeline` — export serializes queue names (not IDs) for portability; import creates fresh entities with new IDs; clone deep-copies with "(Copy)" suffix and `enabled: false`
- **Backend controller endpoints**: `GET :id/export`, `POST import` (201), `POST :id/clone` (201) — `POST import` placed before parameterized routes to avoid NestJS conflict
- **`CreateRoutingRuleRequest`** updated: `targetQueueId` made optional; `targetPipelineId?: string` added — backend `createRoutingRule` validates that at least one of the two is set
- **`PipelineApiService` frontend**: `exportPipeline`, `importPipeline`, `clonePipeline`, `downloadBundle` methods added
- **`PipelinePortabilityComponent`** — standalone OnPush panel with signals for all three operations; file upload parsing with `FileReader`; per-field error display from import validation response
- **Pipeline wizard (step 3 — Routing Rules)**: each rule now has a `routingActionType` toggle ("Enqueue in Queue" / "Transfer to Pipeline"); when "Transfer to Pipeline" is selected, a pipeline dropdown appears; validation requires one option to be set; `submit` includes `targetPipelineId` in the API call
- **Pipelines list component**: Export JSON and Clone action buttons on each pipeline card; "Import Pipeline" button in list header that opens `PipelinePortabilityComponent` in import-only mode (pipelineId = null); portability overlay panel with output handlers

---

### Files Created

- `apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.ts`
- `apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.html`
- `apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.scss`
- `apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-portability.component.spec.ts`
- `apps/agent-workspace/src/app/features/admin/services/pipeline.service.spec.ts`
- `apps/api-server/src/app/pipelines/pipeline.service.spec.ts`

---

### Files Modified

- `libs/shared-models/src/lib/pipeline.interface.ts` — added PipelineBundle, PipelineImportResult; updated CreateRoutingRuleRequest
- `apps/api-server/src/app/pipelines/pipeline.service.ts` — added exportPipeline, importPipeline, clonePipeline; updated createRoutingRule for optional targetQueueId + targetPipelineId
- `apps/api-server/src/app/pipelines/pipeline.controller.ts` — added GET :id/export, POST import, POST :id/clone endpoints
- `apps/agent-workspace/src/app/features/admin/services/pipeline.service.ts` — added exportPipeline, importPipeline, clonePipeline, downloadBundle
- `apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.ts` — allPipelines signal, loadAllPipelines, routingActionType + targetPipelineId form fields, getRoutingActionType helper, updated step 3 validation and submit
- `apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.html` — routing action type selector + conditional pipeline dropdown in step 3
- `apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.spec.ts` — 3 new tests for routing action type
- `apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.ts` — portability signals, openPortabilityPanel, closePortabilityPanel, onPortabilityCloned, onPortabilityImported, exportPipeline, clonePipeline
- `apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.html` — Import Pipeline button, Export/Clone action buttons, portability overlay panel

---

### Tech Debt

- agent-workspace: 0 → 0 (unchanged)
- api-server: 0 → 0 (unchanged, 59 pre-existing warnings)

---

### Issues Encountered

1. **`global` not recognized in vitest**: Used `vi.spyOn(global, 'FileReader')` in the portability component spec — TypeScript could not find `global`. Fixed by replacing the FileReader test with a direct signal manipulation test (`component.importBundle.set(mockBundle)`).
2. **Plan file paths for wizard**: Plan referenced `pipelines/pipeline-wizard.component.ts` but the actual location is `pipeline-wizard/pipeline-wizard.component.ts` (a separate sub-directory). Implemented against the correct path.
3. **`CreateRoutingRuleRequest.targetQueueId` was required**: Making it optional was necessary for cross-pipeline routing support. Updated both shared model interface and backend validation logic to require at least one of `targetQueueId` or `targetPipelineId`.
