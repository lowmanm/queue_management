import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('task_completions')
@Index('idx_completions_agent', ['agentId'])
export class TaskCompletionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', type: 'varchar' })
  taskId: string;

  @Column({ name: 'external_id', type: 'varchar', nullable: true })
  externalId?: string;

  @Column({ name: 'agent_id', type: 'varchar' })
  agentId: string;

  @Column({ name: 'disposition_id', type: 'varchar' })
  dispositionId: string;

  @Column({ name: 'disposition_code', type: 'varchar' })
  dispositionCode: string;

  @Column({ name: 'disposition_category', type: 'varchar' })
  dispositionCategory: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ name: 'work_type', type: 'varchar', nullable: true })
  workType?: string;

  @Column({ type: 'varchar', nullable: true })
  queue?: string;

  @Column({ name: 'handle_time', type: 'integer', default: 0 })
  handleTime: number;

  @Column({ name: 'assigned_at', type: 'datetime' })
  assignedAt: Date;

  @CreateDateColumn({ name: 'completed_at' })
  completedAt: Date;
}
