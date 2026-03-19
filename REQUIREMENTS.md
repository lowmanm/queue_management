# Nexus Queue — Requirements

> **Phase-scoped requirements with traceability to ROADMAP.md deliverables.**
> Each requirement has a unique ID for reference in plans and verification.

---

## Phase 3 — Logic Builder

### v1 Requirements (Must Have)

#### Pipeline Creation Wizard

| ID | Requirement | Deliverable |
|---|---|---|
| P3-001 | Designer can create a new pipeline via a multi-step wizard (name, description, active/inactive) | Pipeline Creation Wizard |
| P3-002 | Wizard step 2: Define data schema with field name, type, and required flag | Pipeline Creation Wizard |
| P3-003 | Wizard step 3: Configure routing rules (condition → target queue) | Pipeline Creation Wizard |
| P3-004 | Wizard step 4: Assign queues with priority, skills, and capacity | Pipeline Creation Wizard |
| P3-005 | Wizard step 5: Set SLA config (warning threshold, breach threshold, escalation action) | Pipeline Creation Wizard |
| P3-006 | Wizard shows summary/review step before creation | Pipeline Creation Wizard |
| P3-007 | Pipeline can be saved as draft (inactive) or activated immediately | Pipeline Creation Wizard |

#### Rule Builder UI

| ID | Requirement | Deliverable |
|---|---|---|
| P3-010 | Designer can create rule sets with ordered rules | Rule Builder UI |
| P3-011 | Each rule has conditions (field, operator, value) and actions (set field, set priority, add skill, add tag) | Rule Builder UI |
| P3-012 | Conditions support operators: equals, not_equals, contains, greater_than, less_than, in, not_in, exists | Rule Builder UI |
| P3-013 | Rules can be reordered (drag-and-drop or up/down controls) | Rule Builder UI |
| P3-014 | Rule set can be tested against sample task data with before/after preview | Rule Set Testing |

#### Routing Rule Editor

| ID | Requirement | Deliverable |
|---|---|---|
| P3-020 | Designer can configure routing rules per pipeline | Routing Rule Editor |
| P3-021 | Routing rules use condition trees: field + operator + value → target queue | Routing Rule Editor |
| P3-022 | Default/fallback route when no conditions match | Routing Rule Editor |
| P3-023 | Routing rules can be tested with sample data showing which queue a task would route to | Pipeline Validation |

#### Queue Configuration

| ID | Requirement | Deliverable |
|---|---|---|
| P3-030 | Designer can create/edit/delete queues from the admin UI | Queue Configuration Panel |
| P3-031 | Queue config: name, priority range, required skills, max capacity | Queue Configuration Panel |
| P3-032 | Queue config: SLA thresholds (warning %, breach %, auto-escalation toggle) | Queue Configuration Panel |
| P3-033 | Queue list shows real-time depth and agent count | Queue Configuration Panel |

#### DLQ Monitor

| ID | Requirement | Deliverable |
|---|---|---|
| P3-040 | Manager/Admin can view all dead-lettered tasks with failure reason | DLQ Monitor |
| P3-041 | DLQ actions: retry (re-enqueue), reassign (to specific agent), reroute (different queue), discard | DLQ Monitor |
| P3-042 | DLQ shows task metadata, pipeline source, failure timestamp, retry count | DLQ Monitor |
| P3-043 | DLQ supports filtering by pipeline, failure reason, date range | DLQ Monitor |

#### Pipeline Status Dashboard

| ID | Requirement | Deliverable |
|---|---|---|
| P3-050 | Dashboard shows all pipelines with status (active/inactive/error) | Pipeline Status Dashboard |
| P3-051 | Per-pipeline metrics: tasks ingested, tasks completed, tasks in queue, SLA compliance % | Pipeline Status Dashboard |
| P3-052 | Per-pipeline metrics update in real-time via WebSocket | Pipeline Status Dashboard |

### v2 Requirements (Nice to Have)

| ID | Requirement | Notes |
|---|---|---|
| P3-100 | Pipeline cloning — duplicate existing pipeline as starting point | Saves designer time |
| P3-101 | Rule set import/export as JSON | Enables sharing/backup |
| P3-102 | Pipeline config diff view — compare two versions side by side | Requires P3 config versioning |
| P3-103 | Bulk queue operations — activate/deactivate multiple queues | Manager convenience |
| P3-104 | DLQ auto-retry policies — configure automatic retry schedules | Reduces manual intervention |

### Out of Scope for Phase 3

| Item | Reason | Target |
|---|---|---|
| Visual drag-and-drop flow builder | Form-based UI is sufficient for v1; evaluate after user feedback | Phase 5+ |
| Pipeline scheduling (time-based activation) | Requires scheduler infrastructure | Phase 4 |
| Cross-pipeline task routing | Single-pipeline routing is sufficient for v1 | Phase 4+ |
| Audit log UI | Requires event sourcing from Phase 4 | Phase 4 |

---

## Phase 4 — Persistence + Production

> Requirements not yet scoped. Will be defined after Phase 3 verification.

---

*Last Updated: March 2026*
*Version: 1.0*
