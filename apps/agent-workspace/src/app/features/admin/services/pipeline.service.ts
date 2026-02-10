import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError } from 'rxjs';
import {
  Pipeline,
  PipelineQueue,
  RoutingRule,
  AgentPipelineAccess,
  PipelineSummary,
  PipelineWithDetails,
  CreatePipelineRequest,
  UpdatePipelineRequest,
  CreateQueueRequest,
  UpdateQueueRequest,
  CreateRoutingRuleRequest,
  UpdateRoutingRuleRequest,
} from '@nexus-queue/shared-models';

const API_BASE = 'http://localhost:3000/api/pipelines';
const QUEUES_API = 'http://localhost:3000/api/queues';

@Injectable({
  providedIn: 'root',
})
export class PipelineApiService {
  private http = inject(HttpClient);

  // ===========================================================================
  // PIPELINE CRUD
  // ===========================================================================

  /**
   * Get all pipelines
   */
  getAllPipelines(): Observable<Pipeline[]> {
    return this.http.get<Pipeline[]>(API_BASE).pipe(
      catchError((err) => {
        console.error('Failed to fetch pipelines:', err);
        return of([]);
      })
    );
  }

  /**
   * Get pipeline summaries for dashboard view
   */
  getPipelineSummaries(): Observable<PipelineSummary[]> {
    return this.http.get<PipelineSummary[]>(`${API_BASE}?summary=true`).pipe(
      catchError((err) => {
        console.error('Failed to fetch pipeline summaries:', err);
        return of([]);
      })
    );
  }

  /**
   * Get a specific pipeline by ID
   */
  getPipeline(id: string): Observable<Pipeline | null> {
    return this.http.get<Pipeline>(`${API_BASE}/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Get pipeline with full details (queues, rules, access)
   */
  getPipelineWithDetails(id: string): Observable<PipelineWithDetails | null> {
    return this.http.get<PipelineWithDetails>(`${API_BASE}/${id}?details=true`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Create a new pipeline
   */
  createPipeline(request: CreatePipelineRequest): Observable<Pipeline> {
    return this.http.post<Pipeline>(API_BASE, request);
  }

  /**
   * Update an existing pipeline
   */
  updatePipeline(id: string, request: UpdatePipelineRequest): Observable<Pipeline> {
    return this.http.put<Pipeline>(`${API_BASE}/${id}`, request);
  }

  /**
   * Get delete impact summary for a pipeline
   */
  getPipelineDeleteImpact(id: string): Observable<PipelineDeleteImpact> {
    return this.http.get<PipelineDeleteImpact>(`${API_BASE}/${id}/delete-impact`).pipe(
      catchError(() => of({
        found: false, queueCount: 0, routingRuleCount: 0, agentAccessCount: 0,
        queueNames: [], routingRuleNames: [],
      } as PipelineDeleteImpact))
    );
  }

  /**
   * Delete a pipeline. Use cascade=true to also delete all queues and routing rules.
   */
  deletePipeline(id: string, cascade = false): Observable<{ success: boolean }> {
    const url = cascade ? `${API_BASE}/${id}?cascade=true` : `${API_BASE}/${id}`;
    return this.http.delete<{ success: boolean }>(url);
  }

  /**
   * Enable a pipeline
   */
  enablePipeline(id: string): Observable<Pipeline> {
    return this.http.put<Pipeline>(`${API_BASE}/${id}/enable`, {});
  }

  /**
   * Disable a pipeline
   */
  disablePipeline(id: string): Observable<Pipeline> {
    return this.http.put<Pipeline>(`${API_BASE}/${id}/disable`, {});
  }

  // ===========================================================================
  // QUEUE CRUD
  // ===========================================================================

  /**
   * Get all queues
   */
  getAllQueues(): Observable<PipelineQueue[]> {
    return this.http.get<PipelineQueue[]>(QUEUES_API).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Get queues for a specific pipeline
   */
  getPipelineQueues(pipelineId: string): Observable<PipelineQueue[]> {
    return this.http.get<PipelineQueue[]>(`${API_BASE}/${pipelineId}/queues`).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Get a specific queue
   */
  getQueue(id: string): Observable<PipelineQueue | null> {
    return this.http.get<PipelineQueue>(`${QUEUES_API}/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  /**
   * Create a queue within a pipeline
   */
  createQueue(pipelineId: string, request: Omit<CreateQueueRequest, 'pipelineId'>): Observable<PipelineQueue> {
    return this.http.post<PipelineQueue>(`${API_BASE}/${pipelineId}/queues`, request);
  }

  /**
   * Update a queue
   */
  updateQueue(pipelineId: string, queueId: string, request: UpdateQueueRequest): Observable<PipelineQueue> {
    return this.http.put<PipelineQueue>(`${API_BASE}/${pipelineId}/queues/${queueId}`, request);
  }

  /**
   * Delete a queue. Use cascade=true to also remove routing rules targeting it.
   */
  deleteQueue(pipelineId: string, queueId: string, cascade = false): Observable<{ success: boolean }> {
    const url = cascade
      ? `${API_BASE}/${pipelineId}/queues/${queueId}?cascade=true`
      : `${API_BASE}/${pipelineId}/queues/${queueId}`;
    return this.http.delete<{ success: boolean }>(url);
  }

  // ===========================================================================
  // ROUTING RULES
  // ===========================================================================

  /**
   * Get routing rules for a pipeline
   */
  getRoutingRules(pipelineId: string): Observable<RoutingRule[]> {
    return this.http.get<RoutingRule[]>(`${API_BASE}/${pipelineId}/routing-rules`).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Create a routing rule
   */
  createRoutingRule(
    pipelineId: string,
    request: Omit<CreateRoutingRuleRequest, 'pipelineId'>
  ): Observable<RoutingRule> {
    return this.http.post<RoutingRule>(`${API_BASE}/${pipelineId}/routing-rules`, request);
  }

  /**
   * Update a routing rule
   */
  updateRoutingRule(
    pipelineId: string,
    ruleId: string,
    request: UpdateRoutingRuleRequest
  ): Observable<RoutingRule> {
    return this.http.put<RoutingRule>(`${API_BASE}/${pipelineId}/routing-rules/${ruleId}`, request);
  }

  /**
   * Delete a routing rule
   */
  deleteRoutingRule(pipelineId: string, ruleId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${API_BASE}/${pipelineId}/routing-rules/${ruleId}`);
  }

  // ===========================================================================
  // AGENT ACCESS
  // ===========================================================================

  /**
   * Get agent access for a pipeline
   */
  getPipelineAgents(pipelineId: string): Observable<AgentPipelineAccess[]> {
    return this.http.get<AgentPipelineAccess[]>(`${API_BASE}/${pipelineId}/agents`).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * Grant agent access to a pipeline
   */
  grantAgentAccess(
    pipelineId: string,
    agentId: string,
    accessLevel: 'full' | 'partial',
    queueIds?: string[]
  ): Observable<AgentPipelineAccess> {
    return this.http.post<AgentPipelineAccess>(`${API_BASE}/${pipelineId}/agents`, {
      agentId,
      accessLevel,
      queueIds,
    });
  }

  /**
   * Revoke agent access from a pipeline
   */
  revokeAgentAccess(pipelineId: string, agentId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${API_BASE}/${pipelineId}/agents/${agentId}`);
  }
}

/**
 * Impact summary for deleting a pipeline
 */
export interface PipelineDeleteImpact {
  found: boolean;
  pipelineName?: string;
  queueCount: number;
  routingRuleCount: number;
  agentAccessCount: number;
  queueNames: string[];
  routingRuleNames: string[];
}
