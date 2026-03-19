import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('dispositions')
export class DispositionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  code: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar' })
  category: string;

  @Column({ name: 'requires_note', type: 'boolean', default: false })
  requiresNote: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  order: number;

  @Column({ type: 'varchar', nullable: true })
  icon?: string;

  @Column({ type: 'varchar', nullable: true })
  color?: string;

  @Column({ name: 'queue_ids', type: 'simple-json', nullable: true })
  queueIds?: string[];

  @Column({ name: 'work_type_ids', type: 'simple-json', nullable: true })
  workTypeIds?: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
