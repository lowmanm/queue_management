import { Controller, Get, Query } from '@nestjs/common';
import { EventStoreService } from '../services/event-store.service';
import {
  AuditLogResponse,
  AuditEventType,
  AggregateType,
} from '@nexus-queue/shared-models';

/**
 * Query parameters for the audit log endpoint.
 * All fields are optional — omitting a field returns all values.
 */
interface AuditLogQueryParams {
  aggregateType?: string;
  aggregateId?: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  page?: string;
  limit?: string;
}

/**
 * AuditLogController — read-only query endpoint for the event store.
 *
 * GET /api/audit-log — returns paginated, filterable domain events.
 */
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly eventStore: EventStoreService) {}

  /**
   * GET /api/audit-log
   * Query domain events with optional filters and pagination.
   */
  @Get()
  async query(
    @Query() params: AuditLogQueryParams,
  ): Promise<AuditLogResponse> {
    const page = Math.max(1, parseInt(params.page ?? '1', 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(params.limit ?? '50', 10)),
    );

    const result = await this.eventStore.query({
      aggregateType: params.aggregateType as AggregateType | undefined,
      aggregateId: params.aggregateId,
      eventType: params.eventType as AuditEventType | undefined,
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
      page,
      limit,
    });

    return {
      events: result.events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        aggregateId: e.aggregateId,
        aggregateType: e.aggregateType,
        payload: e.payload,
        occurredAt: e.occurredAt,
        pipelineId: e.pipelineId,
        agentId: e.agentId,
        sequenceNum: 0,
      })),
      total: result.total,
      page,
      limit,
    };
  }
}
