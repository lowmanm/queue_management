import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';

@Entity('rules')
@Index('idx_rules_rule_set', ['ruleSetId'])
export class RuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'rule_set_id', type: 'varchar' })
  ruleSetId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  order: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'condition_group', type: 'simple-json', nullable: true })
  conditionGroup?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  actions?: Record<string, unknown>[];
}
