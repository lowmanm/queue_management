import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('tasks')
@Index('idx_tasks_queue_priority', ['queueId', 'priority', 'enqueuedAt'], {
  where: "status = 'PENDING'",
})
export class TaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'external_id', type: 'varchar', nullable: true, unique: true })
  @Index()
  externalId?: string;

  @Column({ name: 'pipeline_id', type: 'varchar', nullable: true })
  pipelineId?: string;

  @Column({ name: 'queue_id', type: 'varchar', nullable: true })
  queueId?: string;

  @Column({ name: 'work_type', type: 'varchar' })
  workType: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'payload_url', type: 'text', nullable: true })
  payloadUrl?: string;

  @Column({ name: 'display_mode', type: 'varchar', nullable: true })
  displayMode?: string;

  @Column({ type: 'smallint', default: 5 })
  priority: number;

  @Column({ type: 'simple-json', nullable: true })
  skills?: string[];

  @Column({ name: 'queue_name', type: 'varchar', nullable: true })
  queueName?: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ type: 'simple-json', nullable: true })
  payload?: Record<string, string>;

  @Column({ name: 'assigned_to', type: 'varchar', nullable: true })
  assignedTo?: string;

  @Column({ name: 'sla_deadline', type: 'datetime', nullable: true })
  slaDeadline?: Date;

  @Column({ name: 'retry_count', type: 'smallint', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', type: 'smallint', default: 3 })
  maxRetries: number;

  @Column({ name: 'enqueued_at', type: 'datetime', nullable: true })
  enqueuedAt?: Date;

  @Column({ name: 'reserved_at', type: 'datetime', nullable: true })
  reservedAt?: Date;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt?: Date;

  @Column({ name: 'disposition', type: 'simple-json', nullable: true })
  disposition?: Record<string, unknown>;

  @Column({ name: 'actions', type: 'simple-json', nullable: true })
  actions?: Record<string, unknown>[];

  @Column({ name: 'assignment_history', type: 'simple-json', nullable: true })
  assignmentHistory?: Record<string, unknown>[];

  @Column({ name: 'reservation_timeout', type: 'integer', nullable: true })
  reservationTimeout?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
