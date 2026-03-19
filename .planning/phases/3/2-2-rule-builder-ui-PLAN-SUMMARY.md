## Execution Summary: Rule Builder UI

**Status:** Complete
**Tasks:** 6/6
**Commits:** `5a778bc feat(workspace): add rule builder UI with condition/action editor and rule set testing`

### What Was Built

- `RulesService.testRuleSet()` — calls `POST /api/rules/sets/:id/test` and returns `Observable<RuleSetTestResponse>`
- `RuleEditorComponent` — standalone Angular component with ReactiveFormsModule `FormArray` for conditions and actions:
  - Condition rows: field selector → operator selector (filtered by field type) → value input (text/array/hidden)
  - `is_empty`/`is_not_empty` operators hide value input
  - `in`/`not_in` operators show comma-separated tag input
  - Action rows: type selector → type-specific value input (number for priorities/timeout, key+value for metadata, hidden for stop_processing)
  - Up/down arrow buttons for action reordering (swap adjacent)
  - `ruleChanged` EventEmitter fires on any change
  - `OnPush` change detection
- `RuleSetTestComponent` — overlay modal with:
  - JSON textarea for sample task input with parse error validation
  - `[Run Test]` button with loading state
  - Before/After diff table (changed keys highlighted in yellow)
  - Rules evaluated list with ✅/❌/⚠️ per rule
  - `OnPush` change detection
- `RuleBuilderComponent` — main list/edit component with:
  - List view: table with name, rules count, scope, status, last modified; Test/Edit/Delete per row
  - Edit view: metadata form (name, description, work types, queues, enabled toggle)
  - Ordered rules list with inline name editing, up/down arrows, enable toggle, accordion `RuleEditorComponent`
  - Duplicate rule action
  - Save creates or updates via `RulesService`
  - 15 unit tests
- Admin route `/admin/rule-sets` — registered with `designerGuard`
- Sidebar — "Rule Sets" link with filter/document icon under Configuration section for designer/admin roles

### Files Created

- `apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.ts`
- `apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.html`
- `apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.scss`
- `apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.spec.ts`
- `apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-editor/rule-editor.component.ts`
- `apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-editor/rule-editor.component.html`
- `apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-editor/rule-editor.component.scss`
- `apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-set-test/rule-set-test.component.ts`
- `apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-set-test/rule-set-test.component.html`
- `apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-set-test/rule-set-test.component.scss`

### Files Modified

- `apps/agent-workspace/src/app/features/admin/services/rules.service.ts` — added `testRuleSet()` method and imported `RuleSetTestRequest`, `RuleSetTestResponse`
- `apps/agent-workspace/src/app/features/admin/admin.routes.ts` — added `rule-sets` route
- `apps/agent-workspace/src/app/shared/components/layout/app-shell.component.ts` — added Rule Sets nav item, breadcrumb mapping
- `apps/agent-workspace/src/app/shared/components/layout/app-shell.component.html` — added `rules` icon case to switch

### Issues Encountered

- `$spacing-7` variable doesn't exist in variables.scss — replaced with `$spacing-8`
- `darken()` SCSS function deprecated — replaced with `$color-primary-dark` variable
- Two accessibility lint errors in `rule-set-test.component.html` (click without keyboard) — fixed by adding `role="presentation"`, `tabindex="-1"`, and `(keydown.escape)` to overlay, and removing the inner div's `click.stopPropagation` which was redundant since the overlay was redesigned
- One label lint error in `rule-editor.component.html` — fixed by adding `for` attribute and `id` to the logic select
