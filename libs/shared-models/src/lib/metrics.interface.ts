/**
 * Metrics snapshot for frontend consumption via GET /api/metrics/json
 */
export interface MetricsSnapshot {
  /** Depth per queue (queue name → count) */
  queueDepth: Record<string, number>;

  /** Task counts per status label */
  tasksTotal: Record<string, number>;

  /** Agent counts per state label */
  agentsActive: Record<string, number>;

  /** Total SLA breaches recorded */
  slaBreachesTotal: number;

  /** Dead-letter queue depth */
  dlqDepth: number;

  /** 50th percentile task handle time in seconds */
  taskHandleTimeP50: number;

  /** 95th percentile task handle time in seconds */
  taskHandleTimeP95: number;

  /** ISO timestamp when metrics were collected */
  collectedAt: string;
}
