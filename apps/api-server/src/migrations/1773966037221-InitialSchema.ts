import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1773966037221 implements MigrationInterface {
    name = 'InitialSchema1773966037221'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "work_state_configs" ("id" varchar PRIMARY KEY NOT NULL, "state" varchar NOT NULL, "label" varchar NOT NULL, "description" text, "allows_work" boolean NOT NULL DEFAULT (0), "max_duration" integer, "requires_reason" boolean NOT NULL DEFAULT (0), "created_by" varchar, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_ad7437642d15fa407cc9eddc917" UNIQUE ("state"))`);
        await queryRunner.query(`CREATE TABLE "volume_loaders" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "description" text, "type" varchar NOT NULL, "enabled" boolean NOT NULL DEFAULT (0), "pipeline_id" varchar, "config" text, "schedule" text, "data_format" text, "field_mappings" text, "defaults" text, "processing_options" text, "status" varchar NOT NULL DEFAULT ('DISABLED'), "stats" text, "last_run_at" datetime, "next_run_at" datetime, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_b63b22336737e29537ae129038c" UNIQUE ("name"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "password_hash" varchar, "display_name" varchar NOT NULL, "role" varchar NOT NULL, "email" varchar, "team_id" varchar, "skills" text, "active" boolean NOT NULL DEFAULT (1), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"))`);
        await queryRunner.query(`CREATE TABLE "teams" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "description" text, "manager_id" varchar, "queue_ids" text, "active" boolean NOT NULL DEFAULT (1), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_48c0c32e6247a2de155baeaf980" UNIQUE ("name"))`);
        await queryRunner.query(`CREATE TABLE "tasks" ("id" varchar PRIMARY KEY NOT NULL, "external_id" varchar, "pipeline_id" varchar, "queue_id" varchar, "work_type" varchar NOT NULL, "title" varchar NOT NULL, "description" text, "payload_url" text, "display_mode" varchar, "priority" smallint NOT NULL DEFAULT (5), "skills" text, "queue_name" varchar, "status" varchar(20) NOT NULL DEFAULT ('PENDING'), "payload" text, "assigned_to" varchar, "sla_deadline" datetime, "retry_count" smallint NOT NULL DEFAULT (0), "max_retries" smallint NOT NULL DEFAULT (3), "enqueued_at" datetime, "reserved_at" datetime, "completed_at" datetime, "disposition" text, "actions" text, "assignment_history" text, "reservation_timeout" integer, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_4605d60dbb18119788f4627052a" UNIQUE ("external_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4605d60dbb18119788f4627052" ON "tasks" ("external_id") `);
        await queryRunner.query(`CREATE INDEX "idx_tasks_queue_priority" ON "tasks" ("queue_id", "priority", "enqueued_at") WHERE status = 'PENDING'`);
        await queryRunner.query(`CREATE TABLE "volume_loader_runs" ("id" varchar PRIMARY KEY NOT NULL, "loader_id" varchar NOT NULL, "status" varchar NOT NULL DEFAULT ('RUNNING'), "trigger" varchar NOT NULL DEFAULT ('manual'), "records_found" integer NOT NULL DEFAULT (0), "records_processed" integer NOT NULL DEFAULT (0), "records_failed" integer NOT NULL DEFAULT (0), "records_skipped" integer NOT NULL DEFAULT (0), "files_processed" text, "error_log" text, "duration_ms" integer, "completed_at" datetime, "started_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "idx_loader_runs_loader" ON "volume_loader_runs" ("loader_id") `);
        await queryRunner.query(`CREATE TABLE "task_sources" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "type" varchar NOT NULL, "config" text, "active" boolean NOT NULL DEFAULT (1), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE TABLE "task_completions" ("id" varchar PRIMARY KEY NOT NULL, "task_id" varchar NOT NULL, "external_id" varchar, "agent_id" varchar NOT NULL, "disposition_id" varchar NOT NULL, "disposition_code" varchar NOT NULL, "disposition_category" varchar NOT NULL, "note" text, "work_type" varchar, "queue" varchar, "handle_time" integer NOT NULL DEFAULT (0), "assigned_at" datetime NOT NULL, "completed_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "idx_completions_agent" ON "task_completions" ("agent_id") `);
        await queryRunner.query(`CREATE TABLE "skills" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "category" varchar NOT NULL, "description" text, "active" boolean NOT NULL DEFAULT (1), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_81f05095507fd84aa2769b4a522" UNIQUE ("name"))`);
        await queryRunner.query(`CREATE TABLE "rule_sets" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "description" text, "enabled" boolean NOT NULL DEFAULT (1), "pipeline_id" varchar, "applies_to" text, "rules" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE TABLE "rules" ("id" varchar PRIMARY KEY NOT NULL, "rule_set_id" varchar NOT NULL, "name" varchar NOT NULL, "sort_order" integer NOT NULL DEFAULT (0), "enabled" boolean NOT NULL DEFAULT (1), "condition_group" text, "actions" text)`);
        await queryRunner.query(`CREATE INDEX "idx_rules_rule_set" ON "rules" ("rule_set_id") `);
        await queryRunner.query(`CREATE TABLE "queued_tasks" ("id" varchar PRIMARY KEY NOT NULL, "task_id" varchar NOT NULL, "pipeline_id" varchar NOT NULL, "queue_id" varchar(100) NOT NULL, "task_payload" text NOT NULL, "priority" smallint NOT NULL DEFAULT (5), "retry_count" smallint NOT NULL DEFAULT (0), "max_retries" smallint NOT NULL DEFAULT (3), "last_failure_reason" varchar, "sla_deadline" datetime, "enqueued_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_5dcac7b7c49e629f3e7c9325565" UNIQUE ("task_id"))`);
        await queryRunner.query(`CREATE INDEX "idx_queue_dequeue" ON "queued_tasks" ("queue_id", "priority", "enqueued_at") `);
        await queryRunner.query(`CREATE TABLE "pipelines" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "description" text, "enabled" boolean NOT NULL DEFAULT (1), "allowed_work_types" text, "defaults" text, "sla" text, "routing_rules" text, "default_routing" text, "stats" text, "data_schema" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_c17b72400f3135a6ca2f385c210" UNIQUE ("name"))`);
        await queryRunner.query(`CREATE TABLE "pipeline_queues" ("id" varchar PRIMARY KEY NOT NULL, "pipeline_id" varchar NOT NULL, "name" varchar NOT NULL, "description" text, "enabled" boolean NOT NULL DEFAULT (1), "priority" smallint NOT NULL DEFAULT (1), "required_skills" text, "preferred_skills" text, "max_capacity" integer NOT NULL DEFAULT (0), "sla_overrides" text, "stats" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "idx_pipeline_queues_pipeline" ON "pipeline_queues" ("pipeline_id") `);
        await queryRunner.query(`CREATE TABLE "dlq_entries" ("id" varchar PRIMARY KEY NOT NULL, "task_id" varchar NOT NULL, "queue_id" varchar(100) NOT NULL, "pipeline_id" varchar, "failure_reason" varchar(100) NOT NULL, "task_payload" text NOT NULL, "queued_task_payload" text NOT NULL, "retry_count" smallint NOT NULL DEFAULT (0), "failed_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_40ca25d9a56a75b5a350417959" ON "dlq_entries" ("task_id") `);
        await queryRunner.query(`CREATE INDEX "idx_dlq_queue" ON "dlq_entries" ("queue_id") `);
        await queryRunner.query(`CREATE TABLE "dispositions" ("id" varchar PRIMARY KEY NOT NULL, "code" varchar NOT NULL, "name" varchar NOT NULL, "description" text, "category" varchar NOT NULL, "requires_note" boolean NOT NULL DEFAULT (0), "active" boolean NOT NULL DEFAULT (1), "sort_order" integer NOT NULL DEFAULT (0), "icon" varchar, "color" varchar, "queue_ids" text, "work_type_ids" text, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_d1561899be1d1b1646ecbb37197" UNIQUE ("code"))`);
        await queryRunner.query(`CREATE TABLE "agent_skills" ("id" varchar PRIMARY KEY NOT NULL, "agent_id" varchar NOT NULL, "skill_id" varchar NOT NULL, "proficiency" integer NOT NULL DEFAULT (1), "active" boolean NOT NULL DEFAULT (1), "certified_at" datetime, "assigned_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "idx_agent_skills_agent" ON "agent_skills" ("agent_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "idx_agent_skills_agent"`);
        await queryRunner.query(`DROP TABLE "agent_skills"`);
        await queryRunner.query(`DROP TABLE "dispositions"`);
        await queryRunner.query(`DROP INDEX "idx_dlq_queue"`);
        await queryRunner.query(`DROP INDEX "IDX_40ca25d9a56a75b5a350417959"`);
        await queryRunner.query(`DROP TABLE "dlq_entries"`);
        await queryRunner.query(`DROP INDEX "idx_pipeline_queues_pipeline"`);
        await queryRunner.query(`DROP TABLE "pipeline_queues"`);
        await queryRunner.query(`DROP TABLE "pipelines"`);
        await queryRunner.query(`DROP INDEX "idx_queue_dequeue"`);
        await queryRunner.query(`DROP TABLE "queued_tasks"`);
        await queryRunner.query(`DROP INDEX "idx_rules_rule_set"`);
        await queryRunner.query(`DROP TABLE "rules"`);
        await queryRunner.query(`DROP TABLE "rule_sets"`);
        await queryRunner.query(`DROP TABLE "skills"`);
        await queryRunner.query(`DROP INDEX "idx_completions_agent"`);
        await queryRunner.query(`DROP TABLE "task_completions"`);
        await queryRunner.query(`DROP TABLE "task_sources"`);
        await queryRunner.query(`DROP INDEX "idx_loader_runs_loader"`);
        await queryRunner.query(`DROP TABLE "volume_loader_runs"`);
        await queryRunner.query(`DROP INDEX "idx_tasks_queue_priority"`);
        await queryRunner.query(`DROP INDEX "IDX_4605d60dbb18119788f4627052"`);
        await queryRunner.query(`DROP TABLE "tasks"`);
        await queryRunner.query(`DROP TABLE "teams"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "volume_loaders"`);
        await queryRunner.query(`DROP TABLE "work_state_configs"`);
    }

}
