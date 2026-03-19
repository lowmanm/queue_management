import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('dlq_entries')
@Index('idx_dlq_queue', ['queueId'])
export class DLQEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', type: 'varchar' })
  @Index()
  taskId: string;

  @Column({ name: 'queue_id', type: 'varchar', length: 100 })
  queueId: string;

  @Column({ name: 'pipeline_id', type: 'varchar', nullable: true })
  pipelineId?: string;

  @Column({ name: 'failure_reason', type: 'varchar', length: 100 })
  failureReason: string;

  @Column({ name: 'task_payload', type: 'simple-json' })
  taskPayload: Record<string, unknown>;

  @Column({ name: 'queued_task_payload', type: 'simple-json' })
  queuedTaskPayload: Record<string, unknown>;

  @Column({ name: 'retry_count', type: 'smallint', default: 0 })
  retryCount: number;

  @CreateDateColumn({ name: 'failed_at' })
  failedAt: Date;
}
