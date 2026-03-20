import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { Pipeline, PipelineBundle } from '@nexus-queue/shared-models';
import { PipelineApiService } from '../../services/pipeline.service';

@Component({
  selector: 'app-pipeline-portability',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './pipeline-portability.component.html',
  styleUrl: './pipeline-portability.component.scss',
})
export class PipelinePortabilityComponent implements OnDestroy {
  private readonly pipelineService = inject(PipelineApiService);
  private readonly destroy$ = new Subject<void>();

  /** Set for export/clone operations; null for import-only mode. */
  pipelineId = input<string | null>(null);
  pipelineName = input<string>('');

  cloned = output<Pipeline>();
  imported = output<Pipeline>();
  closed = output<void>();

  readonly mode = signal<'idle' | 'import' | 'export' | 'clone'>('idle');
  readonly importBundle = signal<PipelineBundle | null>(null);
  readonly importErrors = signal<Array<{ field: string; message: string }>>([]);
  readonly importing = signal<boolean>(false);
  readonly cloning = signal<boolean>(false);
  readonly exportSuccess = signal<boolean>(false);
  readonly parseError = signal<string>('');

  startExport(): void {
    const id = this.pipelineId();
    if (!id) return;

    this.pipelineService.exportPipeline(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe((bundle) => {
        this.pipelineService.downloadBundle(bundle, this.pipelineName() || id);
        this.exportSuccess.set(true);
      });
  }

  startClone(): void {
    const id = this.pipelineId();
    if (!id || this.cloning()) return;

    this.cloning.set(true);
    this.pipelineService.clonePipeline(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (pipeline) => {
          this.cloning.set(false);
          this.cloned.emit(pipeline);
          this.closed.emit();
        },
        error: () => {
          this.cloning.set(false);
        },
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.parseError.set('');
    this.importBundle.set(null);
    this.importErrors.set([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const bundle = JSON.parse(e.target?.result as string) as PipelineBundle;
        this.importBundle.set(bundle);
      } catch {
        this.parseError.set('Invalid JSON file — please upload a valid pipeline bundle.');
      }
    };
    reader.readAsText(file);
  }

  submitImport(): void {
    const bundle = this.importBundle();
    if (!bundle || this.importing()) return;

    this.importing.set(true);
    this.importErrors.set([]);

    this.pipelineService.importPipeline(bundle)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.importing.set(false);
          if (result.success && result.pipelineId) {
            const partial: Pipeline = {
              id: result.pipelineId,
              name: bundle.pipeline.name,
              enabled: false,
              allowedWorkTypes: bundle.pipeline.workTypes ?? [],
              defaults: { priority: 5, reservationTimeoutSeconds: 30, autoAccept: false },
              routingRules: [],
              defaultRouting: { behavior: 'route_to_queue' },
              stats: { totalTasksProcessed: 0, tasksInQueue: 0, tasksActive: 0, avgHandleTime: 0, avgQueueWaitTime: 0, currentServiceLevel: 100, lastUpdated: '' },
              createdAt: '',
              updatedAt: '',
            };
            this.imported.emit(partial);
            this.closed.emit();
          } else {
            this.importErrors.set(result.errors ?? []);
          }
        },
        error: () => {
          this.importing.set(false);
          this.importErrors.set([{ field: 'request', message: 'Import request failed. Please try again.' }]);
        },
      });
  }

  close(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
