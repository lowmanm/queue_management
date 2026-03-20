import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('volume_loader_runs')
@Index('idx_loader_runs_loader', ['loaderId'])
export class VolumeLoaderRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'loader_id', type: 'varchar' })
  loaderId: string;

  @Column({ type: 'varchar', default: 'RUNNING' })
  status: string;

  @Column({ type: 'varchar', default: 'manual' })
  trigger: string;

  @Column({ name: 'records_found', type: 'integer', default: 0 })
  recordsFound: number;

  @Column({ name: 'records_processed', type: 'integer', default: 0 })
  recordsProcessed: number;

  @Column({ name: 'records_failed', type: 'integer', default: 0 })
  recordsFailed: number;

  @Column({ name: 'records_skipped', type: 'integer', default: 0 })
  recordsSkipped: number;

  @Column({ name: 'files_processed', type: 'simple-json', nullable: true })
  filesProcessed?: string[];

  @Column({ name: 'error_log', type: 'simple-json', nullable: true })
  errorLog?: Record<string, unknown>[];

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs?: number;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt?: Date;

  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;
}
