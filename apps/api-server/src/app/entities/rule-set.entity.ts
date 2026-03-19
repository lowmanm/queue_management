import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('rule_sets')
export class RuleSetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'pipeline_id', type: 'varchar', nullable: true })
  pipelineId?: string;

  @Column({ name: 'applies_to', type: 'simple-json', nullable: true })
  appliesTo?: Record<string, unknown>;

  @Column({ name: 'rules', type: 'simple-json', nullable: true })
  rules?: Record<string, unknown>[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
