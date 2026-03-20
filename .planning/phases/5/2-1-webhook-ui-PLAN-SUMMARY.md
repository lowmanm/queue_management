## Execution Summary: Webhook Config UI

**Status:** Complete
**Tasks:** 4/4
**Date:** 2026-03-20

**Commits:**
- `e770ca7` feat(workspace): add WebhookApiService for webhook endpoint management
- `60dd32d` feat(workspace): add WebhooksComponent with endpoint management and delivery log
- `e80dbf6` feat(workspace): wire /admin/webhooks route and sidebar nav item
- `30ddbac` feat(workspace): add Callbacks step to pipeline wizard for outbound webhook config

---

### What Was Built

- **`WebhookApiService`** — HTTP client with 6 methods: listEndpoints, createEndpoint, deleteEndpoint, toggleStatus, regenerateToken, getDeliveries
- **`WebhooksComponent`** — Standalone OnPush component at `/admin/webhooks`:
  - Endpoint list table with Copy URL / Enable / Regen Token / Delete actions
  - Inline create form (name + pipeline dropdown)
  - Delivery log panel (shown when endpoint is selected) with pagination
  - Secret reveal banner (shown once after create or regenerate token)
- **Route `/admin/webhooks`** registered in `admin.routes.ts` with `designerGuard`
- **Sidebar nav item** "Webhooks" added to Configuration section in `app-shell.component.ts`
- **Breadcrumb mapping** for `webhooks` → "Webhook Endpoints"
- **Pipeline wizard Callbacks step** (step 6, Review pushed to step 7):
  - `callbackUrl` optional URL input
  - `callbackEvents` checkboxes: task.completed, task.dlq, sla.breach
  - Validation: both empty OR both filled (URL + at least one event)
  - `callbackUrl`/`callbackEvents` included in pipeline create payload when configured
  - Callbacks config shown in Review step summary

---

### Files Created

- `apps/agent-workspace/src/app/features/admin/services/webhook-api.service.ts`
- `apps/agent-workspace/src/app/features/admin/services/webhook-api.service.spec.ts`
- `apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.ts`
- `apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.html`
- `apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.scss`
- `apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.spec.ts`

---

### Files Modified

- `apps/agent-workspace/src/app/features/admin/admin.routes.ts` — added `/admin/webhooks` route
- `apps/agent-workspace/src/app/shared/components/layout/app-shell.component.ts` — added Webhooks nav item + breadcrumb
- `apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.ts` — added Callbacks step (step 6), totalSteps 6→7
- `apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.html` — added Callbacks step UI + Callbacks in review summary
- `apps/agent-workspace/src/app/features/admin/components/pipeline-wizard/pipeline-wizard.component.spec.ts` — updated existing test (step 6→7 for Review) + 3 new Callbacks tests

---

### Tech Debt

- agent-workspace: 0 → 0 (unchanged)
- api-server: 0 → 0 (unchanged)

---

### Test Counts

- agent-workspace: 72 → 82 (+10 tests)
- api-server: 25 → 25 (unchanged)

---

### Issues Encountered

1. **`navigator.clipboard` undefined in jsdom** — spec test for `copyUrl` could not use `vi.spyOn(navigator.clipboard, ...)`. Replaced with a URL construction assertion that doesn't require the clipboard API.
2. **`Record<string, unknown>` type conflict** — changing `createRequest` to `Record<string, unknown>` broke the `createPipeline()` call signature. Resolved by using a proper typed object with spread for optional callback fields.
