import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  username: string;

  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash?: string;

  @Column({ name: 'display_name', type: 'varchar' })
  displayName: string;

  @Column({ type: 'varchar' })
  role: string;

  @Column({ type: 'varchar', nullable: true })
  email?: string;

  @Column({ name: 'team_id', type: 'varchar', nullable: true })
  teamId?: string;

  @Column({ type: 'simple-json', nullable: true })
  skills?: string[];

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
