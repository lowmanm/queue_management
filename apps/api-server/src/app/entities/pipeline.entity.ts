import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pipelines')
export class PipelineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'allowed_work_types', type: 'simple-json', nullable: true })
  allowedWorkTypes?: string[];

  @Column({ type: 'simple-json', nullable: true })
  defaults?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  sla?: Record<string, unknown>;

  @Column({ name: 'routing_rules', type: 'simple-json', nullable: true })
  routingRules?: Record<string, unknown>[];

  @Column({ name: 'default_routing', type: 'simple-json', nullable: true })
  defaultRouting?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  stats?: Record<string, unknown>;

  @Column({ name: 'data_schema', type: 'simple-json', nullable: true })
  dataSchema?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
