import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { AuditEventType, AggregateType } from '@nexus-queue/shared-models';

@Entity('task_events')
@Index('idx_task_events_aggregate', ['aggregateType', 'aggregateId', 'occurredAt'])
@Index('idx_task_events_type_time', ['eventType', 'occurredAt'])
export class TaskEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType: AuditEventType;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 100 })
  aggregateId: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 20 })
  aggregateType: AggregateType;

  @Column({ name: 'payload', type: 'simple-json' })
  payload: Record<string, unknown>;

  @CreateDateColumn({ name: 'occurred_at' })
  occurredAt: Date;

  @Column({ name: 'pipeline_id', type: 'varchar', length: 100, nullable: true })
  pipelineId?: string;

  @Column({ name: 'agent_id', type: 'varchar', length: 100, nullable: true })
  agentId?: string;
}
