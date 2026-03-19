import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { DLQEntry } from '@nexus-queue/shared-models';
import { environment } from '../../../../environments/environment';

const DLQ_API = `${environment.apiUrl}/queues/dlq`;

/**
 * Filters for querying DLQ tasks
 */
export interface DlqFilter {
  pipelineId?: string;
  queueId?: string;
  reason?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * DLQ statistics grouped by reason, queue, and pipeline
 */
export interface DlqStats {
  total: number;
  byReason: Record<string, number>;
  byQueue: Record<string, number>;
  byPipeline: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class DlqApiService {
  private http = inject(HttpClient);

  /**
   * Get all DLQ tasks, optionally filtered
   */
  getDlqTasks(filters?: DlqFilter): Observable<DLQEntry[]> {
    let params = new HttpParams();
    if (filters) {
      if (filters.pipelineId) params = params.set('pipelineId', filters.pipelineId);
      if (filters.queueId) params = params.set('queueId', filters.queueId);
      if (filters.reason) params = params.set('reason', filters.reason);
      if (filters.fromDate) params = params.set('fromDate', filters.fromDate);
      if (filters.toDate) params = params.set('toDate', filters.toDate);
      if (filters.limit !== undefined) params = params.set('limit', filters.limit.toString());
      if (filters.offset !== undefined) params = params.set('offset', filters.offset.toString());
    }
    return this.http.get<DLQEntry[]>(DLQ_API, { params }).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Get aggregate DLQ statistics grouped by reason, queue, and pipeline
   */
  getDlqStats(): Observable<DlqStats> {
    return this.http.get<DlqStats>(`${DLQ_API}/stats`).pipe(
      catchError(() => of({ total: 0, byReason: {}, byQueue: {}, byPipeline: {} }))
    );
  }

  /**
   * Retry a DLQ task — sends it back through the orchestrator
   */
  retryTask(taskId: string): Observable<void> {
    return this.http.post<void>(`${DLQ_API}/${taskId}/retry`, {});
  }

  /**
   * Reroute a DLQ task to a different queue
   */
  rerouteTask(taskId: string, targetQueueId: string): Observable<void> {
    return this.http.post<void>(`${DLQ_API}/${taskId}/reroute`, { targetQueueId });
  }

  /**
   * Permanently discard a DLQ task
   */
  discardTask(taskId: string): Observable<void> {
    return this.http.delete<void>(`${DLQ_API}/${taskId}`);
  }
}
