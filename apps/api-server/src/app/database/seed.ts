/**
 * Database seed script for Nexus Queue.
 *
 * Creates default reference data if the database is empty.
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   TS_NODE_PROJECT=apps/api-server/tsconfig.app.json npx ts-node apps/api-server/src/app/database/seed.ts
 *   npm run db:seed
 */

import { AppDataSource } from './data-source';
import {
  DEFAULT_DISPOSITIONS,
  DEFAULT_SKILLS,
  DEFAULT_USERS,
  DEFAULT_WORK_STATES,
} from './seed-data';

async function seed(): Promise<void> {
  console.log('Initializing database connection...');
  await AppDataSource.initialize();

  try {
    console.log('Starting seed...\n');
    await seedDispositions();
    await seedWorkStates();
    await seedSkills();
    await seedUsers();
    console.log('\nSeed complete.');
  } finally {
    await AppDataSource.destroy();
  }
}

async function seedDispositions(): Promise<void> {
  const repo = AppDataSource.getRepository('dispositions');
  const count = await repo.count();
  if (count > 0) {
    console.log(`Dispositions: skipped (${count} already exist)`);
    return;
  }

  for (const d of DEFAULT_DISPOSITIONS) {
    await repo.save({
      id: d.id,
      code: d.code,
      name: d.name,
      description: d.description,
      category: d.category,
      requiresNote: d.requiresNote,
      active: d.active,
      order: d.order,
      icon: d.icon,
      color: d.color,
      queueIds: d.queueIds,
      workTypeIds: d.workTypeIds,
    });
  }
  console.log(`Dispositions: seeded ${DEFAULT_DISPOSITIONS.length} records`);
}

async function seedWorkStates(): Promise<void> {
  const repo = AppDataSource.getRepository('work_state_configs');
  const count = await repo.count();
  if (count > 0) {
    console.log(`Work states: skipped (${count} already exist)`);
    return;
  }

  for (const ws of DEFAULT_WORK_STATES) {
    await repo.save({
      id: ws.id,
      state: ws.state,
      label: ws.label,
      description: ws.description,
      allowsWork: ws.allowsWork,
      maxDuration: ws.maxDuration,
      requiresReason: ws.requiresReason,
      createdBy: ws.createdBy,
    });
  }
  console.log(`Work states: seeded ${DEFAULT_WORK_STATES.length} records`);
}

async function seedSkills(): Promise<void> {
  const repo = AppDataSource.getRepository('skills');
  const count = await repo.count();
  if (count > 0) {
    console.log(`Skills: skipped (${count} already exist)`);
    return;
  }

  for (const s of DEFAULT_SKILLS) {
    await repo.save({
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
      active: s.active,
    });
  }
  console.log(`Skills: seeded ${DEFAULT_SKILLS.length} records`);
}

async function seedUsers(): Promise<void> {
  const repo = AppDataSource.getRepository('users');
  const count = await repo.count();
  if (count > 0) {
    console.log(`Users: skipped (${count} already exist)`);
    return;
  }

  for (const u of DEFAULT_USERS) {
    await repo.save({
      id: u.id,
      username: u.username,
      passwordHash: u.passwordHash,
      displayName: u.displayName,
      role: u.role,
      email: u.email,
      active: u.active,
    });
  }
  console.log(`Users: seeded ${DEFAULT_USERS.length} records`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
