import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  TaskSource,
  CsvParseResult,
  PendingOrder,
  TaskQueueStats,
  PendingOrderStatus,
} from '@nexus-queue/shared-models';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class TaskSourceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/task-sources`;

  // Observable state
  private readonly _queueStats = new BehaviorSubject<TaskQueueStats | null>(null);
  readonly queueStats$ = this._queueStats.asObservable();

  private readonly _activeSource = new BehaviorSubject<TaskSource | null>(null);
  readonly activeSource$ = this._activeSource.asObservable();

  // ============ Source Configuration ============

  /**
   * Get all task source configurations
   */
  getAllSources(): Observable<TaskSource[]> {
    return this.http.get<TaskSource[]>(this.baseUrl);
  }

  /**
   * Get the active source configuration
   */
  getActiveSource(): Observable<TaskSource | null> {
    return this.http.get<TaskSource | null>(`${this.baseUrl}/active`).pipe(
      tap(source => this._activeSource.next(source))
    );
  }

  /**
   * Get a specific source by ID
   */
  getSource(id: string): Observable<TaskSource> {
    return this.http.get<TaskSource>(`${this.baseUrl}/${id}`);
  }

  /**
   * Create a new source configuration
   */
  createSource(source: Partial<TaskSource>): Observable<TaskSource> {
    return this.http.post<TaskSource>(this.baseUrl, source);
  }

  /**
   * Update an existing source configuration
   */
  updateSource(id: string, source: Partial<TaskSource>): Observable<TaskSource> {
    return this.http.put<TaskSource>(`${this.baseUrl}/${id}`, source);
  }

  /**
   * Activate a source
   */
  activateSource(id: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.baseUrl}/${id}/activate`, {});
  }

  // ============ CSV Upload ============

  /**
   * Upload CSV content
   */
  uploadCsv(content: string, sourceId?: string): Observable<CsvParseResult> {
    return this.http.post<CsvParseResult>(`${this.baseUrl}/upload/csv`, {
      content,
      sourceId,
    }).pipe(
      tap(() => this.refreshQueueStats())
    );
  }

  /**
   * Preview URL from template and sample data
   */
  previewUrl(template: string, sampleData: Record<string, string>): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.baseUrl}/preview-url`, {
      template,
      sampleData,
    });
  }

  // ============ Order Queue ============

  /**
   * Get all orders
   */
  getAllOrders(): Observable<PendingOrder[]> {
    return this.http.get<PendingOrder[]>(`${this.baseUrl}/orders/all`);
  }

  /**
   * Get orders by status
   */
  getOrdersByStatus(status: PendingOrderStatus): Observable<PendingOrder[]> {
    return this.http.get<PendingOrder[]>(`${this.baseUrl}/orders/status/${status}`);
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): Observable<TaskQueueStats> {
    return this.http.get<TaskQueueStats>(`${this.baseUrl}/orders/stats`).pipe(
      tap(stats => this._queueStats.next(stats))
    );
  }

  /**
   * Refresh queue stats (for internal use after mutations)
   */
  refreshQueueStats(): void {
    this.getQueueStats().subscribe();
  }

  /**
   * Check if there are pending orders
   */
  hasPendingOrders(): Observable<{ hasPending: boolean; count: number }> {
    return this.http.get<{ hasPending: boolean; count: number }>(`${this.baseUrl}/orders/has-pending`);
  }

  /**
   * Complete an order
   */
  completeOrder(rowIndex: number): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.baseUrl}/orders/${rowIndex}/complete`, {}).pipe(
      tap(() => this.refreshQueueStats())
    );
  }

  /**
   * Release an order
   */
  releaseOrder(rowIndex: number): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.baseUrl}/orders/${rowIndex}/release`, {}).pipe(
      tap(() => this.refreshQueueStats())
    );
  }

  /**
   * Clear all orders
   */
  clearOrders(): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/orders`).pipe(
      tap(() => this.refreshQueueStats())
    );
  }
}
