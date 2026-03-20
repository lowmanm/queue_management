import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';

/**
 * Global DatabaseModule — imported once in AppModule.
 *
 * Connection strategy:
 *  - If DATABASE_URL or DB_HOST is set → connect to PostgreSQL
 *  - Otherwise                         → use SQLite (better-sqlite3) for local dev
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const databaseUrl = process.env['DATABASE_URL'];
        const dbHost = process.env['DB_HOST'];

        if (databaseUrl || dbHost) {
          // PostgreSQL mode
          return {
            type: 'postgres' as const,
            url: databaseUrl,
            host: databaseUrl ? undefined : (dbHost || 'localhost'),
            port: databaseUrl ? undefined : parseInt(process.env['DB_PORT'] || '5432', 10),
            username: databaseUrl ? undefined : (process.env['DB_USERNAME'] || 'postgres'),
            password: databaseUrl ? undefined : (process.env['DB_PASSWORD'] || 'postgres'),
            database: databaseUrl ? undefined : (process.env['DB_NAME'] || 'nexus_queue'),
            synchronize: false,
            migrationsRun: false,
            logging: process.env['NODE_ENV'] !== 'production',
            entities: [path.join(__dirname, '../entities/*.entity{.ts,.js}')],
            migrations: [path.join(__dirname, '../../migrations/*{.ts,.js}')],
          };
        }

        // SQLite fallback for local dev without Docker
        return {
          type: 'better-sqlite3' as const,
          database: process.env['SQLITE_PATH'] || ':memory:',
          synchronize: true, // auto-create schema in SQLite dev mode
          logging: false,
          entities: [path.join(__dirname, '../entities/*.entity{.ts,.js}')],
          migrations: [],
        };
      },
    }),
  ],
})
export class DatabaseModule {}
