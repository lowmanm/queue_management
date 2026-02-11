import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { CsvIngestionService } from './csv-ingestion.service';
import { RecordStoreService } from './record-store.service';
import { RoutingEngineService } from './routing-engine.service';
import { ExecutionService } from './execution.service';

@Module({
  controllers: [IngestionController],
  providers: [
    CsvIngestionService,
    RecordStoreService,
    RoutingEngineService,
    ExecutionService,
  ],
  exports: [RecordStoreService, ExecutionService, RoutingEngineService],
})
export class IngestionModule {}
