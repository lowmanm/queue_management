import { Module } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller';
import { ServicesModule } from '../services/services.module';

/**
 * AuditLogModule — exposes the read-only audit log query endpoint.
 * Imports ServicesModule to access the shared EventStoreService.
 */
@Module({
  imports: [ServicesModule],
  controllers: [AuditLogController],
})
export class AuditLogModule {}
