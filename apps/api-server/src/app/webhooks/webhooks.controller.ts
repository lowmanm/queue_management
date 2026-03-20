import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  HttpException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UseGuards,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage, Throttle } from '@nestjs/throttler';
import { WebhooksService } from './webhooks.service';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';
import { Public } from '../auth/public.decorator';
import { WebhookStatus } from '@nexus-queue/shared-models';

/**
 * Per-token throttler guard.
 * Uses the webhook URL token as the throttle key so each endpoint has its own
 * independent rate-limit bucket (regardless of source IP).
 */
@Injectable()
export class WebhookThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
  ) {
    super(options, storageService, null as never);
  }

  protected override async getTracker(req: Request): Promise<string> {
    const token = (req.params as Record<string, string>)['token'] ?? '';
    return `webhook:${token}`;
  }
}

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly orchestrator: PipelineOrchestratorService,
  ) {}

  // ===========================================================================
  // INBOUND DELIVERY — Public (secured by HMAC token)
  // ===========================================================================

  /**
   * POST /api/webhooks/:token
   *
   * Ingest a task from an external system. No JWT required — the URL token
   * acts as the credential, with optional HMAC signing for extra security.
   *
   * Rate-limited per token bucket: default 100 requests / 60 seconds.
   * Returns 429 with Retry-After header when the limit is exceeded.
   */
  @Public()
  @UseGuards(WebhookThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 100 } })
  @Post(':token')
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<{ accepted: boolean; taskId?: string; status?: string }> {
    const startMs = Date.now();

    // Step 1: Resolve endpoint by token
    const endpoint = this.webhooks.lookupByToken(token);
    if (!endpoint || endpoint.status !== 'active') {
      throw new ForbiddenException('Invalid or inactive webhook token');
    }

    // Step 2: Verify HMAC signature if present
    const signatureHeader = req.headers['x-nexus-signature'] as string | undefined;
    if (signatureHeader) {
      const rawBody = JSON.stringify(body);
      if (!this.webhooks.verifySignature(endpoint.secret, rawBody, signatureHeader)) {
        this.webhooks.logDelivery(endpoint.id, {
          webhookId: endpoint.id,
          receivedAt: new Date().toISOString(),
          sourceIp: req.ip,
          payloadBytes: Buffer.byteLength(rawBody),
          status: 'ERROR',
          orchestrationStatus: 'REJECTED',
          errorMessage: 'Invalid HMAC signature',
          processingMs: Date.now() - startMs,
        });
        throw new BadRequestException('Invalid HMAC signature');
      }
    }

    // Step 3: Ingest the task through the pipeline orchestrator
    const taskData = this.extractTaskData(body);
    let result;
    try {
      result = await this.orchestrator.ingestTask({
        pipelineId: endpoint.pipelineId,
        taskData,
        source: 'api',
        sourceId: `webhook:${endpoint.id}`,
      });
    } catch {
      this.webhooks.logDelivery(endpoint.id, {
        webhookId: endpoint.id,
        receivedAt: new Date().toISOString(),
        sourceIp: req.ip,
        payloadBytes: Buffer.byteLength(JSON.stringify(body)),
        status: 'ERROR',
        orchestrationStatus: 'ERROR',
        errorMessage: 'Orchestration threw an unexpected error',
        processingMs: Date.now() - startMs,
      });
      throw new HttpException('Queue at capacity — retry later', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Step 4: Map orchestration status → HTTP response
    const processingMs = Date.now() - startMs;
    const deliveryStatus = this.webhooks.orchestrationStatusToDeliveryStatus(result.status);

    this.webhooks.logDelivery(endpoint.id, {
      webhookId: endpoint.id,
      receivedAt: new Date().toISOString(),
      sourceIp: req.ip,
      payloadBytes: Buffer.byteLength(JSON.stringify(body)),
      status: deliveryStatus,
      orchestrationStatus: result.status,
      taskId: result.taskId,
      errorMessage: result.error,
      processingMs,
    });

    if (result.status === 'HELD') {
      // Queue is at capacity — signal backpressure
      throw new HttpException('Queue at capacity — retry later', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (result.status === 'QUEUED') {
      return { accepted: true, taskId: result.taskId, status: 'QUEUED' };
    }

    // DLQ, REJECTED, DUPLICATE — accepted at transport level, rejected at business level
    return { accepted: false, status: result.status };
  }

  // ===========================================================================
  // ADMIN CRUD — Protected by JWT (global JwtAuthGuard)
  // ===========================================================================

  /** GET /api/webhooks — list all endpoints, optionally filtered by ?pipelineId= */
  @Get()
  list(@Query('pipelineId') pipelineId?: string) {
    return this.webhooks.listEndpoints(pipelineId);
  }

  /** POST /api/webhooks — create a new endpoint */
  @Post()
  create(@Body() body: { pipelineId: string; name: string; rateLimit?: { limit: number; ttl: number } }) {
    return this.webhooks.createEndpoint(body.pipelineId, body.name, body.rateLimit);
  }

  /** DELETE /api/webhooks/:id — delete an endpoint */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): void {
    const endpoint = this.webhooks.getEndpoint(id);
    if (!endpoint) {
      throw new NotFoundException(`Webhook endpoint not found: ${id}`);
    }
    this.webhooks.deleteEndpoint(id);
  }

  /** PATCH /api/webhooks/:id/status — toggle active/inactive */
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: WebhookStatus },
  ) {
    const endpoint = this.webhooks.getEndpoint(id);
    if (!endpoint) {
      throw new NotFoundException(`Webhook endpoint not found: ${id}`);
    }
    return this.webhooks.toggleStatus(id, body.status);
  }

  /** POST /api/webhooks/:id/regenerate-token — issue a new token */
  @Post(':id/regenerate-token')
  regenerateToken(@Param('id') id: string) {
    const endpoint = this.webhooks.getEndpoint(id);
    if (!endpoint) {
      throw new NotFoundException(`Webhook endpoint not found: ${id}`);
    }
    return this.webhooks.regenerateToken(id);
  }

  /** GET /api/webhooks/:id/deliveries — paginated delivery log */
  @Get(':id/deliveries')
  getDeliveries(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const endpoint = this.webhooks.getEndpoint(id);
    if (!endpoint) {
      throw new NotFoundException(`Webhook endpoint not found: ${id}`);
    }
    return this.webhooks.getDeliveries(id, parseInt(page, 10), parseInt(limit, 10));
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Map an arbitrary webhook payload to TaskFromSource fields.
   * Callers may send well-known fields or the orchestrator will apply defaults.
   */
  private extractTaskData(body: Record<string, unknown>) {
    return {
      externalId: (body['externalId'] as string) || (body['id'] as string) || '',
      workType: (body['workType'] as string) || 'GENERAL',
      title: (body['title'] as string) || 'Webhook Task',
      description: body['description'] as string | undefined,
      priority: typeof body['priority'] === 'number' ? (body['priority'] as number) : 5,
      queue: body['queue'] as string | undefined,
      skills: Array.isArray(body['skills']) ? (body['skills'] as string[]) : [],
      payloadUrl: (body['payloadUrl'] as string) || '',
      metadata: this.flattenMetadata(body),
    };
  }

  /**
   * Flatten the body into string-valued metadata, excluding top-level known fields.
   */
  private flattenMetadata(body: Record<string, unknown>): Record<string, string> {
    const reserved = new Set(['externalId', 'id', 'workType', 'title', 'description', 'priority', 'queue', 'skills', 'payloadUrl']);
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!reserved.has(k) && v !== undefined && v !== null) {
        result[k] = String(v);
      }
    }
    return result;
  }
}
