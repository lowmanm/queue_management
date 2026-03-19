import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('agent_skills')
@Index('idx_agent_skills_agent', ['agentId'])
export class AgentSkillEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agent_id', type: 'varchar' })
  agentId: string;

  @Column({ name: 'skill_id', type: 'varchar' })
  skillId: string;

  @Column({ type: 'integer', default: 1 })
  proficiency: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'certified_at', type: 'datetime', nullable: true })
  certifiedAt?: Date;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
