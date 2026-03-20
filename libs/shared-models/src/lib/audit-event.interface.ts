/**
 * Audit Event Interfaces
 *
 * Defines the domain event types and query structures for the event sourcing
 * audit log. Events are append-only and capture the full task and agent lifecycle.
 */

/**
 * All domain event types emitted across the task and agent lifecycle.
 */
export type AuditEventType =
  | 'task.ingested'             // Task received by PipelineOrchestrator and validated
  | 'task.queued'               // Task placed into a priority queue
  | 'task.assigned'             // Task matched to an agent by TaskDistributor
  | 'task.accepted'             // Agent accepted the task via WebSocket
  | 'task.rejected'             // Agent rejected or timed out on the task
  | 'task.completed'            // Agent submitted disposition, task marked COMPLETED
  | 'task.dlq'                  // Task moved to dead-letter queue (max retries exceeded)
  | 'task.retried'              // Manager/Admin retried a DLQ task
  | 'task.pipeline_transferred' // Task transferred to a different pipeline (cross-pipeline routing)
  | 'agent.state_changed'       // Agent transitioned between states (IDLE, ACTIVE, etc.)
  | 'sla.warning'               // Task SLA warning threshold crossed
  | 'sla.breach'                // Task SLA breach threshold exceeded
  | 'outbound.webhook.sent'     // Outbound callback successfully delivered to external system
  | 'outbound.webhook.failed';  // Outbound callback failed after all retries

/**
 * The entity type that the event belongs to.
 */
export type AggregateType = 'task' | 'agent';

/**
 * A single immutable domain event in the audit log.
 * Events are never updated after creation.
 */
export interface AuditEvent {
  /** Unique event identifier (UUID) */
  id: string;

  /** The type of domain event */
  eventType: AuditEventType;

  /** ID of the entity this event belongs to (taskId or agentId) */
  aggregateId: string;

  /** Whether this event belongs to a task or an agent */
  aggregateType: AggregateType;

  /** Event-specific data (varies by eventType) */
  payload: Record<string, unknown>;

  /** UTC timestamp when the event occurred */
  occurredAt: Date;

  /** Pipeline that owns the task (undefined for agent events) */
  pipelineId?: string;

  /** Agent involved in the event (undefined for non-agent events) */
  agentId?: string;

  /** Monotonically increasing sequence number for ordering */
  sequenceNum: number;
}

/**
 * Query parameters for filtering audit log events.
 * All fields are optional; omitting a field returns all values for that dimension.
 */
export interface AuditLogQuery {
  /** Filter by aggregate type */
  aggregateType?: AggregateType;

  /** Filter by specific entity ID (taskId or agentId) */
  aggregateId?: string;

  /** Filter by event type */
  eventType?: AuditEventType;

  /** Filter events that occurred on or after this timestamp (ISO 8601) */
  startDate?: string;

  /** Filter events that occurred on or before this timestamp (ISO 8601) */
  endDate?: string;

  /** Page number (1-based, default: 1) */
  page?: number;

  /** Number of events per page (default: 50, max: 200) */
  limit?: number;
}

/**
 * Paginated response from the audit log query endpoint.
 */
export interface AuditLogResponse {
  /** The events matching the query for this page */
  events: AuditEvent[];

  /** Total number of events matching the query (across all pages) */
  total: number;

  /** Current page number (1-based) */
  page: number;

  /** Number of events per page */
  limit: number;
}
