<plan>
  <name>Rule Builder UI — Rule Set Management, Condition/Action Editor, and Testing</name>
  <wave>2</wave>
  <requirements>P3-010, P3-011, P3-012, P3-013, P3-014</requirements>

  <files>
    <!-- RulesService — add test method -->
    apps/agent-workspace/src/app/features/admin/services/rules.service.ts

    <!-- New: Rule Builder component (list view + editor) -->
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.ts
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.html
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.scss
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.spec.ts

    <!-- New: Rule Editor sub-component (single rule: conditions + actions) -->
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-editor/rule-editor.component.ts
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-editor/rule-editor.component.html
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-editor/rule-editor.component.scss

    <!-- New: Rule Set Test Dialog component -->
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-set-test/rule-set-test.component.ts
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-set-test/rule-set-test.component.html
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-set-test/rule-set-test.component.scss

    <!-- Admin routing — add rule-sets route -->
    apps/agent-workspace/src/app/features/admin/admin.routes.ts

    <!-- Sidebar — add Rule Sets nav link -->
    apps/agent-workspace/src/app/shared/components/layout/ (sidebar component)
  </files>

  <tasks>
    <task id="1">
      <name>Add RulesService.testRuleSet() method</name>
      <action>
        In `apps/agent-workspace/src/app/features/admin/services/rules.service.ts`, add:

        ```typescript
        testRuleSet(ruleSetId: string, sampleTask: Record&lt;string, unknown&gt;): Observable&lt;RuleSetTestResponse&gt; {
          const request: RuleSetTestRequest = { sampleTask };
          return this.http.post&lt;RuleSetTestResponse&gt;(
            `${this.apiUrl}/rules/sets/${ruleSetId}/test`,
            request
          );
        }
        ```

        Import `RuleSetTestRequest`, `RuleSetTestResponse` from `@nexus-queue/shared-models`.

        Also verify existing service methods cover the full Rule API surface:
        - `getRuleSets()`, `getRuleSet(id)`, `createRuleSet(rs)`, `updateRuleSet(id, rs)`, `deleteRuleSet(id)`
        - `getFieldConfigs()`, `getActionConfigs()`, `getOperatorConfigs()`

        If any of these are missing, add them.
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/services/rules.service.ts
      </files>
      <verify>npx nx build agent-workspace</verify>
      <done>
        - `testRuleSet(ruleSetId, sampleTask)` method exists and returns `Observable&lt;RuleSetTestResponse&gt;`
        - All CRUD methods exist
        - Build passes
      </done>
    </task>

    <task id="2">
      <name>Create RuleEditorComponent (single rule: condition groups + actions)</name>
      <action>
        Create standalone component at `.../rule-builder/rule-editor/rule-editor.component.ts`.

        **Inputs:**
        - `@Input() rule: Rule` — the rule being edited
        - `@Input() availableFields: FieldConfig[]` — from RulesService
        - `@Input() availableOperators: OperatorConfig[]` — from RulesService
        - `@Input() availableActions: ActionConfig[]` — from RulesService
        - `@Output() ruleChanged = new EventEmitter&lt;Rule&gt;()`

        **Condition section:**
        - Displays a flat list of conditions (single ConditionGroup, no nesting in v1)
        - Logic selector: AND / OR (applied to all conditions in the group)
        - Per condition row: field selector (dropdown from `availableFields`) → operator selector
          (filtered by field type via the type metadata on FieldConfig) → value input
          (text, number, or multi-value for `in`/`not_in` operators with comma-separated or tag input)
        - `[+ Add Condition]` button appends a new empty condition row
        - `[×]` button removes a condition row
        - Supports all 15 condition operators from `rule.interface.ts`:
          equals, not_equals, greater_than, less_than, greater_or_equal, less_or_equal,
          contains, not_contains, starts_with, ends_with, in, not_in,
          is_empty, is_not_empty, matches_regex
        - For `in`/`not_in`: value is a comma-separated tag input (split into string[])
        - For `is_empty`/`is_not_empty`: no value input shown (value not needed)

        **Actions section:**
        - List of actions with up/down arrows for ordering (P3-013 — no drag-and-drop, just buttons)
        - `[+ Add Action]` button appends new action row
        - Per action row: action type selector (dropdown from `availableActions`) → value input
          (type-specific: number for set_priority/adjust_priority, text for set_queue/add_skill,
          key+value for set_metadata)
        - `[×]` removes an action
        - `[↑]` / `[↓]` reorders actions (swap adjacent)
        - Action types to support:
          - `set_priority`: number input (1-10)
          - `adjust_priority`: signed number input (-5 to +5)
          - `set_queue`: text input (queue name or ID)
          - `add_skill`: text input (skill name)
          - `remove_skill`: text input (skill name)
          - `set_timeout`: number input (milliseconds)
          - `set_metadata`: key input + value input (two fields)
          - `stop_processing`: no value input (checkbox/toggle to include)

        **Change detection:** `OnPush`. Emit `ruleChanged` on any condition/action change.

        Use `ReactiveFormsModule` with `FormGroup` containing `FormArray` for conditions and actions.
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-editor/rule-editor.component.ts
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-editor/rule-editor.component.html
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-editor/rule-editor.component.scss
      </files>
      <verify>npx nx build agent-workspace</verify>
      <done>
        - Component renders condition rows with field/operator/value selectors
        - Operator dropdown filters by field type (e.g., string field shows string operators)
        - `is_empty`/`is_not_empty` hide value input
        - `in`/`not_in` show comma-separated/tag value input
        - Actions list renders with type selector and type-appropriate value input
        - Up/down arrows swap action order
        - `ruleChanged` emits on every change
        - Build passes
      </done>
    </task>

    <task id="3">
      <name>Create RuleSetTestComponent (sample data testing dialog)</name>
      <action>
        Create standalone component at `.../rule-builder/rule-set-test/rule-set-test.component.ts`.

        **Purpose:** Allow designers to test a rule set against sample task data and see the before/after.

        **Inputs:**
        - `@Input() ruleSetId: string`
        - `@Input() ruleSetName: string`
        - `@Output() closed = new EventEmitter&lt;void&gt;()`

        **Layout (modal-style panel, displayed as overlay):**
        ```
        ┌─────────────────────────────────────────────────────────┐
        │  Test Rule Set: [ruleSetName]                       [×] │
        ├─────────────────┬───────────────────────────────────────┤
        │  Sample Task    │  Results                              │
        │  (JSON editor)  │  ┌──────────┬──────────┐             │
        │                 │  │ Before   │ After    │             │
        │  {              │  │ {        │ {        │             │
        │    "field": ""  │  │   ...    │   ...    │             │
        │  }              │  │ }        │ }        │             │
        │                 │  └──────────┴──────────┘             │
        │  [Run Test]     │  Rules evaluated:                     │
        │                 │  ✅ Rule 1: matched (2 actions)       │
        │                 │  ❌ Rule 2: no match                  │
        │                 │  ⚠️  stopped at Rule 3               │
        └─────────────────┴───────────────────────────────────────┘
        ```

        **Behavior:**
        - Sample task textarea: JSON textarea (validate JSON on change, show parse error if invalid)
        - `[Run Test]` calls `RulesService.testRuleSet(ruleSetId, parsedSampleTask)`
        - On success: populate Before (original JSON) and After (modified JSON) panels side by side
        - Show `rulesEvaluated` list with:
          - ✅ green: matched, list `actionsApplied` count
          - ❌ red: no match
          - ⚠️ yellow badge: `stoppedAt` rule name
        - Show diff highlighting between Before and After JSON (changed keys highlighted in yellow)
        - Loading state while API call in progress
        - Error state if API returns error

        **State:** Local component state (no service injection beyond RulesService).
        **Change detection:** `OnPush`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-set-test/rule-set-test.component.ts
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-set-test/rule-set-test.component.html
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-set-test/rule-set-test.component.scss
      </files>
      <verify>npx nx build agent-workspace</verify>
      <done>
        - Component renders sample task textarea (JSON)
        - JSON parse error shown on invalid input
        - [Run Test] calls `RulesService.testRuleSet()` and shows loading state
        - Before/After panels show task state as formatted JSON
        - Rules evaluated list shows ✅/❌/⚠️ per rule
        - Changed keys highlighted in After panel
        - Builds without TypeScript errors
      </done>
    </task>

    <task id="4">
      <name>Create RuleBuilderComponent (main rule set list + editor)</name>
      <action>
        Create standalone component at `.../rule-builder/rule-builder.component.ts`.

        **View modes:** `list` | `edit`

        **List view:**
        - Table of rule sets: name, description, rules count, scope (workTypes/queues), last modified
        - `[+ New Rule Set]` button → switches to edit view with empty rule set
        - Click rule set row → switches to edit view pre-loaded with that rule set
        - `[Test]` button per row → opens `RuleSetTestComponent` overlay
        - `[Delete]` button per row → confirm dialog then `RulesService.deleteRuleSet(id)`

        **Edit view:**
        - **Rule Set metadata form:** name (required), description, scope (optional: workType list,
          queue list — comma-separated or multi-select)
        - **Rules list:** Ordered list of rules. Each rule shows: rule name, conditions count,
          actions count, enabled toggle.
          - Up/down arrows to reorder rules (P3-013)
          - `[+ Add Rule]` button appends blank rule at bottom
          - `[Edit]` expands inline `RuleEditorComponent` for that rule
          - `[Delete Rule]` removes rule from list
          - `[Duplicate Rule]` clones rule to bottom of list
        - **Rule expansion:** When `[Edit]` clicked, `RuleEditorComponent` expands below the rule
          row (accordion pattern). Editing in the rule editor updates the rule in the parent list
          via `(ruleChanged)` output.
        - **Footer:** `[Save Rule Set]` calls create or update API. `[Cancel]` returns to list.

        **State:**
        - `ruleSets$ = this.rulesService.ruleSets$` for list view
        - `editingRuleSet: RuleSet | null` for edit view (deep copy to avoid mutation)
        - `availableFields$`, `availableOperators$`, `availableActions$` from service

        **Loading configuration on init:**
        ```typescript
        ngOnInit() {
          this.rulesService.loadConfiguration(); // loads fields, operators, actions into BehaviorSubjects
          this.rulesService.getRuleSets().subscribe(...);
        }
        ```

        **Change detection:** `OnPush`. Use `async` pipe in template.

        Create spec file testing: list renders rule sets, clicking New Rule Set enters edit mode.
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.ts
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.html
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.scss
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.spec.ts
      </files>
      <verify>npx nx build agent-workspace &amp;&amp; npx nx test agent-workspace --testFile=rule-builder.component.spec.ts</verify>
      <done>
        - List view shows rule set table with name, rules count, scope
        - `[+ New Rule Set]` switches to edit view
        - Row click loads that rule set in edit view
        - `[Test]` opens RuleSetTestComponent overlay
        - `[Delete]` confirms and deletes
        - Edit view: metadata form + ordered rules list
        - Up/down arrows reorder rules
        - `[Edit]` expands RuleEditorComponent accordion per rule
        - `[Save Rule Set]` calls create or update API
        - Spec passes
      </done>
    </task>

    <task id="5">
      <name>Register rule-sets route in admin routing and add sidebar link</name>
      <action>
        In `apps/agent-workspace/src/app/features/admin/admin.routes.ts`, add:

        ```typescript
        {
          path: 'rule-sets',
          component: RuleBuilderComponent,
          canActivate: [designerGuard],
          data: { breadcrumb: 'Rule Sets', title: 'Rule Builder' }
        }
        ```

        In the sidebar component (find the admin navigation section), add a link:
        - Label: "Rule Sets"
        - Icon: use an existing icon that fits (rules/filter/logic style)
        - Route: `/admin/rule-sets`
        - Visibility: same as other designer routes (designer or admin role)

        Find sidebar component path by checking `apps/agent-workspace/src/app/shared/components/layout/`
        and looking for the navigation configuration array (usually an array of `NavItem` objects
        with path, label, icon, roles).
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/admin.routes.ts
        apps/agent-workspace/src/app/shared/components/layout/ (sidebar component)
      </files>
      <verify>npx nx build agent-workspace</verify>
      <done>
        - Navigating to `/admin/rule-sets` loads `RuleBuilderComponent`
        - `designerGuard` protects the route
        - Sidebar shows "Rule Sets" link under Configuration section for designer/admin roles
        - Build passes
      </done>
    </task>

    <task id="6">
      <name>Commit Rule Builder UI</name>
      <action>
        Stage and commit all rule builder changes:
        ```
        feat(workspace): add rule builder UI with condition/action editor and rule set testing
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

  <dependencies>Plan 1-1 must complete before this plan (rule set testing endpoint required for RuleSetTestComponent).</dependencies>
</plan>
