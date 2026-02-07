import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  Disposition,
  CreateDispositionRequest,
  UpdateDispositionRequest,
  DispositionConfig,
  CompleteTaskRequest,
  TaskCompletion,
  DispositionStats,
  Queue,
  WorkType,
} from '@nexus-queue/shared-models';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class DispositionApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/dispositions`;

  // Cached config
  private readonly _config = new BehaviorSubject<DispositionConfig | null>(null);
  readonly config$ = this._config.asObservable();

  // ============ Dispositions ============

  /**
   * Get all dispositions
   */
  getAllDispositions(activeOnly = false): Observable<Disposition[]> {
    const params = activeOnly ? '?activeOnly=true' : '';
    return this.http.get<Disposition[]>(`${this.baseUrl}${params}`);
  }

  /**
   * Get dispositions for a specific context
   */
  getDispositionsForContext(queueId?: string, workTypeId?: string): Observable<Disposition[]> {
    const params = new URLSearchParams();
    if (queueId) params.set('queueId', queueId);
    if (workTypeId) params.set('workTypeId', workTypeId);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.http.get<Disposition[]>(`${this.baseUrl}/context${queryString}`);
  }

  /**
   * Get full configuration for Designer UI
   */
  getConfig(): Observable<DispositionConfig> {
    return this.http.get<DispositionConfig>(`${this.baseUrl}/config`).pipe(
      tap(config => this._config.next(config))
    );
  }

  /**
   * Get a specific disposition
   */
  getDisposition(id: string): Observable<Disposition> {
    return this.http.get<Disposition>(`${this.baseUrl}/${id}`);
  }

  /**
   * Create a new disposition
   */
  createDisposition(request: CreateDispositionRequest): Observable<Disposition> {
    return this.http.post<Disposition>(this.baseUrl, request);
  }

  /**
   * Update an existing disposition
   */
  updateDisposition(id: string, request: UpdateDispositionRequest): Observable<Disposition> {
    return this.http.put<Disposition>(`${this.baseUrl}/${id}`, request);
  }

  /**
   * Delete (deactivate) a disposition
   */
  deleteDisposition(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/${id}`);
  }

  /**
   * Reorder dispositions
   */
  reorderDispositions(orderedIds: string[]): Observable<Disposition[]> {
    return this.http.post<Disposition[]>(`${this.baseUrl}/reorder`, { orderedIds });
  }

  // ============ Queues ============

  /**
   * Get all queues
   */
  getAllQueues(activeOnly = false): Observable<Queue[]> {
    const params = activeOnly ? '?activeOnly=true' : '';
    return this.http.get<Queue[]>(`${this.baseUrl}/queues/all${params}`);
  }

  // ============ Work Types ============

  /**
   * Get all work types
   */
  getAllWorkTypes(activeOnly = false): Observable<WorkType[]> {
    const params = activeOnly ? '?activeOnly=true' : '';
    return this.http.get<WorkType[]>(`${this.baseUrl}/work-types/all${params}`);
  }

  // ============ Task Completion ============

  /**
   * Complete a task with disposition
   */
  completeTask(
    request: CompleteTaskRequest,
    agentId: string,
    metadata: {
      externalId?: string;
      workType: string;
      queue?: string;
      assignedAt: string;
    }
  ): Observable<TaskCompletion> {
    return this.http.post<TaskCompletion>(`${this.baseUrl}/complete`, {
      ...request,
      agentId,
      ...metadata,
    });
  }

  /**
   * Get completions for an agent
   */
  getAgentCompletions(agentId: string, limit = 50): Observable<TaskCompletion[]> {
    return this.http.get<TaskCompletion[]>(
      `${this.baseUrl}/completions/agent/${agentId}?limit=${limit}`
    );
  }

  /**
   * Get all completions (admin)
   */
  getAllCompletions(limit = 100): Observable<TaskCompletion[]> {
    return this.http.get<TaskCompletion[]>(`${this.baseUrl}/completions/all?limit=${limit}`);
  }

  /**
   * Get disposition usage statistics
   */
  getDispositionStats(): Observable<DispositionStats[]> {
    return this.http.get<DispositionStats[]>(`${this.baseUrl}/stats/usage`);
  }
}
