import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('queued_tasks')
@Index('idx_queue_dequeue', ['queueId', 'priority', 'enqueuedAt'])
export class QueuedTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', type: 'varchar', unique: true })
  taskId: string;

  @Column({ name: 'pipeline_id', type: 'varchar' })
  pipelineId: string;

  @Column({ name: 'queue_id', type: 'varchar', length: 100 })
  queueId: string;

  @Column({ name: 'task_payload', type: 'simple-json' })
  taskPayload: Record<string, unknown>;

  @Column({ type: 'smallint', default: 5 })
  priority: number;

  @Column({ name: 'retry_count', type: 'smallint', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', type: 'smallint', default: 3 })
  maxRetries: number;

  @Column({ name: 'last_failure_reason', type: 'varchar', nullable: true })
  lastFailureReason?: string;

  @Column({ name: 'sla_deadline', type: 'datetime', nullable: true })
  slaDeadline?: Date;

  @CreateDateColumn({ name: 'enqueued_at' })
  enqueuedAt: Date;
}
