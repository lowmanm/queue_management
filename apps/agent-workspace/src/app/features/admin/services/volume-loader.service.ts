import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError } from 'rxjs';
import {
  VolumeLoader,
  VolumeLoaderType,
  VolumeLoaderRun,
  VolumeLoaderSummary,
  VolumeLoaderTestResult,
  CreateVolumeLoaderRequest,
  UpdateVolumeLoaderRequest,
  TriggerVolumeLoaderRequest,
  VolumeFieldMapping,
} from '@nexus-queue/shared-models';

const API_BASE = 'http://localhost:3000/api/volume-loaders';

@Injectable({
  providedIn: 'root',
})
export class VolumeLoaderApiService {
  private http = inject(HttpClient);

  // ==========================================================================
  // LOADER CRUD
  // ==========================================================================

  /**
   * Get all volume loaders
   */
  getAllLoaders(type?: VolumeLoaderType): Observable<VolumeLoader[]> {
    if (type) {
      return this.http.get<VolumeLoader[]>(API_BASE, { params: { type } }).pipe(
        catchError((err) => {
          console.error('Failed to fetch loaders:', err);
          return of([]);
        })
      );
    }
    return this.http.get<VolumeLoader[]>(API_BASE).pipe(
      catchError((err) => {
        console.error('Failed to fetch loaders:', err);
        return of([]);
      })
    );
  }

  /**
   * Get enabled loaders only
   */
  getEnabledLoaders(): Observable<VolumeLoader[]> {
    return this.http.get<VolumeLoader[]>(`${API_BASE}/enabled`).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Get summary statistics
   */
  getSummary(): Observable<VolumeLoaderSummary | null> {
    return this.http.get<VolumeLoaderSummary>(`${API_BASE}/summary`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Get a specific loader by ID
   */
  getLoader(id: string): Observable<VolumeLoader | null> {
    return this.http.get<VolumeLoader>(`${API_BASE}/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Create a new volume loader
   */
  createLoader(request: CreateVolumeLoaderRequest): Observable<VolumeLoader> {
    return this.http.post<VolumeLoader>(API_BASE, request);
  }

  /**
   * Update a volume loader
   */
  updateLoader(id: string, updates: UpdateVolumeLoaderRequest): Observable<VolumeLoader> {
    return this.http.put<VolumeLoader>(`${API_BASE}/${id}`, updates);
  }

  /**
   * Delete a volume loader
   */
  deleteLoader(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${API_BASE}/${id}`);
  }

  // ==========================================================================
  // LOADER CONTROL
  // ==========================================================================

  /**
   * Enable a volume loader
   */
  enableLoader(id: string): Observable<VolumeLoader> {
    return this.http.post<VolumeLoader>(`${API_BASE}/${id}/enable`, {});
  }

  /**
   * Disable a volume loader
   */
  disableLoader(id: string): Observable<VolumeLoader> {
    return this.http.post<VolumeLoader>(`${API_BASE}/${id}/disable`, {});
  }

  /**
   * Trigger a manual run
   */
  triggerRun(id: string, request?: TriggerVolumeLoaderRequest): Observable<VolumeLoaderRun> {
    return this.http.post<VolumeLoaderRun>(`${API_BASE}/${id}/run`, request || {});
  }

  // ==========================================================================
  // RUN HISTORY
  // ==========================================================================

  /**
   * Get runs for a specific loader
   */
  getLoaderRuns(id: string, limit = 50): Observable<VolumeLoaderRun[]> {
    return this.http.get<VolumeLoaderRun[]>(`${API_BASE}/${id}/runs`, {
      params: { limit: limit.toString() },
    }).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Get all runs across all loaders
   */
  getAllRuns(limit = 100): Observable<VolumeLoaderRun[]> {
    return this.http.get<VolumeLoaderRun[]>(`${API_BASE}/runs`, {
      params: { limit: limit.toString() },
    }).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Get a specific run by ID
   */
  getRun(loaderId: string, runId: string): Observable<VolumeLoaderRun | null> {
    return this.http.get<VolumeLoaderRun>(`${API_BASE}/${loaderId}/runs/${runId}`).pipe(
      catchError(() => of(null))
    );
  }

  // ==========================================================================
  // TESTING & VALIDATION
  // ==========================================================================

  /**
   * Test connection for a loader
   */
  testConnection(id: string): Observable<VolumeLoaderTestResult> {
    return this.http.post<VolumeLoaderTestResult>(`${API_BASE}/${id}/test`, {});
  }

  /**
   * Validate field mappings for a loader
   */
  validateMappings(
    id: string,
    mappings: VolumeFieldMapping[]
  ): Observable<{ success: boolean; errors?: string[] }> {
    return this.http.post<{ success: boolean; errors?: string[] }>(
      `${API_BASE}/${id}/validate-mappings`,
      { mappings }
    );
  }
}
