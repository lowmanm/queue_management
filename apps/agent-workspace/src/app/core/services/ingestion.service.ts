import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  UploadResult,
  ExecutionResult,
  RecordStoreState,
  RoutingRule,
} from '@nexus-queue/shared-models';
import { environment } from '../../../environments/environment';

/**
 * Frontend service for the CSV ingestion and execution pipeline.
 * Communicates with the /api/ingestion endpoints.
 */
@Injectable({
  providedIn: 'root',
})
export class IngestionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/ingestion`;

  /**
   * Upload CSV data to the backend for parsing and validation.
   * Sends the raw text (not multipart) for POC simplicity.
   */
  uploadCsv(fileName: string, csvText: string): Observable<UploadResult> {
    return this.http.post<UploadResult>(`${this.baseUrl}/upload`, {
      fileName,
      csvText,
    });
  }

  /**
   * Execute the routing pipeline for a specific upload batch.
   */
  executeUpload(uploadId: string): Observable<ExecutionResult> {
    return this.http.post<ExecutionResult>(
      `${this.baseUrl}/execute/${uploadId}`,
      {}
    );
  }

  /**
   * Execute the most recent upload batch ("Run Now").
   */
  executeLatest(): Observable<ExecutionResult> {
    return this.http.post<ExecutionResult>(`${this.baseUrl}/execute`, {});
  }

  /**
   * Get the current state of the in-memory record store.
   */
  getStoreState(): Observable<RecordStoreState> {
    return this.http.get<RecordStoreState>(`${this.baseUrl}/store/state`);
  }

  /**
   * Get the number of pending tasks in the execution queue.
   */
  getQueueCount(): Observable<{ pendingTasks: number }> {
    return this.http.get<{ pendingTasks: number }>(
      `${this.baseUrl}/queue/count`
    );
  }

  /**
   * Get the current routing rules.
   */
  getRules(): Observable<RoutingRule[]> {
    return this.http.get<RoutingRule[]>(`${this.baseUrl}/rules`);
  }

  /**
   * Update routing rules.
   */
  setRules(rules: RoutingRule[]): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/rules`, {
      rules,
    });
  }
}
