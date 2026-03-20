import { DataSource } from 'typeorm';
import * as path from 'path';

/**
 * DataSource instance for the TypeORM CLI (migrations).
 * Uses the same env-var resolution as DatabaseModule.
 *
 * Usage:
 *   npm run db:migration:generate -- src/migrations/SomeDescription
 *   npm run db:migration:run
 */
const databaseUrl = process.env['DATABASE_URL'];
const dbHost = process.env['DB_HOST'];

export const AppDataSource = new DataSource(
  databaseUrl || dbHost
    ? {
        type: 'postgres',
        url: databaseUrl,
        host: databaseUrl ? undefined : (dbHost || 'localhost'),
        port: databaseUrl ? undefined : parseInt(process.env['DB_PORT'] || '5432', 10),
        username: databaseUrl ? undefined : (process.env['DB_USERNAME'] || 'postgres'),
        password: databaseUrl ? undefined : (process.env['DB_PASSWORD'] || 'postgres'),
        database: databaseUrl ? undefined : (process.env['DB_NAME'] || 'nexus_queue'),
        synchronize: false,
        logging: true,
        entities: [path.join(__dirname, '../entities/*.entity{.ts,.js}')],
        migrations: [path.join(__dirname, '../../migrations/*{.ts,.js}')],
      }
    : {
        type: 'better-sqlite3',
        database: process.env['SQLITE_PATH'] || 'nexus_queue_dev.sqlite',
        synchronize: false,
        logging: true,
        entities: [path.join(__dirname, '../entities/*.entity{.ts,.js}')],
        migrations: [path.join(__dirname, '../../migrations/*{.ts,.js}')],
      }
);
