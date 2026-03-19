<plan>
  <name>Wave 3 — Authentication + Monitoring + Production Deploy + Accessibility Debt Clearance</name>
  <wave>3</wave>
  <requirements>P4-030, P4-031, P4-032, P4-033, P4-034, P4-040, P4-041, P4-042, P4-050, P4-051, P4-052, P4-053</requirements>
  <files>
    <!-- Auth backend -->
    apps/api-server/src/app/auth/auth.module.ts (NEW)
    apps/api-server/src/app/auth/auth.controller.ts (NEW)
    apps/api-server/src/app/auth/auth.service.ts (NEW)
    apps/api-server/src/app/auth/jwt.strategy.ts (NEW)
    apps/api-server/src/app/auth/jwt-auth.guard.ts (NEW)
    apps/api-server/src/app/auth/public.decorator.ts (NEW)
    apps/api-server/src/app/auth/index.ts (NEW)
    apps/api-server/src/app/app.module.ts
    apps/api-server/src/main.ts (global guard registration)

    <!-- Frontend auth update -->
    apps/agent-workspace/src/app/core/services/auth.service.ts
    apps/agent-workspace/src/app/features/login/login.component.ts
    apps/agent-workspace/src/app/features/login/login.component.html
    apps/agent-workspace/src/app/core/guards/auth.guard.ts

    <!-- Monitoring -->
    apps/api-server/src/app/monitoring/metrics.module.ts (NEW)
    apps/api-server/src/app/monitoring/metrics.service.ts (NEW)
    apps/api-server/src/app/monitoring/metrics.controller.ts (NEW)
    apps/api-server/src/app/monitoring/health.controller.ts (NEW)
    apps/api-server/src/app/monitoring/index.ts (NEW)
    apps/api-server/src/app/app.module.ts (add MonitoringModule)

    <!-- Metric instrumentation callsites -->
    apps/api-server/src/app/services/queue-manager.service.ts
    apps/api-server/src/app/services/task-store.service.ts
    apps/api-server/src/app/services/agent-manager.service.ts
    apps/api-server/src/app/services/sla-monitor.service.ts
    apps/api-server/src/app/services/event-store.service.ts (hook for task.completed events)

    <!-- Docker + deployment -->
    docker-compose.yml (NEW)
    apps/api-server/Dockerfile (NEW)
    apps/agent-workspace/Dockerfile (NEW)
    apps/agent-workspace/nginx.conf (NEW)
    .dockerignore (NEW)
    README.md

    <!-- Final accessibility debt clearance (agent-workspace: 119 → 0) -->
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
    TECH_DEBT.md
  </files>
  <tasks>
    <task id="1">
      <name>Implement JWT Authentication (backend AuthModule + JwtAuthGuard)</name>
      <action>
        Install packages:
          npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt
          npm install --save-dev @types/passport-jwt @types/bcrypt

        **Create `apps/api-server/src/app/auth/auth.service.ts`**:
        - `validateUser(username, password): Promise&lt;User | null&gt;`
          - Find user by username via RBACService (UserRepository)
          - Compare password with stored hash using `bcrypt.compare()`
          - Return user object without passwordHash if valid, null otherwise
        - `login(user: User): Promise&lt;LoginResponse&gt;`
          - Sign access token (15-minute TTL): `{ sub: user.id, username: user.username, role: user.role, permissions: [...] }`
          - Sign refresh token (7-day TTL): `{ sub: user.id, type: 'refresh' }`
          - Return `{ accessToken, refreshToken, expiresIn: 900, user: UserProfile }`
        - `refreshToken(token: string): Promise&lt;TokenPair&gt;`
          - Verify refresh token signature
          - Fetch current user, return new access token

        **Create `apps/api-server/src/app/auth/jwt.strategy.ts`**:
        - Extends `PassportStrategy(Strategy)` from passport-jwt
        - Reads `JWT_SECRET` env var
        - Extracts token from `Authorization: Bearer ...` header
        - `validate(payload: JwtPayload): Promise&lt;User&gt;` — loads user by payload.sub

        **Create `apps/api-server/src/app/auth/jwt-auth.guard.ts`**:
        - Extends `AuthGuard('jwt')` from `@nestjs/passport`
        - Overrides `canActivate()` to check for `@Public()` decorator (skip auth if present)

        **Create `apps/api-server/src/app/auth/public.decorator.ts`**:
        - `@Public()` custom decorator using `@SetMetadata('isPublic', true)`

        **Create `apps/api-server/src/app/auth/auth.controller.ts`**:
        - `@Public() @Post('login')` → calls `authService.login()`
        - `@Public() @Post('refresh')` → calls `authService.refreshToken()`
        - `@Get('me')` (protected) → returns current user from request

        **Create `apps/api-server/src/app/auth/auth.module.ts`**:
        - Imports `PassportModule`, `JwtModule.registerAsync()` (reads `JWT_SECRET` from env)
        - Provides `AuthService`, `JwtStrategy`

        **Register global guard in `main.ts`**:
        - `app.useGlobalGuards(new JwtAuthGuard(reflector))`
        - Mark `/api/health`, `/api/metrics`, `/api/auth/login`, `/api/auth/refresh` as `@Public()`

        **Update `RBACService`**: Wire bcrypt hashing into user creation. When seeding users,
        generate real bcrypt hashes (replace placeholder from Plan 2-1 Task 5).

        Add `AuthModule` to `app.module.ts`.
      </action>
      <files>
        package.json
        apps/api-server/src/app/auth/auth.service.ts
        apps/api-server/src/app/auth/auth.controller.ts
        apps/api-server/src/app/auth/jwt.strategy.ts
        apps/api-server/src/app/auth/jwt-auth.guard.ts
        apps/api-server/src/app/auth/public.decorator.ts
        apps/api-server/src/app/auth/auth.module.ts
        apps/api-server/src/app/auth/index.ts
        apps/api-server/src/app/services/rbac.service.ts
        apps/api-server/src/main.ts
        apps/api-server/src/app/app.module.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx run api-server:eslint:lint
        Manual test: POST /api/auth/login with { "username": "agent1", "password": "agent1pass" }
        Returns 200 with accessToken
      </verify>
      <done>
        - POST /api/auth/login returns JWT access + refresh tokens
        - POST /api/auth/refresh returns new access token
        - GET /api/auth/me returns current user (requires Bearer token)
        - JwtAuthGuard applied globally
        - @Public() decorator bypasses auth on login, refresh, health, metrics
        - bcrypt hashing wired into user creation and seeding
        - Build and lint (0 errors) pass
      </done>
    </task>

    <task id="2">
      <name>Update frontend AuthService for real JWT authentication</name>
      <action>
        Update `apps/agent-workspace/src/app/core/services/auth.service.ts`:

        Replace mock persona switching with real HTTP auth:

        1. **`login(username: string, password: string): Observable&lt;LoginResponse&gt;`**:
           - POST to `{apiUrl}/auth/login`
           - On success: store `accessToken` and `refreshToken` in `localStorage`
           - Update `currentUserSubject` with decoded user from response
           - Schedule token refresh before expiry (set a timer for `expiresIn - 60` seconds)
           - Return `Observable&lt;LoginResponse&gt;`

        2. **`logout(): void`**:
           - Clear localStorage tokens
           - Cancel refresh timer
           - Clear `currentUserSubject`
           - Navigate to `/login`

        3. **`refreshToken(): Observable&lt;TokenPair&gt;`**:
           - POST to `{apiUrl}/auth/refresh` with stored refreshToken
           - On success: update stored accessToken, reschedule next refresh
           - On failure (refresh token expired): logout()

        4. **`getToken(): string | null`**:
           - Returns `localStorage.getItem('accessToken')`

        5. **Remove mock methods**: Remove `loginAsRole()`, `switchRole()`, and hardcoded `MOCK_USERS`.
           Keep the 4 convenience methods (`hasPermission`, `hasRole`, etc.) — they now read from the
           JWT-decoded user in `currentUserSubject`.

        6. **`onInit` (or constructor)**: Check `localStorage` for existing token, validate expiry,
           restore session if valid.

        **Update `HttpInterceptor`** (create if not exists):
        Create `apps/agent-workspace/src/app/core/interceptors/auth.interceptor.ts`:
        - Appends `Authorization: Bearer {token}` header to all outgoing HTTP requests
        - On 401 response: attempts one refresh, retries request, then logs out on second 401

        **Update `LoginComponent`**:
        - Replace persona selector buttons with a username/password form
        - Add `FormGroup` with `username` and `password` controls
        - On submit: call `authService.login(username, password)`
        - Show loading state during login, error message on failure
        - Keep persona selector as a dev-mode shortcut panel (shown only when `environment.production === false`)
          using seeded usernames for quick testing

        **Update `authGuard`** to check `authService.getToken()` instead of mock user presence.
      </action>
      <files>
        apps/agent-workspace/src/app/core/services/auth.service.ts
        apps/agent-workspace/src/app/core/interceptors/auth.interceptor.ts (NEW)
        apps/agent-workspace/src/app/core/interceptors/index.ts (NEW)
        apps/agent-workspace/src/app/features/login/login.component.ts
        apps/agent-workspace/src/app/features/login/login.component.html
        apps/agent-workspace/src/app/core/guards/auth.guard.ts
        apps/agent-workspace/src/app/app.config.ts (register interceptor)
      </files>
      <verify>
        npx nx build agent-workspace
        npx nx lint agent-workspace
        npx nx test agent-workspace
      </verify>
      <done>
        - AuthService calls real POST /api/auth/login
        - JWT stored in localStorage, auto-refresh before expiry
        - HttpInterceptor appends Bearer token to all requests
        - LoginComponent shows username/password form with dev-mode persona shortcuts
        - authGuard checks for valid token
        - Build, lint, and tests pass
      </done>
    </task>

    <task id="3">
      <name>Create Prometheus metrics + health check endpoints</name>
      <action>
        Install packages:
          npm install prom-client @nestjs/terminus

        **Create `apps/api-server/src/app/monitoring/metrics.service.ts`**:
        - Initialize `prom-client` default registry: `collectDefaultMetrics()`
        - Define custom metrics:
          ```
          nexus_queue_depth (Gauge, labels: [queue_id, queue_name])
          nexus_tasks_total (Counter, labels: [status, pipeline_id])
          nexus_task_handle_time_seconds (Histogram, buckets: [10, 30, 60, 120, 300, 600])
          nexus_agents_active (Gauge, labels: [state])
          nexus_sla_breaches_total (Counter, labels: [queue_id])
          nexus_dlq_depth (Gauge)
          ```
        - Provide methods for each service to call: `incrementTasksTotal(status, pipelineId)`,
          `observeHandleTime(seconds)`, `setQueueDepth(queueId, queueName, depth)`,
          `setAgentsActive(state, count)`, `incrementSlaBreaches(queueId)`, `setDlqDepth(depth)`

        **Instrument existing services with metric calls:**
        - `QueueManagerService.enqueue()` → `metricsService.setQueueDepth(...)` (update after each enqueue)
        - `QueueManagerService.moveToDLQ()` → `metricsService.setDlqDepth(...)`
        - `TaskStoreService.completeTask()` (or equivalent) → `metricsService.incrementTasksTotal('COMPLETED', pipelineId)`
        - `AgentManagerService` state change → `metricsService.setAgentsActive(state, count)`
        - `SLAMonitorService` breach → `metricsService.incrementSlaBreaches(queueId)`
        - `EventStoreService` on `task.completed` event → `metricsService.observeHandleTime(seconds)`

        **Create `apps/api-server/src/app/monitoring/metrics.controller.ts`**:
        - `@Public() @Get('metrics')` → returns `register.metrics()` with content type `text/plain`

        **Create `apps/api-server/src/app/monitoring/health.controller.ts`**:
        - Import `@nestjs/terminus` HealthCheck, TypeOrmHealthIndicator, HealthCheckService
        - `@Public() @Get('health')` → checks PostgreSQL and returns `{ status: 'ok' | 'error', ... }`
        - Add Redis health indicator: attempt a Redis PING, return warning (not error) if Redis is down

        **Create `apps/api-server/src/app/monitoring/metrics.module.ts`**:
        - Registers `MetricsService` (global), `MetricsController`, `HealthController`
        - Imports `TerminusModule`

        Add `MonitoringModule` to `app.module.ts`.
        Note: `MetricsService` should be `@Global()` so all services can inject it without
        adding MonitoringModule to every feature module.
      </action>
      <files>
        package.json
        apps/api-server/src/app/monitoring/metrics.service.ts
        apps/api-server/src/app/monitoring/metrics.controller.ts
        apps/api-server/src/app/monitoring/health.controller.ts
        apps/api-server/src/app/monitoring/metrics.module.ts
        apps/api-server/src/app/monitoring/index.ts
        apps/api-server/src/app/services/queue-manager.service.ts
        apps/api-server/src/app/services/task-store.service.ts
        apps/api-server/src/app/services/agent-manager.service.ts
        apps/api-server/src/app/services/sla-monitor.service.ts
        apps/api-server/src/app/services/event-store.service.ts
        apps/api-server/src/app/app.module.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx run api-server:eslint:lint
        GET /api/metrics → returns Prometheus text format
        GET /api/health → returns { status: 'ok' }
      </verify>
      <done>
        - GET /api/metrics returns Prometheus-format text with all 6 custom metrics
        - Default process metrics (CPU, memory, event loop lag) also exposed
        - GET /api/health checks PostgreSQL connection and returns appropriate status
        - MetricsService is global, injectable from any service
        - Build and lint (0 errors) pass
      </done>
    </task>

    <task id="4">
      <name>Create Docker Compose + Dockerfiles for production deployment</name>
      <action>
        **`apps/api-server/Dockerfile`** (multi-stage):
        ```
        Stage 1 (build):
          FROM node:22-alpine AS builder
          WORKDIR /app
          COPY package*.json ./
          RUN npm ci
          COPY . .
          RUN npx nx build api-server --configuration=production

        Stage 2 (runtime):
          FROM node:22-alpine
          WORKDIR /app
          ENV NODE_ENV=production
          COPY --from=builder /app/dist/apps/api-server .
          COPY --from=builder /app/node_modules ./node_modules
          EXPOSE 3000
          CMD ["node", "main.js"]
        ```

        **`apps/agent-workspace/Dockerfile`** (multi-stage with nginx):
        ```
        Stage 1 (build):
          FROM node:22-alpine AS builder
          WORKDIR /app
          COPY package*.json ./
          RUN npm ci
          COPY . .
          RUN npx nx build agent-workspace --configuration=production

        Stage 2 (runtime):
          FROM nginx:alpine
          COPY --from=builder /app/dist/apps/agent-workspace/browser /usr/share/nginx/html
          COPY apps/agent-workspace/nginx.conf /etc/nginx/conf.d/default.conf
          EXPOSE 80
        ```

        **`apps/agent-workspace/nginx.conf`**:
        - `try_files $uri $uri/ /index.html` for SPA routing
        - Proxy `/api/` to `http://api:3000/api/` (service name from docker-compose)
        - Gzip compression enabled
        - Cache-Control headers for static assets

        **`docker-compose.yml`** at repo root:
        ```yaml
        version: '3.8'
        services:
          postgres:
            image: postgres:16-alpine
            environment:
              POSTGRES_DB: nexus_queue
              POSTGRES_USER: nexus
              POSTGRES_PASSWORD: nexus_dev_password
            volumes: [postgres_data:/var/lib/postgresql/data]
            ports: ["5432:5432"]
            healthcheck: pg_isready

          redis:
            image: redis:7-alpine
            ports: ["6379:6379"]
            healthcheck: redis-cli ping

          api:
            build: { context: ., dockerfile: apps/api-server/Dockerfile }
            ports: ["3000:3000"]
            environment:
              DATABASE_URL: postgresql://nexus:nexus_dev_password@postgres:5432/nexus_queue
              REDIS_URL: redis://redis:6379
              JWT_SECRET: changeme_in_production_use_env_secret
              NODE_ENV: production
            depends_on: [postgres, redis]

          web:
            build: { context: ., dockerfile: apps/agent-workspace/Dockerfile }
            ports: ["4200:80"]
            depends_on: [api]

        volumes:
          postgres_data:
        ```

        **`.dockerignore`** at repo root:
        ```
        node_modules
        dist
        .git
        .planning
        *.md
        ```

        Update `README.md` Docker section (create or update "Docker Quickstart"):
        ```
        ## Docker Quickstart
        docker-compose up --build
        # API:  http://localhost:3000/api
        # Web:  http://localhost:4200
        # First run: docker-compose exec api npm run db:migrate && npm run db:seed
        ```
      </action>
      <files>
        apps/api-server/Dockerfile
        apps/agent-workspace/Dockerfile
        apps/agent-workspace/nginx.conf
        docker-compose.yml
        .dockerignore
        README.md
      </files>
      <verify>
        docker-compose config (validates YAML syntax, no docker required to run)
        npx nx build api-server --configuration=production
        npx nx build agent-workspace --configuration=production
      </verify>
      <done>
        - docker-compose.yml defines api, web, postgres, redis services
        - api-server Dockerfile builds a production NestJS image
        - agent-workspace Dockerfile builds a production nginx-served Angular image
        - nginx.conf handles SPA routing and /api/ proxy
        - README.md updated with Docker quickstart
        - Production builds pass
      </done>
    </task>

    <task id="5">
      <name>Clear final accessibility debt — agent-workspace: 119 → 0</name>
      <action>
        Clear the remaining 119 pre-existing accessibility lint errors in `agent-workspace`.
        This is a mechanical fix across template HTML files.

        **Rule: `label-has-associated-control` (44 errors)**
        Pattern: Every `&lt;label&gt;` must have a `for` attribute matching the `id` of its form control,
        OR the form control must be nested inside the `&lt;label&gt;`.

        Fix strategy (prefer explicit association):
        ```html
        BEFORE: &lt;label&gt;Queue Name&lt;/label&gt;&lt;input formControlName="name"&gt;
        AFTER:  &lt;label for="queueName"&gt;Queue Name&lt;/label&gt;&lt;input id="queueName" formControlName="name"&gt;
        ```
        Assign unique `id` values using a consistent naming scheme: `{componentPrefix}_{fieldName}_{index if repeated}`.

        **Rule: `interactive-supports-focus` (36 errors)**
        Pattern: Non-button, non-input elements with `(click)` handlers must have:
        - A semantic role: `role="button"` (or appropriate semantic element)
        - `tabindex="0"` to make them keyboard-focusable

        Fix strategy:
        ```html
        BEFORE: &lt;div (click)="handleClick()"&gt;Action&lt;/div&gt;
        AFTER:  &lt;div role="button" tabindex="0" (click)="handleClick()" (keydown.enter)="handleClick()" (keydown.space)="handleClick()"&gt;Action&lt;/div&gt;
        ```
        PREFERRED where applicable: replace `&lt;div (click)&gt;` with `&lt;button type="button"&gt;` — this
        resolves both interactive-supports-focus AND click-events-have-key-events simultaneously.

        **Rule: `click-events-have-key-events` (36 errors)**
        Pattern: Elements with `(click)` must also have corresponding keyboard event handlers.
        - Add `(keydown.enter)="handler()"` and/or `(keydown.space)="handler()"` alongside each `(click)`
        - OR replace div/span click handlers with `&lt;button&gt;` elements (preferred)

        Affected files (from TECH_DEBT.md — all remaining after Wave 1):
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
        (Plus any new HTML files added in this phase — audit-log.component.html must be
        written accessibly from the start, so no new accessibility errors introduced)

        After fixing all files, update TECH_DEBT.md:
        - label-has-associated-control: 44 → 0
        - interactive-supports-focus: 36 → 0
        - click-events-have-key-events: 36 → 0
        - agent-workspace total: 119 → 0
        - Remove all remaining files from the affected-files table
        - Add a row to the History table: Phase 4 Wave 3 | full clearance

        IMPORTANT: Do NOT modify any component TypeScript files in this task (accessibility
        fixes are HTML-only). If a fix requires a TypeScript change (e.g., adding a keyboard
        handler method), add the minimal method needed with no other modifications.
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
        TECH_DEBT.md
      </files>
      <verify>
        npx nx lint agent-workspace
        Confirm output shows 0 errors.
        npx nx build agent-workspace
        npx nx test agent-workspace
      </verify>
      <done>
        - label-has-associated-control: 44 → 0
        - interactive-supports-focus: 36 → 0
        - click-events-have-key-events: 36 → 0
        - agent-workspace total: 119 → 0 (FULL CLEARANCE)
        - api-server total: 0 (maintained from Wave 1)
        - TECH_DEBT.md updated: Phase 4 complete, both projects at 0 errors
        - Build and tests pass with no regressions
      </done>
    </task>
  </tasks>
  <dependencies>
    Wave 2 plans (2-1 and 2-2) must both complete before Wave 3:
    - RBACService with UserRepository needed for AuthService (Plan 2-1)
    - EventStoreService needed for metrics instrumentation (Plan 2-2)
  </dependencies>
</plan>
