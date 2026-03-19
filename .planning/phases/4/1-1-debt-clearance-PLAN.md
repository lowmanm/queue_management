<plan>
  <name>Wave 1 — Debt Clearance + Phase 4 Shared Models</name>
  <wave>1</wave>
  <requirements>P4-002 (partial: shared model interfaces for persistence/events/auth)</requirements>
  <files>
    <!-- Phase 4 shared model additions -->
    libs/shared-models/src/lib/audit-event.interface.ts (NEW)
    libs/shared-models/src/lib/auth.interface.ts (NEW)
    libs/shared-models/src/lib/index.ts (MODIFY — add new exports)

    <!-- api-server debt (10 errors → 0) -->
    apps/api-server/src/app/routing/routing.service.ts
    apps/api-server/src/app/tasks/tasks.service.ts
    apps/api-server/src/app/volume-loader/volume-loader.service.ts

    <!-- agent-workspace: prefer-inject (15 errors) -->
    apps/agent-workspace/src/app/core/services/agent-stats.service.ts
    apps/agent-workspace/src/app/core/services/disposition.service.ts
    apps/agent-workspace/src/app/core/services/manager-api.service.ts
    apps/agent-workspace/src/app/core/services/queue.service.ts
    apps/agent-workspace/src/app/core/services/socket.service.ts
    apps/agent-workspace/src/app/features/admin/components/users/users.component.ts
    apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.ts
    apps/agent-workspace/src/app/features/manager/components/team-dashboard/team-dashboard.component.ts
    apps/agent-workspace/src/app/features/workspace/components/action-bar/action-bar.component.ts
    apps/agent-workspace/src/app/features/workspace/components/agent-stats/agent-stats.component.ts
    apps/agent-workspace/src/app/features/workspace/components/header/header.component.ts
    apps/agent-workspace/src/app/features/workspace/components/log-viewer/log-viewer.component.ts
    apps/agent-workspace/src/app/features/workspace/components/main-stage/main-stage.component.ts
    apps/agent-workspace/src/app/features/workspace/components/sidebar/sidebar.component.ts
    apps/agent-workspace/src/app/features/workspace/workspace.component.ts
    apps/agent-workspace/src/app/shared/components/layout/page-layout.component.ts

    <!-- agent-workspace: prefer-control-flow (29 errors) -->
    apps/agent-workspace/src/app/features/admin/components/dispositions/dispositions.component.html
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.html
    apps/agent-workspace/src/app/features/admin/components/skills/skills.component.html
    apps/agent-workspace/src/app/features/admin/components/users/users.component.html
    apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.html
    apps/agent-workspace/src/app/features/admin/components/work-states/work-states.component.html
    apps/agent-workspace/src/app/features/manager/components/queue-monitor/queue-monitor.component.html
    apps/agent-workspace/src/app/features/manager/components/skill-assignments/skill-assignments.component.html
    apps/agent-workspace/src/app/features/manager/components/team-dashboard/team-dashboard.component.html
    apps/agent-workspace/src/app/features/workspace/components/action-bar/action-bar.component.html
    apps/agent-workspace/src/app/features/workspace/components/agent-stats/agent-stats.component.html
    apps/agent-workspace/src/app/features/workspace/components/log-viewer/log-viewer.component.html

    <!-- agent-workspace: ban-ts-comment (3) + no-output-native (1) -->
    apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.spec.ts

    <!-- TECH_DEBT.md update -->
    TECH_DEBT.md
  </files>
  <tasks>
    <task id="1">
      <name>Add Phase 4 shared model interfaces (AuditEvent, Auth)</name>
      <action>
        Create two new interface files in `libs/shared-models/src/lib/`:

        1. `audit-event.interface.ts`:
           - `AuditEventType` — union type covering all 11 domain event names
             (task.ingested | task.queued | task.assigned | task.accepted |
              task.rejected | task.completed | task.dlq | task.retried |
              agent.state_changed | sla.warning | sla.breach)
           - `AggregateType` — 'task' | 'agent'
           - `AuditEvent` interface: id (string), eventType (AuditEventType),
             aggregateId (string), aggregateType (AggregateType),
             payload (Record&lt;string, unknown&gt;), occurredAt (Date),
             pipelineId (string | undefined), agentId (string | undefined),
             sequenceNum (number)
           - `AuditLogQuery` interface: aggregateType?, aggregateId?, eventType?,
             startDate?, endDate?, page (number, default 1), limit (number, default 50)
           - `AuditLogResponse` interface: events (AuditEvent[]), total (number),
             page (number), limit (number)

        2. `auth.interface.ts`:
           - `LoginRequest` interface: username (string), password (string)
           - `LoginResponse` interface: accessToken (string), refreshToken (string),
             expiresIn (number), user (UserProfile from rbac.interface.ts)
           - `RefreshRequest` interface: refreshToken (string)
           - `JwtPayload` interface: sub (string), username (string), role (UserRole),
             permissions (Permission[]), iat (number), exp (number)
           - `TokenPair` interface: accessToken (string), refreshToken (string),
             expiresIn (number)

        Update `libs/shared-models/src/lib/index.ts` to export both new files.

        Add JSDoc comments on all public interfaces per project conventions.
      </action>
      <files>
        libs/shared-models/src/lib/audit-event.interface.ts
        libs/shared-models/src/lib/auth.interface.ts
        libs/shared-models/src/lib/index.ts
      </files>
      <verify>
        npx nx build shared-models
        npx nx lint shared-models (if lint target exists)
      </verify>
      <done>
        - `audit-event.interface.ts` exports AuditEventType, AggregateType, AuditEvent,
          AuditLogQuery, AuditLogResponse
        - `auth.interface.ts` exports LoginRequest, LoginResponse, RefreshRequest,
          JwtPayload, TokenPair
        - Both files exported from index.ts barrel
        - Build passes with no TypeScript errors
      </done>
    </task>

    <task id="2">
      <name>Clear pre-existing lint debt — api-server (no-case-declarations + prefer-const)</name>
      <action>
        Fix all 10 pre-existing errors in api-server. Mechanical changes only.

        **routing.service.ts** (3 errors):
        - Line 392: change `let eligible` to `const eligible`  [prefer-const]
        - Lines 471–472: wrap the `case` block body that declares variables in `{ }` braces
          so the declarations are block-scoped  [no-case-declarations]

        **tasks.service.ts** (1 error):
        - Line 124: wrap the `case` block body in `{ }` braces  [no-case-declarations]

        **volume-loader.service.ts** (6 errors):
        - Lines 1292, 1295, 1302, 1308, 1309, 1315: each `case` block that declares a
          `const`/`let` inside must be wrapped in `{ }` braces  [no-case-declarations]

        After fixing, update TECH_DEBT.md:
        - api-server errors: 10 → 0
        - Remove the three files from the api-server affected-files table
        - Add a row to the History table: Phase 4 | 2026-03-19 | 167 | 0 | Cleared no-case-declarations + prefer-const
      </action>
      <files>
        apps/api-server/src/app/routing/routing.service.ts
        apps/api-server/src/app/tasks/tasks.service.ts
        apps/api-server/src/app/volume-loader/volume-loader.service.ts
        TECH_DEBT.md
      </files>
      <verify>
        npx nx run api-server:eslint:lint
        Confirm output shows 0 errors.
      </verify>
      <done>
        - no-case-declarations errors: 9 → 0
        - prefer-const errors: 1 → 0
        - api-server total: 10 → 0
        - TECH_DEBT.md updated with new api-server baseline of 0
        - No new errors introduced
      </done>
    </task>

    <task id="3">
      <name>Clear agent-workspace: @angular-eslint/prefer-inject (15 errors)</name>
      <action>
        Migrate constructor injection to `inject()` function across 15 TypeScript files.

        Pattern for each file:
        BEFORE:
          constructor(private authService: AuthService, private router: Router) {}
        AFTER:
          private authService = inject(AuthService);
          private router = inject(Router);
          // constructor removed entirely if it had only injections

        If a constructor had other logic (e.g., super() calls, subscriptions), keep the
        constructor body and remove only the parameter-based injections — move injections
        to class field declarations.

        Add `inject` to Angular imports in each file: `import { inject } from '@angular/core';`

        Files to update (from TECH_DEBT.md affected-files list for prefer-inject):
        - apps/agent-workspace/src/app/core/services/agent-stats.service.ts
        - apps/agent-workspace/src/app/core/services/disposition.service.ts
        - apps/agent-workspace/src/app/core/services/manager-api.service.ts
        - apps/agent-workspace/src/app/core/services/queue.service.ts
        - apps/agent-workspace/src/app/core/services/socket.service.ts
        - apps/agent-workspace/src/app/features/admin/components/users/users.component.ts
        - apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.ts
        - apps/agent-workspace/src/app/features/manager/components/team-dashboard/team-dashboard.component.ts
        - apps/agent-workspace/src/app/features/workspace/components/action-bar/action-bar.component.ts
        - apps/agent-workspace/src/app/features/workspace/components/agent-stats/agent-stats.component.ts
        - apps/agent-workspace/src/app/features/workspace/components/header/header.component.ts
        - apps/agent-workspace/src/app/features/workspace/components/log-viewer/log-viewer.component.ts
        - apps/agent-workspace/src/app/features/workspace/components/main-stage/main-stage.component.ts
        - apps/agent-workspace/src/app/features/workspace/components/sidebar/sidebar.component.ts
        - apps/agent-workspace/src/app/features/workspace/workspace.component.ts
        - apps/agent-workspace/src/app/shared/components/layout/page-layout.component.ts

        Note: `inject()` must be called in the constructor context or field initializer,
        NOT inside lifecycle hooks. Ensure all usages are at class field declaration level.
      </action>
      <files>
        apps/agent-workspace/src/app/core/services/agent-stats.service.ts
        apps/agent-workspace/src/app/core/services/disposition.service.ts
        apps/agent-workspace/src/app/core/services/manager-api.service.ts
        apps/agent-workspace/src/app/core/services/queue.service.ts
        apps/agent-workspace/src/app/core/services/socket.service.ts
        apps/agent-workspace/src/app/features/admin/components/users/users.component.ts
        apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.ts
        apps/agent-workspace/src/app/features/manager/components/team-dashboard/team-dashboard.component.ts
        apps/agent-workspace/src/app/features/workspace/components/action-bar/action-bar.component.ts
        apps/agent-workspace/src/app/features/workspace/components/agent-stats/agent-stats.component.ts
        apps/agent-workspace/src/app/features/workspace/components/header/header.component.ts
        apps/agent-workspace/src/app/features/workspace/components/log-viewer/log-viewer.component.ts
        apps/agent-workspace/src/app/features/workspace/components/main-stage/main-stage.component.ts
        apps/agent-workspace/src/app/features/workspace/components/sidebar/sidebar.component.ts
        apps/agent-workspace/src/app/features/workspace/workspace.component.ts
        apps/agent-workspace/src/app/shared/components/layout/page-layout.component.ts
      </files>
      <verify>
        npx nx build agent-workspace (no TypeScript errors)
        npx nx lint agent-workspace (prefer-inject count should reach 0)
        npx nx test agent-workspace (all existing tests pass)
      </verify>
      <done>
        - @angular-eslint/prefer-inject errors: 15 → 0
        - agent-workspace total: 167 → 152
        - Build and tests pass with no regressions
      </done>
    </task>

    <task id="4">
      <name>Clear agent-workspace: prefer-control-flow (29 errors) + ban-ts-comment (3) + no-output-native (1)</name>
      <action>
        **Part A: prefer-control-flow (29 template migrations)**

        Migrate Angular structural directives to new control flow syntax in all affected HTML files.
        This is a mechanical text replacement — no logic changes.

        Patterns to apply:
        - `*ngIf="expr"` → `@if (expr) { ... }`
        - `*ngIf="expr; else tmpl"` → `@if (expr) { ... } @else { ... }` (inline the else template)
        - `*ngFor="let item of items"` → `@for (item of items; track item.id) { ... }`
          (use item.id or $index as track expression; prefer item.id when items have an id property)
        - `*ngFor="let item of items; trackBy: trackFn"` → `@for (item of items; track trackFn($index, item)) { ... }`
        - `<ng-template #tmpl>...</ng-template>` paired with ngIf else — inline the template content
          directly into `@else { }` and remove the ng-template

        IMPORTANT: Remove `CommonModule` or `NgIf`/`NgFor` imports from component `imports: []` arrays
        for any standalone component where these were the ONLY reason CommonModule was imported.
        Angular 17+ control flow is built-in and requires no imports.

        Affected HTML files (from TECH_DEBT.md):
        - dispositions.component.html
        - pipelines.component.html
        - skills.component.html
        - users.component.html
        - volume-loader.component.html
        - work-states.component.html
        - queue-monitor.component.html
        - skill-assignments.component.html
        - team-dashboard.component.html
        - action-bar.component.html
        - agent-stats.component.html
        - log-viewer.component.html

        **Part B: ban-ts-comment (3 errors)**

        File: `rule-builder.component.spec.ts`
        - Find all `// @ts-ignore` or `// @ts-nocheck` comments
        - Remove each comment AND fix the underlying type error it was suppressing
          (e.g., use proper type casts, correct property access, or TestBed setup)

        **Part C: no-output-native (1 error)**

        Find the component with `@Output() click = new EventEmitter()` (or similar native event name).
        Rename to a non-native name, e.g., `@Output() itemClick = new EventEmitter()`.
        Update all parent templates that bind to `(click)` on this component to use `(itemClick)`.

        After all fixes, update TECH_DEBT.md:
        - prefer-control-flow: 29 → 0
        - ban-ts-comment: 3 → 0
        - no-output-native: 1 → 0
        - agent-workspace total: 152 → 119
        - Remove cleared rules from the rule table
        - Remove any fully cleared files from the affected-files table
        - Add a row to the History table
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/dispositions/dispositions.component.html
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.html
        apps/agent-workspace/src/app/features/admin/components/skills/skills.component.html
        apps/agent-workspace/src/app/features/admin/components/users/users.component.html
        apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.html
        apps/agent-workspace/src/app/features/admin/components/work-states/work-states.component.html
        apps/agent-workspace/src/app/features/manager/components/queue-monitor/queue-monitor.component.html
        apps/agent-workspace/src/app/features/manager/components/skill-assignments/skill-assignments.component.html
        apps/agent-workspace/src/app/features/manager/components/team-dashboard/team-dashboard.component.html
        apps/agent-workspace/src/app/features/workspace/components/action-bar/action-bar.component.html
        apps/agent-workspace/src/app/features/workspace/components/agent-stats/agent-stats.component.html
        apps/agent-workspace/src/app/features/workspace/components/log-viewer/log-viewer.component.html
        apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.spec.ts
        TECH_DEBT.md
      </files>
      <verify>
        npx nx build agent-workspace
        npx nx lint agent-workspace (confirm prefer-control-flow → 0, ban-ts-comment → 0, no-output-native → 0)
        npx nx test agent-workspace (all tests pass)
      </verify>
      <done>
        - prefer-control-flow errors: 29 → 0
        - ban-ts-comment errors: 3 → 0
        - no-output-native errors: 1 → 0
        - agent-workspace total: 167 → 119 (−48, −29%)
        - api-server total: 10 → 0
        - TECH_DEBT.md updated: Wave 1 clearance row added to History
        - No new errors introduced in either project
      </done>
    </task>
  </tasks>
  <dependencies>None — Wave 1 is independent</dependencies>
</plan>
