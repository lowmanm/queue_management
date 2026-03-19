import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('work_state_configs')
export class WorkStateConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  state: string;

  @Column({ type: 'varchar' })
  label: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'allows_work', type: 'boolean', default: false })
  allowsWork: boolean;

  @Column({ name: 'max_duration', type: 'integer', nullable: true })
  maxDuration?: number;

  @Column({ name: 'requires_reason', type: 'boolean', default: false })
  requiresReason: boolean;

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
