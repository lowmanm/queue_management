import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHmac } from 'crypto';
import axios from 'axios';
import { AuditEvent, CallbackEvent } from '@nexus-queue/shared-models';
import { EventStoreService } from './event-store.service';
import { PipelineService } from '../pipelines/pipeline.service';

/** Millisecond delays between retry attempts */
const RETRY_DELAYS = [5000, 25000, 125000];

/** Map AuditEventType strings to CallbackEvent strings where applicable */
const AUDIT_TO_CALLBACK: Record<string, CallbackEvent> = {
  'task.completed': 'task.completed',
  'task.dlq': 'task.dlq',
  'sla.breach': 'sla.breach',
};

/**
 * OutboundWebhookService — fires HMAC-signed HTTP callbacks to external systems
 * when subscribed pipeline lifecycle events occur.
 *
 * Usage: call `onEvent(auditEvent)` asynchronously (fire-and-forget) after
 * any domain event is appended to the EventStore.
 */
@Injectable()
export class OutboundWebhookService {
  private readonly logger = new Logger(OutboundWebhookService.name);

  private readonly outboundSecret =
    process.env['OUTBOUND_WEBHOOK_SECRET'] ?? 'nexus-outbound-secret-dev';

  constructor(
    @Optional() private readonly pipelineService?: PipelineService,
    @Optional() private readonly eventStore?: EventStoreService,
  ) {}

  /**
   * Process a domain event and fire an outbound callback if the pipeline
   * has subscribed to this event type.
   *
   * This method never throws — all errors are logged and swallowed so
   * that outbound delivery failures never disrupt the main task flow.
   */
  async onEvent(event: AuditEvent): Promise<void> {
    try {
      await this.handleEvent(event);
    } catch (err) {
      this.logger.error(
        `Unexpected error processing outbound webhook for event ${event.eventType}:${event.aggregateId}: ${err}`
      );
    }
  }

  // ===========================================================================
  // Private implementation
  // ===========================================================================

  private async handleEvent(event: AuditEvent): Promise<void> {
    // Only process task events (they carry pipelineId)
    if (event.aggregateType !== 'task') {
      return;
    }

    const callbackEvent = AUDIT_TO_CALLBACK[event.eventType];
    if (!callbackEvent) {
      return;
    }

    const pipelineId = event.pipelineId;
    if (!pipelineId || !this.pipelineService) {
      return;
    }

    const pipeline = this.pipelineService.getPipelineById(pipelineId);
    if (!pipeline?.callbackUrl) {
      return;
    }

    if (!pipeline.callbackEvents?.includes(callbackEvent)) {
      return;
    }

    const payload = {
      taskId: event.aggregateId,
      pipelineId,
      eventType: event.eventType,
      timestamp: event.occurredAt,
      metadata: event.payload,
    };

    const signature =
      'sha256=' +
      createHmac('sha256', this.outboundSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

    const delivered = await this.postWithRetry(pipeline.callbackUrl, payload, signature);

    if (this.eventStore) {
      if (delivered) {
        void this.eventStore.emit({
          eventType: 'outbound.webhook.sent',
          aggregateId: event.aggregateId,
          aggregateType: 'task',
          payload: { callbackUrl: pipeline.callbackUrl, eventType: event.eventType },
          pipelineId,
        });
      } else {
        void this.eventStore.emit({
          eventType: 'outbound.webhook.failed',
          aggregateId: event.aggregateId,
          aggregateType: 'task',
          payload: {
            callbackUrl: pipeline.callbackUrl,
            eventType: event.eventType,
            retries: RETRY_DELAYS.length,
          },
          pipelineId,
        });
      }
    }
  }

  /**
   * POST payload to url with HMAC signature, retrying on failure.
   * Returns true if delivery succeeded, false if all retries were exhausted.
   */
  private async postWithRetry(
    url: string,
    payload: Record<string, unknown>,
    signature: string,
  ): Promise<boolean> {
    const headers = {
      'Content-Type': 'application/json',
      'X-Nexus-Signature': signature,
    };

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        await axios.post(url, payload, { headers, timeout: 10000 });
        return true;
      } catch (err) {
        if (attempt < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[attempt];
          this.logger.warn(
            `Outbound webhook POST to ${url} failed (attempt ${attempt + 1}/${RETRY_DELAYS.length + 1}), ` +
              `retrying in ${delay}ms: ${err}`
          );
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(
      `Outbound webhook POST to ${url} failed after ${RETRY_DELAYS.length + 1} attempts`
    );
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
