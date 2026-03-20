import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent, AuditEventType, AggregateType } from '@nexus-queue/shared-models';
import { TaskEventEntity } from '../entities/task-event.entity';
import { MetricsService } from '../monitoring/metrics.service';
import { OutboundWebhookService } from './outbound-webhook.service';

/** Fields emitted by callers — id, occurredAt, and sequenceNum are set by the store */
export type EmitEventInput = Omit<AuditEvent, 'id' | 'occurredAt' | 'sequenceNum'>;

/**
 * EventStoreService — appends immutable domain events to the task_events table.
 *
 * All event writes are fire-and-forget: errors are logged but NEVER re-thrown
 * so that a persistence failure never disrupts the task flow.
 */
@Injectable()
export class EventStoreService {
  private readonly logger = new Logger(EventStoreService.name);

  constructor(
    @InjectRepository(TaskEventEntity)
    private readonly eventRepo: Repository<TaskEventEntity>,
    @Optional()
    private readonly metricsService?: MetricsService,
    @Optional()
    @Inject(forwardRef(() => OutboundWebhookService))
    private readonly outboundWebhooks?: OutboundWebhookService,
  ) {}

  /**
   * Persist a domain event.
   * Errors are caught and logged — this method never throws.
   */
  async emit(event: EmitEventInput): Promise<void> {
    try {
      const entity = this.eventRepo.create({
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        payload: event.payload,
        pipelineId: event.pipelineId,
        agentId: event.agentId,
      });
      await this.eventRepo.save(entity);

      // Record handle time metric when a task.completed event is emitted
      if (event.eventType === 'task.completed' && this.metricsService) {
        const handleTime = event.payload['handleTimeSeconds'];
        if (typeof handleTime === 'number') {
          this.metricsService.observeHandleTime(handleTime);
        }
      }

      // Fire-and-forget outbound webhook delivery — does not block task flow
      if (this.outboundWebhooks) {
        const saved = entity as TaskEventEntity & { id: string; occurredAt: Date; sequenceNum: number };
        setImmediate(() => {
          void this.outboundWebhooks?.onEvent({
            id: saved.id,
            eventType: event.eventType,
            aggregateId: event.aggregateId,
            aggregateType: event.aggregateType,
            payload: event.payload ?? {},
            occurredAt: saved.occurredAt ?? new Date(),
            pipelineId: event.pipelineId,
            agentId: event.agentId,
            sequenceNum: saved.sequenceNum ?? 0,
          } as AuditEvent);
        });
      }
    } catch (err) {
      this.logger.error(
        `Failed to persist domain event [${event.eventType}] for ${event.aggregateType}:${event.aggregateId}: ${err}`
      );
    }
  }

  /**
   * Query events with optional filters (used by AuditLogController).
   */
  async query(params: {
    aggregateType?: AggregateType;
    aggregateId?: string;
    eventType?: AuditEventType;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
  }): Promise<{ events: TaskEventEntity[]; total: number }> {
    const qb = this.eventRepo.createQueryBuilder('e');

    if (params.aggregateType) {
      qb.andWhere('e.aggregateType = :aggregateType', { aggregateType: params.aggregateType });
    }
    if (params.aggregateId) {
      qb.andWhere('e.aggregateId = :aggregateId', { aggregateId: params.aggregateId });
    }
    if (params.eventType) {
      qb.andWhere('e.eventType = :eventType', { eventType: params.eventType });
    }
    if (params.startDate) {
      qb.andWhere('e.occurredAt >= :startDate', { startDate: params.startDate });
    }
    if (params.endDate) {
      qb.andWhere('e.occurredAt <= :endDate', { endDate: params.endDate });
    }

    qb.orderBy('e.occurredAt', 'DESC');
    qb.skip((params.page - 1) * params.limit).take(params.limit);

    const [events, total] = await qb.getManyAndCount();
    return { events, total };
  }
}
