import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('volume_loaders')
export class VolumeLoaderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar' })
  type: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ name: 'pipeline_id', type: 'varchar', nullable: true })
  pipelineId?: string;

  @Column({ type: 'simple-json', nullable: true })
  config?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  schedule?: Record<string, unknown>;

  @Column({ name: 'data_format', type: 'simple-json', nullable: true })
  dataFormat?: Record<string, unknown>;

  @Column({ name: 'field_mappings', type: 'simple-json', nullable: true })
  fieldMappings?: Record<string, unknown>[];

  @Column({ type: 'simple-json', nullable: true })
  defaults?: Record<string, unknown>;

  @Column({ name: 'processing_options', type: 'simple-json', nullable: true })
  processingOptions?: Record<string, unknown>;

  @Column({ type: 'varchar', default: 'DISABLED' })
  status: string;

  @Column({ type: 'simple-json', nullable: true })
  stats?: Record<string, unknown>;

  @Column({ name: 'last_run_at', type: 'datetime', nullable: true })
  lastRunAt?: Date;

  @Column({ name: 'next_run_at', type: 'datetime', nullable: true })
  nextRunAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
