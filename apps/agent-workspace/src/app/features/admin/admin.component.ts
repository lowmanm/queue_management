import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  UploadResult,
  ExecutionResult,
  RecordStoreState,
} from '@nexus-queue/shared-models';
import { IngestionService } from '../../core/services/ingestion.service';

type PipelineStage = 'idle' | 'uploading' | 'uploaded' | 'executing' | 'executed';

/**
 * Admin panel for CSV upload, execution, and pipeline monitoring.
 * Provides transparent feedback at every stage of the data flow.
 */
@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent {
  private ingestionService = inject(IngestionService);

  stage: PipelineStage = 'idle';

  uploadResult: UploadResult | null = null;
  executionResult: ExecutionResult | null = null;
  storeState: RecordStoreState | null = null;
  errorMessage: string | null = null;

  constructor() {
    this.refreshStoreState();
  }

  /**
   * Handle file selection from the file input.
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.errorMessage = null;
    this.stage = 'uploading';
    this.uploadResult = null;
    this.executionResult = null;

    const reader = new FileReader();
    reader.onload = () => {
      const csvText = reader.result as string;
      this.ingestionService.uploadCsv(file.name, csvText).subscribe({
        next: (result) => {
          this.uploadResult = result;
          this.stage = 'uploaded';
          this.refreshStoreState();
        },
        error: (err) => {
          this.errorMessage = `Upload failed: ${err.message || 'Unknown error'}`;
          this.stage = 'idle';
        },
      });
    };
    reader.onerror = () => {
      this.errorMessage = 'Failed to read the selected file.';
      this.stage = 'idle';
    };
    reader.readAsText(file);
  }

  /**
   * Trigger execution for the most recent upload.
   */
  runNow(): void {
    const uploadId = this.uploadResult?.uploadId;
    if (!uploadId) {
      this.errorMessage = 'No upload to execute. Please upload a CSV file first.';
      return;
    }

    this.errorMessage = null;
    this.stage = 'executing';
    this.executionResult = null;

    this.ingestionService.executeUpload(uploadId).subscribe({
      next: (result) => {
        this.executionResult = result;
        this.stage = 'executed';
        this.refreshStoreState();
      },
      error: (err) => {
        this.errorMessage = `Execution failed: ${err.message || 'Unknown error'}`;
        this.stage = 'uploaded';
      },
    });
  }

  /**
   * Reset the pipeline for a new upload.
   */
  reset(): void {
    this.stage = 'idle';
    this.uploadResult = null;
    this.executionResult = null;
    this.errorMessage = null;
    this.refreshStoreState();
  }

  get workTypeEntries(): [string, number][] {
    if (!this.executionResult?.routedByWorkType) return [];
    return Object.entries(this.executionResult.routedByWorkType);
  }

  private refreshStoreState(): void {
    this.ingestionService.getStoreState().subscribe({
      next: (state) => (this.storeState = state),
      error: () => {
        /* ignore refresh errors */
      },
    });
  }
}
