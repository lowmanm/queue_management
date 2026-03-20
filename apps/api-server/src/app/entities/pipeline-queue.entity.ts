import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('pipeline_queues')
@Index('idx_pipeline_queues_pipeline', ['pipelineId'])
export class PipelineQueueEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'pipeline_id', type: 'varchar' })
  pipelineId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'smallint', default: 1 })
  priority: number;

  @Column({ name: 'required_skills', type: 'simple-json', nullable: true })
  requiredSkills?: string[];

  @Column({ name: 'preferred_skills', type: 'simple-json', nullable: true })
  preferredSkills?: string[];

  @Column({ name: 'max_capacity', type: 'integer', default: 0 })
  maxCapacity: number;

  @Column({ name: 'sla_overrides', type: 'simple-json', nullable: true })
  slaOverrides?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  stats?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
