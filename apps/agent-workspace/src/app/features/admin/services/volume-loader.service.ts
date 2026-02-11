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
import { environment } from '../../../../environments/environment';

const API_BASE = `${environment.apiUrl}/volume-loaders`;

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
   * Get impact summary for deleting a volume loader
   */
  getDeleteImpact(id: string): Observable<LoaderDeleteImpact> {
    return this.http.get<LoaderDeleteImpact>(`${API_BASE}/${id}/delete-impact`).pipe(
      catchError(() => of({ found: false, runCount: 0, queueCount: 0, routingRuleCount: 0 } as LoaderDeleteImpact))
    );
  }

  /**
   * Delete a volume loader. Use cascade=true to also delete the associated pipeline.
   */
  deleteLoader(id: string, cascade = false): Observable<{ success: boolean; message: string; cascadeResults?: string[] }> {
    const url = cascade ? `${API_BASE}/${id}?cascade=true` : `${API_BASE}/${id}`;
    return this.http.delete<{ success: boolean; message: string; cascadeResults?: string[] }>(url);
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
    return this.http.get<VolumeLoaderRun>(`${API_BASE}/${loaderId}/runs/${runId}`);
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

  // ==========================================================================
  // DIRECT CSV UPLOAD
  // ==========================================================================

  /**
   * Upload CSV content directly to a loader for immediate processing.
   * Uses the loader's field mappings and defaults to create tasks.
   *
   * @param id - The loader ID with configured field mappings
   * @param csvContent - The CSV content as a string
   * @param dryRun - If true, parse but don't create tasks (preview mode)
   * @returns Processing result with counts and any errors
   */
  uploadCsv(
    id: string,
    csvContent: string,
    dryRun = false
  ): Observable<CsvUploadResult> {
    return this.http.post<CsvUploadResult>(`${API_BASE}/${id}/upload-csv`, {
      csvContent,
      dryRun,
    });
  }

  /**
   * Test routing rules against staged records (dry run).
   * Returns per-record routing results and queue volume preview.
   */
  testRouting(
    id: string,
    maxRecords = 10
  ): Observable<RoutingTestResult> {
    return this.http.post<RoutingTestResult>(`${API_BASE}/${id}/test-routing`, {
      maxRecords,
    }).pipe(
      catchError(() => of({
        success: false,
        error: 'Routing test not available',
        totalStaged: 0,
        testedCount: 0,
        results: [],
        queueVolume: [],
        routingSummary: { totalRouted: 0, totalUnrouted: 0, totalErrors: 0 },
      }))
    );
  }
}

/**
 * Result of a CSV upload operation
 */
export interface CsvUploadResult {
  success: boolean;
  recordsFound: number;
  recordsProcessed: number;
  recordsFailed: number;
  recordsSkipped: number;
  recordsStaged?: number;
  errors: Array<{ row: number; error: string }>;
  samplePayloadUrls?: string[];
  error?: string;
}

/**
 * Result of a routing test (dry run against staged records)
 */
export interface RoutingTestResult {
  success: boolean;
  error?: string;
  totalStaged: number;
  testedCount: number;
  results: Array<{
    row: number;
    externalId?: string;
    queueId: string | null;
    queueName?: string;
    ruleId?: string;
    ruleName?: string;
    error?: string;
  }>;
  queueVolume: Array<{ queueId: string; queueName: string; count: number }>;
  routingSummary: {
    totalRouted: number;
    totalUnrouted: number;
    totalErrors: number;
  };
}

/**
 * Impact summary for deleting a data source
 */
export interface LoaderDeleteImpact {
  found: boolean;
  loaderName?: string;
  runCount: number;
  pipelineName?: string;
  queueCount: number;
  routingRuleCount: number;
}
