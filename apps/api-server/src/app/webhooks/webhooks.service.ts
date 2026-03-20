import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { WebhookEndpoint, WebhookDelivery, WebhookStatus, WebhookDeliveryStatus } from '@nexus-queue/shared-models';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  /** Endpoint store keyed by endpoint id */
  private readonly endpoints = new Map<string, WebhookEndpoint>();

  /** Fast token → endpoint id lookup */
  private readonly tokenIndex = new Map<string, string>();

  /** Delivery log keyed by endpoint id */
  private readonly deliveries = new Map<string, WebhookDelivery[]>();

  // ===========================================================================
  // ENDPOINT CRUD
  // ===========================================================================

  /**
   * Create a new webhook endpoint for the given pipeline.
   * The generated token and secret are returned only once — callers must store them.
   */
  createEndpoint(pipelineId: string, name: string): WebhookEndpoint {
    const id = randomBytes(16).toString('hex');
    const token = randomBytes(32).toString('hex');
    const secret = randomBytes(32).toString('hex');
    const now = new Date().toISOString();

    const endpoint: WebhookEndpoint = {
      id,
      name,
      pipelineId,
      token,
      secret,
      status: 'active',
      createdAt: now,
      deliveryCount: 0,
    };

    this.endpoints.set(id, endpoint);
    this.tokenIndex.set(token, id);
    this.deliveries.set(id, []);

    this.logger.log(`Created webhook endpoint "${name}" for pipeline ${pipelineId}`);
    return endpoint;
  }

  /**
   * List all endpoints, optionally filtered by pipelineId.
   */
  listEndpoints(pipelineId?: string): WebhookEndpoint[] {
    const all = Array.from(this.endpoints.values());
    return pipelineId ? all.filter((e) => e.pipelineId === pipelineId) : all;
  }

  /**
   * Get a single endpoint by id.
   */
  getEndpoint(id: string): WebhookEndpoint | undefined {
    return this.endpoints.get(id);
  }

  /**
   * Delete an endpoint and its delivery history.
   */
  deleteEndpoint(id: string): void {
    const endpoint = this.endpoints.get(id);
    if (endpoint) {
      this.tokenIndex.delete(endpoint.token);
      this.endpoints.delete(id);
      this.deliveries.delete(id);
      this.logger.log(`Deleted webhook endpoint ${id}`);
    }
  }

  /**
   * Toggle the active/inactive status of an endpoint.
   */
  toggleStatus(id: string, status: WebhookStatus): WebhookEndpoint {
    const endpoint = this.endpoints.get(id);
    if (!endpoint) {
      throw new Error(`Webhook endpoint not found: ${id}`);
    }
    endpoint.status = status;
    return endpoint;
  }

  /**
   * Regenerate the token for an endpoint.
   * The old token is immediately invalidated.
   */
  regenerateToken(id: string): WebhookEndpoint {
    const endpoint = this.endpoints.get(id);
    if (!endpoint) {
      throw new Error(`Webhook endpoint not found: ${id}`);
    }
    this.tokenIndex.delete(endpoint.token);
    const newToken = randomBytes(32).toString('hex');
    endpoint.token = newToken;
    this.tokenIndex.set(newToken, id);
    this.logger.log(`Regenerated token for webhook endpoint ${id}`);
    return endpoint;
  }

  // ===========================================================================
  // TOKEN LOOKUP & SIGNATURE VERIFICATION
  // ===========================================================================

  /**
   * Look up an endpoint by its URL token.
   */
  lookupByToken(token: string): WebhookEndpoint | undefined {
    const id = this.tokenIndex.get(token);
    return id ? this.endpoints.get(id) : undefined;
  }

  /**
   * Verify an HMAC-SHA256 signature header against the raw request body.
   *
   * Header format: `sha256={hex-digest}`
   * Uses timingSafeEqual to prevent timing attacks.
   */
  verifySignature(secret: string, rawBody: string, signatureHeader: string): boolean {
    try {
      const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
      const expectedBuf = Buffer.from(expected, 'utf8');
      const receivedBuf = Buffer.from(signatureHeader, 'utf8');
      if (expectedBuf.length !== receivedBuf.length) {
        return false;
      }
      return timingSafeEqual(expectedBuf, receivedBuf);
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // DELIVERY LOG
  // ===========================================================================

  /**
   * Record a delivery attempt in the log.
   */
  logDelivery(webhookId: string, delivery: Omit<WebhookDelivery, 'id'>): WebhookDelivery {
    const id = randomBytes(16).toString('hex');
    const record: WebhookDelivery = { id, ...delivery };

    const list = this.deliveries.get(webhookId) ?? [];
    list.push(record);
    this.deliveries.set(webhookId, list);

    // Update endpoint delivery stats
    const endpoint = this.endpoints.get(webhookId);
    if (endpoint) {
      endpoint.deliveryCount++;
      endpoint.lastDeliveryAt = record.receivedAt;
    }

    return record;
  }

  /**
   * Get paginated delivery history for an endpoint.
   */
  getDeliveries(
    webhookId: string,
    page: number,
    limit: number,
  ): { items: WebhookDelivery[]; total: number } {
    const all = (this.deliveries.get(webhookId) ?? []).slice().reverse(); // newest first
    const total = all.length;
    const items = all.slice((page - 1) * limit, page * limit);
    return { items, total };
  }

  /**
   * Build a delivery status from an orchestration status string.
   */
  orchestrationStatusToDeliveryStatus(orchStatus: string): WebhookDeliveryStatus {
    if (orchStatus === 'QUEUED') return 'QUEUED';
    if (orchStatus === 'DLQ') return 'DLQ';
    if (orchStatus === 'REJECTED' || orchStatus === 'DUPLICATE') return 'REJECTED';
    return 'ERROR';
  }
}
