<plan>
  <name>Observability and Alerting</name>
  <wave>2</wave>
  <requirements>P6-040, P6-041, P6-042, P6-043, P6-044</requirements>
  <files>
    <!-- Config files (new) -->
    grafana/nexus-queue-dashboard.json  [NEW]
    prometheus/alerts.yml               [NEW]
    prometheus/prometheus.yml           [NEW]

    <!-- Docker Compose -->
    docker-compose.yml

    <!-- Backend -->
    apps/api-server/src/app/metrics/metrics.controller.ts

    <!-- Frontend -->
    apps/agent-workspace/src/app/features/admin/components/observability/observability.component.ts  [NEW]
    apps/agent-workspace/src/app/features/admin/components/observability/observability.component.html [NEW]
    apps/agent-workspace/src/app/features/admin/components/observability/observability.component.scss [NEW]
    apps/agent-workspace/src/app/features/admin/admin.routes.ts
    apps/agent-workspace/src/app/shared/components/layout/app-shell.component.ts
    apps/agent-workspace/src/app/shared/components/layout/app-shell.component.html
  </files>
  <tasks>
    <task id="1">
      <name>Grafana dashboard JSON and Prometheus alert rules</name>
      <action>
        Create `grafana/nexus-queue-dashboard.json`:
        - Standard Grafana dashboard JSON schema (version 1, schemaVersion 38)
        - Datasource: `{ type: "prometheus", uid: "nexus-prometheus" }` (named "Nexus Prometheus")
        - Dashboard title: "Nexus Queue — Operations Dashboard"
        - 6 panels:
          1. **Queue Depth** (time series, `nexus_queue_depth`) — stacked by queue label
          2. **Task Throughput** (time series, `rate(nexus_tasks_total[5m])`) — by status
          3. **Agent State Distribution** (pie chart, `nexus_agents_active`) — by state label
          4. **SLA Compliance %** (stat, derived: 100 - rate(nexus_sla_breaches_total[1h]) / rate(nexus_tasks_total[1h]) * 100)
          5. **DLQ Depth** (gauge, `nexus_dlq_depth`, thresholds: 10=yellow, 50=red)
          6. **Task Handle Time** (heatmap, `nexus_task_handle_time_seconds_bucket`)
        - Include standard Grafana template variables: `interval`, `datasource`
        - Refresh: 30s; time range: last 1 hour

        Create `prometheus/alerts.yml`:
        ```yaml
        groups:
          - name: nexus_queue_alerts
            rules:
              - alert: NexusQueueHigh
                expr: nexus_queue_depth > 100
                for: 5m
                labels: { severity: warning }
                annotations:
                  summary: "Queue {{ $labels.queue }} depth is high ({{ $value }} tasks)"

              - alert: NexusSLABreachRateHigh
                expr: rate(nexus_sla_breaches_total[5m]) > 0.05
                for: 5m
                labels: { severity: critical }
                annotations:
                  summary: "SLA breach rate exceeds 5% on queue {{ $labels.queue }}"

              - alert: NexusDLQDepth
                expr: nexus_dlq_depth > 50
                for: 10m
                labels: { severity: warning }
                annotations:
                  summary: "DLQ depth is {{ $value }} — dead-lettered tasks need attention"

              - alert: NexusAPIDown
                expr: up{job="nexus-api"} == 0
                for: 1m
                labels: { severity: critical }
                annotations:
                  summary: "Nexus API server is unreachable"
        ```

        Create `prometheus/prometheus.yml`:
        ```yaml
        global:
          scrape_interval: 15s
          evaluation_interval: 15s
        rule_files:
          - "alerts.yml"
        scrape_configs:
          - job_name: nexus-api
            static_configs:
              - targets: ["api:3000"]
            metrics_path: /api/metrics
        ```

        Commit: `feat(observability): add Grafana dashboard JSON and Prometheus alert rules (P6-040, P6-041)`
      </action>
      <files>
        grafana/nexus-queue-dashboard.json
        prometheus/alerts.yml
        prometheus/prometheus.yml
      </files>
      <verify>
        # Validate JSON is parseable
        node -e "JSON.parse(require('fs').readFileSync('grafana/nexus-queue-dashboard.json', 'utf8'))"
        # Validate YAML structure (manual check — no yamllint installed by default)
        cat prometheus/alerts.yml
        cat prometheus/prometheus.yml
      </verify>
      <done>
        - `grafana/nexus-queue-dashboard.json` is valid JSON parseable by node
        - Dashboard contains all 6 panels with correct Prometheus metric names
        - `prometheus/alerts.yml` defines 4 alert rules (NexusQueueHigh, NexusSLABreachRateHigh, NexusDLQDepth, NexusAPIDown)
        - `prometheus/prometheus.yml` scrapes `api:3000/api/metrics`
        - Files committed to repo root
      </done>
    </task>

    <task id="2">
      <name>Docker-compose monitoring profile (Prometheus + Grafana)</name>
      <action>
        Update `docker-compose.yml` to add Prometheus and Grafana services under the `monitoring` profile.
        These services are opt-in (not started by default with `docker-compose up`).

        Add to `docker-compose.yml`:
        ```yaml
        prometheus:
          image: prom/prometheus:v2.50.0
          profiles: [monitoring]
          volumes:
            - ./prometheus:/etc/prometheus
          ports:
            - '9090:9090'
          command:
            - '--config.file=/etc/prometheus/prometheus.yml'
            - '--storage.tsdb.path=/prometheus'
          depends_on:
            - api

        grafana:
          image: grafana/grafana:10.3.0
          profiles: [monitoring]
          volumes:
            - grafana_data:/var/lib/grafana
            - ./grafana:/etc/grafana/provisioning/dashboards
          ports:
            - '3001:3000'
          environment:
            GF_AUTH_ANONYMOUS_ENABLED: 'true'
            GF_AUTH_ANONYMOUS_ORG_ROLE: Viewer
          depends_on:
            - prometheus
        ```

        Add `grafana_data` to the `volumes` section.

        Update `README.md` (find the Docker quickstart section) to document:
        ```
        # Full stack with monitoring
        docker-compose --profile monitoring up
        # Grafana at http://localhost:3001 (anonymous viewer, no login)
        # Import grafana/nexus-queue-dashboard.json via Grafana → Dashboards → Import
        ```

        Commit: `feat(docker): add optional Prometheus + Grafana monitoring profile (P6-042)`
      </action>
      <files>
        docker-compose.yml
        README.md
      </files>
      <verify>
        # Validate docker-compose YAML syntax
        docker-compose config --quiet 2>&1 || true
        npx nx build api-server
      </verify>
      <done>
        - `docker-compose.yml` defines `prometheus` and `grafana` services with `profiles: [monitoring]`
        - Services not started by default (requires `--profile monitoring` flag)
        - `grafana/nexus-queue-dashboard.json` is mounted as provisioning source
        - Grafana exposes port 3001, Prometheus port 9090
        - README documents `docker-compose --profile monitoring up`
        - `grafana_data` volume declared
      </done>
    </task>

    <task id="3">
      <name>JSON metrics endpoint (backend)</name>
      <action>
        Add `GET /api/metrics/json` endpoint to `MetricsController`:
        - This endpoint returns current metric values as JSON for Angular frontend consumption
        - Response shape:
          ```typescript
          interface MetricsSnapshot {
            queueDepth: Record<string, number>;    // per queue
            tasksTotal: Record<string, number>;     // per status label
            agentsActive: Record<string, number>;   // per state label
            slaBreachesTotal: number;
            dlqDepth: number;
            taskHandleTimeP50: number;              // 50th percentile seconds
            taskHandleTimeP95: number;              // 95th percentile seconds
            collectedAt: string;                    // ISO timestamp
          }
          ```
        - Add `getSnapshot(): MetricsSnapshot` method directly in `MetricsController`
          (no separate MetricsService exists — controller already injects `AgentManagerService`,
          `QueuesService`, `DispositionService`, `TaskSourceService`)
        - Aggregate data from existing injected services:
          - `queueDepth`: from `QueuesService.getAllQueueStats()` — map queue name → depth
          - `tasksTotal`: from `TaskSourceService.getQueueStats()` — map status → count
          - `agentsActive`: from `AgentManagerService.getAllAgents()` — group by agent state
          - `slaBreachesTotal`: read prom-client `nexus_sla_breaches_total` counter if available, else 0
          - `dlqDepth`: read prom-client `nexus_dlq_depth` gauge if available, else 0
          - `taskHandleTimeP50` / `taskHandleTimeP95`: compute from `DispositionService.getAllCompletions()`
          - `collectedAt`: `new Date().toISOString()`
        - Endpoint is public (`@Public()` decorator) so Angular can poll it without JWT
        - Add `MetricsSnapshot` interface to `libs/shared-models/src/lib/` as a new file
          `metrics.interface.ts` and export from `index.ts`

        Commit: `feat(monitoring): add GET /api/metrics/json endpoint for frontend metric tiles (P6-043)`
      </action>
      <files>
        apps/api-server/src/app/metrics/metrics.controller.ts
        libs/shared-models/src/lib/metrics.interface.ts  [NEW]
        libs/shared-models/src/lib/index.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx run api-server:eslint:lint
        npx nx test api-server
        npx nx build shared-models
      </verify>
      <done>
        - `GET /api/metrics/json` returns `MetricsSnapshot` JSON (HTTP 200)
        - Endpoint is public (no JWT required)
        - `MetricsController.getSnapshot()` aggregates from existing injected services
        - `MetricsSnapshot` interface in shared-models, exported from index.ts
        - 0 lint errors in both projects
        - All tests pass
      </done>
    </task>

    <task id="4">
      <name>Admin Observability page (frontend)</name>
      <action>
        Create `ObservabilityComponent` at `apps/agent-workspace/src/app/features/admin/components/observability/`:

        `observability.component.ts`:
        - Standalone component, `ChangeDetectionStrategy.OnPush`
        - Uses `HttpClient` to `GET /api/metrics/json` every 10 seconds via `interval(10000).pipe(startWith(0), switchMap(...))`
        - `takeUntil(this.destroy$)` cleanup pattern
        - Signals: `metrics = signal<MetricsSnapshot | null>(null)`, `isLoading = signal(true)`, `error = signal('')`
        - Helpers: `totalQueueDepth()` (sum of all queue depths), `totalAgentsOnline()` (sum of all non-OFFLINE states)
        - Imports: `CommonModule`, `PageLayoutComponent`

        `observability.component.html`:
        - Page title: "Observability" (via PageLayoutComponent)
        - Subtitle: "Live metrics — updates every 10 seconds"
        - 5 metric tiles in a responsive grid:
          1. **Total Queue Depth** — sum of all `queueDepth` values, icon: stack
          2. **Agents Online** — sum of non-OFFLINE agents from `agentsActive`
          3. **DLQ Depth** — `dlqDepth`, red when > 0
          4. **Tasks Today** — sum of all `tasksTotal` values (all statuses)
          5. **SLA Breaches** — `slaBreachesTotal` counter, yellow when > 0
        - Per-queue depth table: queue name + depth (from `queueDepth` record)
        - Last updated timestamp (`collectedAt` field)
        - Loading spinner when `isLoading()` true
        - Error message when `error()` non-empty

        `observability.component.scss`:
        - `.metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }`
        - `.metric-tile { background: var(--surface-card); border-radius: 8px; padding: 1.5rem; }`
        - `.metric-value { font-size: 2rem; font-weight: 700; }`
        - `.metric-label { color: var(--text-secondary); font-size: 0.875rem; }`
        - `.tile-warning { border-left: 4px solid var(--color-warning); }`
        - `.tile-danger { border-left: 4px solid var(--color-error); }`

        Register route in `admin.routes.ts`:
        ```typescript
        {
          path: 'observability',
          loadComponent: () => import('./components/observability/observability.component')
            .then(m => m.ObservabilityComponent),
          canActivate: [designerGuard],
        }
        ```

        Add sidebar navigation link in `AppShellComponent` sidebar (Operations section):
        - Label: "Observability", icon: chart-bar, route: `/admin/observability`
        - Visible to DESIGNER and ADMIN roles

        Commit: `feat(admin): add Observability page with live metric tiles (P6-044)`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/observability/observability.component.ts
        apps/agent-workspace/src/app/features/admin/components/observability/observability.component.html
        apps/agent-workspace/src/app/features/admin/components/observability/observability.component.scss
        apps/agent-workspace/src/app/features/admin/admin.routes.ts
        apps/agent-workspace/src/app/shared/components/layout/app-shell.component.ts
        apps/agent-workspace/src/app/shared/components/layout/app-shell.component.html
      </files>
      <verify>
        npx nx build agent-workspace
        npx nx lint agent-workspace
        npx nx test agent-workspace
      </verify>
      <done>
        - `/admin/observability` route registered and accessible to DESIGNER/ADMIN
        - ObservabilityComponent shows 5 metric tiles with live data from `/api/metrics/json`
        - Data refreshes every 10 seconds
        - Per-queue depth table rendered
        - Sidebar navigation includes "Observability" link
        - Loading and error states handled
        - 0 lint errors
        - All tests pass
      </done>
    </task>
  </tasks>
  <dependencies>
    Wave 1 (1-1-platform-hardening) must complete before Wave 2 begins.
  </dependencies>
</plan>
