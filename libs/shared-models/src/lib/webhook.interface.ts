/**
 * Webhook Interfaces
 *
 * Webhooks provide a mechanism for external systems to push task data into
 * Nexus Queue via signed HTTP callbacks, and for Nexus Queue to push
 * lifecycle events back out to subscribing systems.
 */

/** Status of a webhook endpoint */
export type WebhookStatus = 'active' | 'inactive';

/** Status of a webhook delivery attempt */
export type WebhookDeliveryStatus = 'QUEUED' | 'DLQ' | 'REJECTED' | 'ERROR' | 'RATE_LIMITED';

/**
 * A registered inbound webhook endpoint.
 *
 * The token is embedded in the URL path; the secret is used for
 * HMAC-SHA256 request signing (shown only on creation).
 */
export interface WebhookEndpoint {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Pipeline this endpoint feeds into */
  pipelineId: string;

  /** Opaque 32-byte hex token embedded in the URL (e.g. POST /api/webhooks/:token) */
  token: string;

  /** HMAC-SHA256 signing secret — shown once on creation, never again */
  secret: string;

  /** Whether the endpoint is accepting deliveries */
  status: WebhookStatus;

  /** When this endpoint was created */
  createdAt: string;

  /** When the last delivery was received */
  lastDeliveryAt?: string;

  /** Total number of deliveries received */
  deliveryCount: number;

  /**
   * Optional per-endpoint rate limit override.
   * When set, the endpoint uses this limit instead of the module-level default.
   */
  rateLimit?: {
    /** Maximum requests allowed within the TTL window */
    limit: number;
    /** Time window in milliseconds */
    ttl: number;
  };
}

/**
 * A record of a single inbound webhook delivery attempt.
 */
export interface WebhookDelivery {
  /** Unique identifier */
  id: string;

  /** Webhook endpoint that received this delivery */
  webhookId: string;

  /** When the HTTP request was received */
  receivedAt: string;

  /** Source IP of the request (if available) */
  sourceIp?: string;

  /** Size of the request body in bytes */
  payloadBytes: number;

  /** Final status of this delivery */
  status: WebhookDeliveryStatus;

  /** Orchestration outcome: QUEUED | DLQ | REJECTED | DUPLICATE */
  orchestrationStatus?: string;

  /** Task ID created from this delivery (if successfully ingested) */
  taskId?: string;

  /** Error message if delivery failed */
  errorMessage?: string;

  /** How long processing took in milliseconds */
  processingMs: number;
}
